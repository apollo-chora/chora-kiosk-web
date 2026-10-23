import { Injectable, computed, inject, signal } from '@angular/core';

import { englishString } from '../i18n/i18n';
import { ManifestService, type PreparedChoice, type PrewarmManifest } from '../kiosk-api/manifest.service';
import { criticVerdict, type CriticVerdict } from '../live/kinds/critic-verdict';
import type { PictureMode, PictureParams, PictureResult, RegenTraceStep } from '../live/kinds/picture.live';
import { wordRevisionPrompt } from '../live/kinds/word-revision';
import type { CandidateDraft, WordsParams, WordsResult } from '../live/kinds/words.live';
import { LIVE_KINDS, type LiveKind } from '../live/live-kinds';
import { LiveService, type LiveKey, type LiveOutcome } from '../live/live.service';
import { QuestionJobsService, type KioskDraftCandidate } from '../product-api/question-jobs.service';
import {
  validateEditableQuestion,
  type EditableQuestion,
} from '../shared/components/chora-question-editor/chora-question-editor.model';

/** K203 (W87): the pre-filled request after the first photo, and the prepared choice made for exactly it. */
export interface TanksOffer {
  readonly prefill: string;
  readonly key: string;
}

/** The one LIVE key of step 4a: every words call (a typed change, a LIVE chip, a redo) shows on one row. */
export const WORDS_LIVE_KEY = 'words:hook:h4';
/** The one LIVE key of step 4b, for every picture call. */
export const PICTURE_LIVE_KEY = 'picture:hook:h4b';
const DRAFT_KEY = 'draft.h4';

/** K187: the scenario chip took the place of "Replace the option that could also be right" (`fixd`). */
export type WordChip = 'scenario' | 'simpler' | 'explain';
export const WORD_CHIPS: readonly WordChip[] = ['scenario', 'simpler', 'explain'];
/** A chip's letter in its prepared choice's key (`words.r.s` is scenario, then simpler). */
const LETTER: Readonly<Record<WordChip, string>> = { scenario: 'r', simpler: 's', explain: 'e' };

/** Step 4b's chips: the diagram's changes (a SET), the illustration, then its restyles. */
export type DiagramChip = 'uv' | 'where';
export type PictureChip = DiagramChip | 'illus' | 'sketch' | 'photo';
const DIAGRAM_ORDER: readonly DiagramChip[] = ['uv', 'where'];
/** `scene`: a scene a typed change made, so the visitor's words, not a chip, name its style (W10). */
export type PictureStyle = 'diagram' | 'flat' | 'sketch' | 'photo' | 'scene';

/** The picture on screen: one of the chain draft's pictures (K113). */
export interface StudioPicture {
  readonly imageUrl: string;
  readonly imageGcsUri: string | null;
  readonly mode: PictureMode;
  readonly style: PictureStyle;
  /** The diagram changes it shows, in the prepared keys' order. */
  readonly set: readonly DiagramChip[];
  /** The prompt that drew it (a diagram's is cumulative); null for the draft's own first picture. */
  readonly prompt: string | null;
}

interface PictureChange {
  readonly from: StudioPicture;
  readonly prompt: string;
  readonly mode: PictureMode;
  readonly chip: PictureChip | null;
  readonly typed: string | null;
}

/** The question on screen: a job's draft, with the teacher's hand edits applied. */
export interface StudioDraft {
  readonly atomId: string;
  /** The job and draft "Keep" accepts (step 4b, K56): a hand edit keeps them and travels as overrides. */
  readonly jobId: string;
  readonly draftId: string;
  readonly question: EditableQuestion;
  readonly critic: CriticVerdict | null;
}

/** One version after v1, in the order the visitor made them (the history is append-only). */
export interface StudioRevision {
  readonly n: number;
  readonly part: 'a' | 'b';
  readonly how: 'prepared' | 'live' | 'hand';
  readonly chip: WordChip | PictureChip | null;
  readonly typed: string | null;
  /** When the visitor applied it. */
  readonly at: Date;
  /** The prepared record's own time (K101); null for a live result or a hand edit. */
  readonly madeAt: Date | null;
  /** A prepared picture's image model, as its run stamped it (K72); absent otherwise. */
  readonly model?: string;
  /** K150: the stages a live picture change's job ran (Behind the scenes shows only these); absent otherwise. */
  readonly trace?: readonly RegenTraceStep[] | null;
}

/** The last words change's state beyond what the LIVE row shows. */
export type StudioChange =
  | { readonly state: 'none' }
  | { readonly state: 'reading' }
  | { readonly state: 'failed'; readonly key: string; readonly params?: Readonly<Record<string, string>> };

interface LastChange {
  readonly from: StudioDraft;
  readonly instruction: string;
  readonly chip: WordChip | null;
  readonly typed: string | null;
}

/**
 * Step 4a, the words (mockup studioAHTML, lines 4326 to 4342; K34, K35): the golden run's draft
 * (`draft.h4`) read from its own job, with the critic's notes from that job's trace. Each word chip
 * is a NEW draft: on a prepared path it is the prepared choice for that PATH of chips
 * (`words.<r|s|e>...`, PREPARED-CHOICES.md section 7), read from its job. A hand edit (production's
 * question editor), a typed change or a LIVE redo leaves the prepared paths; from then on a chip
 * runs LIVE words with the same template and the chip's own instruction, or is off with LIVE off.
 */
@Injectable({ providedIn: 'root' })
export class TeacherStudio {
  private readonly manifests = inject(ManifestService);
  private readonly jobs = inject(QuestionJobsService);
  private readonly live = inject(LiveService);
  /** W79: the key of a press the studio makes itself (a chip, a typed change); it applies that result where it awaits it. */
  private ownPress: LiveKey | null = null;

  constructor() {
    // W79: the LIVE rows' redo outcomes come from the one LIVE door, so a redo answered after step 4a or 4b
    // was left still lands; the rows bind none. The studio's own presses are applied once, where awaited.
    this.live.onOutcome((key, o) => {
      if (key === this.ownPress) return;
      if (key === WORDS_LIVE_KEY) this.onRedoOutcome(o);
      else if (key === PICTURE_LIVE_KEY) this.onPictureRedoOutcome(o);
    });
  }

  private readonly statusSig = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly manifestSig = signal<PrewarmManifest | null>(null);
  private readonly draftSig = signal<StudioDraft | null>(null);
  private readonly firstPreparedAtSig = signal<Date | null>(null);
  private readonly revisionsSig = signal<readonly StudioRevision[]>([]);
  private readonly usedSig = signal<ReadonlySet<WordChip>>(new Set());
  private readonly pathSig = signal<readonly WordChip[]>([]);
  private readonly preparedSig = signal(true);
  private readonly editingSig = signal(false);
  private readonly changeSig = signal<StudioChange>({ state: 'none' });
  private readonly lastChangeSig = signal<LastChange | null>(null);
  private readonly chainSig = signal<{ readonly atomId: string; readonly jobId: string; readonly draftId: string } | null>(null);
  private readonly firstCriticSig = signal<CriticVerdict | null>(null);
  private readonly pictureSig = signal<StudioPicture | null>(null);
  private readonly picturePreparedSig = signal(true);
  private readonly lastPictureSig = signal<PictureChange | null>(null);
  /** K203 (W87): the request offered after the first photo, until the next change. */
  private readonly tanksSig = signal<TanksOffer | null>(null);
  private readonly keptSig = signal<{ readonly n: number } | null>(null);
  private loading: Promise<void> | null = null;

  readonly status = this.statusSig.asReadonly();
  readonly draft = this.draftSig.asReadonly();
  /** v1's stamp: the golden run's record time (K101). */
  readonly firstPreparedAt = this.firstPreparedAtSig.asReadonly();
  readonly revisions = this.revisionsSig.asReadonly();
  /** Each chip is used once. */
  readonly used = this.usedSig.asReadonly();
  /** The draft on screen is a prepared choice (no hand edit, typed change or LIVE redo yet). */
  readonly prepared = this.preparedSig.asReadonly();
  readonly editing = this.editingSig.asReadonly();
  readonly change = this.changeSig.asReadonly();

  /** Off a prepared path every chip is a LIVE call. */
  readonly chipsLive = computed(() => !this.preparedSig());
  private readonly wordsOn = this.live.canPress('words');
  /** A chip can run now: prepared, or LIVE with words on. */
  readonly canChip = computed(() => this.preparedSig() || this.wordsOn());
  /** The last 4a revision, for the draft's label. */
  readonly lastWords = computed(() => this.revisionsSig().filter((r) => r.part === 'a').slice(-1)[0] ?? null);
  /** The version the critic last checked: v1, or the last AI-written words version (hand edits are not re-checked). */
  readonly criticCheckedVersion = computed(() => this.revisionsSig().filter((r) => r.part === 'a' && r.how !== 'hand').slice(-1)[0]?.n ?? 1);

  /** "Redo it": the last change again, LIVE, from the draft it was made on; none after a hand edit (it would throw the edit away). */
  readonly redoParams = computed<WordsParams | null>(() => {
    const last = this.lastChangeSig();
    const rev = this.lastWords();
    if (!last || !rev || rev.how === 'hand') return null;
    return this.wordsParams(last.from, last.instruction);
  });

  /** K189 (3): the last typed words change, the same words again being no new request (none after a hand edit). */
  readonly lastTyped = computed(() => this.lastChangeSig()?.typed ?? null);
  /** The picture on screen (step 4b). */
  readonly picture = this.pictureSig.asReadonly();
  /** The picture on screen is a prepared choice (no typed change or LIVE redo yet). */
  readonly picturePrepared = this.picturePreparedSig.asReadonly();
  /** The version "Keep" accepted (K56), or null. */
  readonly kept = this.keptSig.asReadonly();
  /** The critic's verdict on the chain's draft, the one that saw the first picture. */
  readonly firstCritic = this.firstCriticSig.asReadonly();
  private readonly pictureOn = this.live.canPress('picture');
  readonly canPictureChip = computed(() => this.picturePreparedSig() || this.pictureOn());
  readonly pictureChips = computed<readonly PictureChip[]>(() => (this.pictureSig()?.style === 'diagram' ? ['uv', 'where', 'illus'] : ['sketch', 'photo']));
  /** A diagram change shown, the illustration made, or the style on screen: each cannot be asked for again. */
  readonly pictureUsed = computed<ReadonlySet<PictureChip>>(() => {
    const p = this.pictureSig();
    if (!p) return new Set();
    const used = new Set<PictureChip>(p.set);
    if (p.style !== 'diagram') used.add('illus');
    if (p.style === 'sketch' || p.style === 'photo') used.add(p.style);
    return used;
  });
  readonly lastPicture = computed(() => this.revisionsSig().filter((r) => r.part === 'b').slice(-1)[0] ?? null);
  /**
   * A picture change is on screen (any chip or typed change, prepared or live), so the critic's note on the
   * draft's first picture gives way to "picture changes are not re-checked" (K155: the golden run's critic
   * asked for no change, so the note no longer waits for a particular one).
   */
  readonly pictureChanged = computed(() => this.lastPicture() !== null);
  /** K189 (3): the last typed picture change. */
  readonly lastPictureTyped = computed(() => this.lastPictureSig()?.typed ?? null);
  /**
   * K203 (W87): after the first "Make it photorealistic", the caption and the pre-filled request for steel
   * tanks; `key` is the prepared choice made for exactly that request from the photo on screen, its prompt
   * the pre-fill (the list's own words, English in every language, K41). Null once any other change starts.
   */
  readonly tanksOffer = this.tanksSig.asReadonly();
  readonly pictureRedoParams = computed<PictureParams | null>(() => {
    const last = this.lastPictureSig();
    return last && this.lastPicture() ? this.pictureParams(last.from, last.prompt, last.mode) : null;
  });

  /** Reads v1; a second call while one reads joins it. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.read().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async read(): Promise<void> {
    this.statusSig.set('loading');
    try {
      const m = await this.manifests.load();
      this.manifestSig.set(m);
      const choice = m.choice(DRAFT_KEY, 'question_draft');
      const r = choice.records;
      if (!r.image_url || !r.image_mode) throw new Error(`[kiosk] ${DRAFT_KEY} records no picture: step 4b has nothing to direct`);
      const first = await this.readDraft(r.atom_id, r.job_id, r.draft_id);
      this.draftSig.set(first);
      this.firstCriticSig.set(first.critic);
      this.chainSig.set({ atomId: r.atom_id, jobId: r.job_id, draftId: r.draft_id });
      this.pictureSig.set({ imageUrl: r.image_url, imageGcsUri: r.image_gcs_uri, mode: r.image_mode, style: r.image_mode === 'mermaid' ? 'diagram' : 'flat', set: [], prompt: null });
      this.firstPreparedAtSig.set(choice.preparedAt);
      this.statusSig.set('ready');
    } catch (err: unknown) {
      console.error(`[kiosk] step 4 could not read its draft: ${message(err)}`);
      this.statusSig.set('failed');
    }
  }

  /** A word chip: the prepared draft for this path, or LIVE words off a prepared path. */
  async chip(c: WordChip): Promise<void> {
    if (this.usedSig().has(c) || this.busy() || !this.draftSig()) return;
    const m = this.manifestSig() as PrewarmManifest;
    if (!this.preparedSig()) {
      if (!this.wordsOn()) return;
      const instruction = m.choice(`words.${LETTER[c]}`, 'word_revision').params['instruction'];
      if (typeof instruction !== 'string') throw new Error(`[kiosk] prepared choice words.${LETTER[c]} names no instruction`);
      return this.pressLive(this.draftSig() as StudioDraft, instruction, c, null);
    }
    this.changeSig.set({ state: 'reading' });
    try {
      const key = `words.${[...this.pathSig(), c].map((x) => LETTER[x]).join('.')}`;
      const choice = m.choice(key, 'word_revision');
      const next = await this.readDraft(choice.records.atom_id, choice.records.job_id, choice.records.draft_id);
      const instruction = String(choice.params['instruction']);
      this.lastChangeSig.set({ from: this.draftSig() as StudioDraft, instruction, chip: c, typed: null });
      this.draftSig.set(next);
      this.pathSig.update((p) => [...p, c]);
      this.usedSig.update((u) => new Set([...u, c]));
      this.push({ part: 'a', how: 'prepared', chip: c, typed: null, madeAt: choice.preparedAt });
      // The LIVE row now labels this prepared draft, not an earlier live result or miss.
      this.live.clear(WORDS_LIVE_KEY);
      this.changeSig.set({ state: 'none' });
    } catch (err: unknown) {
      console.error(`[kiosk] step 4a could not read the prepared draft for ${c}: ${message(err)}`);
      this.changeSig.set({ state: 'failed', key: 'hook.loadFailed' });
    }
  }

  /** A typed change: LIVE words with the visitor's own instruction (it has no prepared twin). */
  async typed(text: string): Promise<void> {
    const instruction = text.trim();
    if (!instruction || this.busy() || !this.draftSig() || !this.wordsOn()) return;
    return this.pressLive(this.draftSig() as StudioDraft, instruction, null, instruction);
  }

  /** The LIVE row's redo ended: a new version, or the result on screen stays (the row labels a miss, K45). */
  onRedoOutcome(o: LiveOutcome): void {
    const last = this.lastChangeSig();
    if (!last || o.status === 'stopped') return;
    if (o.status === 'done') return this.applyLive(o.result as WordsResult, last);
    if (this.lastWords()?.how !== 'prepared') this.missed('words', o.reason);
  }

  /**
   * A picture chip: the prepared picture for this SET or restyle while the picture on screen is
   * prepared. After a live change (K148) the chip is the visitor's typed change in the chip's own
   * English words, the request "Send to the AI" makes for them, never the list's long prompt; a
   * late, failed or declined call shows the chip's prepared picture instead, labelled (K45), so a
   * chip always changes the picture.
   */
  async picChip(c: PictureChip): Promise<void> {
    const from = this.pictureSig();
    if (!from || this.busy() || this.pictureUsed().has(c) || !this.pictureChips().includes(c)) return;
    if (!this.picturePreparedSig() && !this.pictureOn()) return;
    this.tanksSig.set(null);
    let choice: PreparedChoice<'picture_regen'>;
    try {
      choice = (this.manifestSig() as PrewarmManifest).choice(pictureKey(c, from), 'picture_regen');
    } catch (err: unknown) {
      console.error(`[kiosk] step 4b has no prepared picture for ${c}: ${message(err)}`);
      this.changeSig.set({ state: 'failed', key: 'hook.loadFailed' });
      return;
    }
    if (this.picturePreparedSig()) {
      this.showPrepared(c, from, choice, { from, prompt: String(choice.params['prompt']), mode: choice.records.mode, chip: c, typed: null });
      // The LIVE row now labels this prepared picture, not an earlier live result or miss.
      this.live.clear(PICTURE_LIVE_KEY);
      if (c === 'photo') this.offerTanks(pictureKey(c, from));
      return;
    }
    // K150: the chip's own target decides the mode, so a diagram turned into an illustration is an edit of it.
    const mode: PictureMode = styleAfter(c) === 'diagram' ? 'mermaid' : 'scene';
    const words = englishString(`chip.${c}`);
    const attempt: PictureChange = { from, prompt: mode === 'mermaid' ? typedPrompt(from, words) : words, mode, chip: c, typed: null };
    const o = await this.pressPicture(attempt);
    // The row keeps saying the live call missed; its "Try again" is the chip's words again.
    if (o?.status === 'missed') this.showPrepared(c, from, choice, attempt);
    if (c === 'photo' && (o?.status === 'done' || o?.status === 'missed')) this.offerTanks(pictureKey(c, from));
  }

  /** K203: offers the tanks request after the photo, from the list's choice for it (a choice missing from the manifest is said loudly). */
  private offerTanks(photoKey: string): void {
    const key = `${photoKey}.tanks`;
    try {
      const choice = (this.manifestSig() as PrewarmManifest).choice(key, 'picture_regen');
      this.tanksSig.set({ prefill: String(choice.params['prompt']), key });
    } catch (err: unknown) {
      console.error(`[kiosk] step 4b has no prepared ${key} for the tanks request (K203): ${message(err)}`);
    }
  }

  /** A typed change to the picture: LIVE picture with the visitor's words (a diagram's prompt is cumulative). */
  async picTyped(text: string): Promise<void> {
    const words = text.trim();
    const from = this.pictureSig();
    if (!words || !from || this.busy() || !this.pictureOn()) return;
    const offer = this.tanksSig();
    this.tanksSig.set(null);
    const attempt: PictureChange = { from, prompt: typedPrompt(from, words), mode: from.mode, chip: null, typed: words };
    const o = await this.pressPicture(attempt);
    // K203: the unedited pre-fill falls back to its prepared choice, labelled as prepared; the row keeps its miss.
    if (o?.status === 'missed' && offer && words === offer.prefill) return this.showPreparedTyped(from, (this.manifestSig() as PrewarmManifest).choice(offer.key, 'picture_regen'), attempt);
    if (o?.status === 'missed') {
      // The failure line says what happened; the row's "Try again" would redo the last change, not this one.
      this.live.clear(PICTURE_LIVE_KEY);
      this.missed('picture', o.reason);
    }
  }

  /** The picture LIVE row's redo ended. */
  onPictureRedoOutcome(o: LiveOutcome): void {
    const last = this.lastPictureSig();
    if (!last || o.status === 'stopped') return;
    if (o.status === 'done') return this.applyPicture(o.result as PictureResult, last);
    if (this.lastPicture()?.how !== 'prepared') this.missed('picture', o.reason);
  }

  /** "Keep and continue" (K56): the 4a draft's job, its words as overrides and the picture on screen (K113). */
  async keep(): Promise<void> {
    const d = this.draftSig();
    const p = this.pictureSig();
    if (!d || !p || this.keptSig() || this.busy()) return;
    try {
      await this.jobs.accept(d.atomId, d.jobId, {
        accepted_candidates: [
          {
            draft_id: d.draftId,
            prompt_override: d.question.prompt,
            mcq_payload_override: {
              options: d.question.options.map((o) => ({ option_id: o.option_id ?? '', label: o.label, is_correct: o.is_correct, explainer: o.explainer })),
            },
            image_url: p.imageUrl,
          },
        ],
      });
      this.keptSig.set({ n: this.revisionsSig().length + 1 });
    } catch (err: unknown) {
      console.error(`[kiosk] step 4b could not keep the question: ${message(err)}`);
      this.changeSig.set({ state: 'failed', key: 'hook.loadFailed' });
    }
  }

  startEdit(): void {
    if (this.draftSig() && !this.busy()) this.editingSig.set(true);
  }

  cancelEdit(): void {
    this.editingSig.set(false);
  }

  /** Saves the teacher's own words: a new version on the same job, never re-checked by the critic. */
  saveEdit(q: EditableQuestion): void {
    const d = this.draftSig();
    if (!d || !this.editingSig() || !validateEditableQuestion(q).valid) return;
    this.editingSig.set(false);
    if (JSON.stringify(q) === JSON.stringify(d.question)) return;
    this.draftSig.set({ ...d, question: q });
    this.preparedSig.set(false);
    this.lastChangeSig.set(null);
    this.changeSig.set({ state: 'none' });
    // The words on screen are the teacher's now: no live result labels them.
    this.live.clear(WORDS_LIVE_KEY);
    this.push({ part: 'a', how: 'hand', chip: null, typed: null, madeAt: null });
  }

  /** A new visitor starts on a fresh read. */
  forget(): void {
    this.statusSig.set('idle');
    this.manifestSig.set(null);
    this.draftSig.set(null);
    this.firstPreparedAtSig.set(null);
    this.revisionsSig.set([]);
    this.usedSig.set(new Set());
    this.pathSig.set([]);
    this.preparedSig.set(true);
    this.editingSig.set(false);
    this.changeSig.set({ state: 'none' });
    this.lastChangeSig.set(null);
    this.chainSig.set(null);
    this.firstCriticSig.set(null);
    this.pictureSig.set(null);
    this.picturePreparedSig.set(true);
    this.lastPictureSig.set(null);
    this.tanksSig.set(null);
    this.keptSig.set(null);
  }

  private busy(): boolean {
    return (
      this.changeSig().state === 'reading' ||
      this.live.state(WORDS_LIVE_KEY)()?.status === 'calling' ||
      this.live.state(PICTURE_LIVE_KEY)()?.status === 'calling'
    );
  }

  /** Presses LIVE picture and shows a result; a miss is the caller's to handle. Null: the press was refused (said loudly). */
  private async pressPicture(change: PictureChange): Promise<LiveOutcome | null> {
    this.changeSig.set({ state: 'none' });
    // A new change is a new request (K189), never a repeat of the last one's live result (K186).
    this.live.clear(PICTURE_LIVE_KEY);
    let o: LiveOutcome;
    this.ownPress = PICTURE_LIVE_KEY;
    try {
      o = await this.live.press(PICTURE_LIVE_KEY, 'picture', this.pictureParams(change.from, change.prompt, change.mode));
    } catch (err: unknown) {
      console.error(`[kiosk] step 4b could not press LIVE picture: ${message(err)}`);
      this.changeSig.set({ state: 'failed', key: 'live.typedFailed' });
      return null;
    } finally {
      this.ownPress = null;
    }
    if (o.status === 'done') this.applyPicture(o.result as PictureResult, change);
    return o;
  }

  /** A chip's prepared picture on screen; `last` is what the row's redo runs again. */
  private showPrepared(c: PictureChip, from: StudioPicture, choice: PreparedChoice<'picture_regen'>, last: PictureChange): void {
    const r = choice.records;
    this.pictureSig.set({ imageUrl: r.image_url, imageGcsUri: r.image_gcs_uri, mode: r.mode, style: styleAfter(c), set: setAfter(c, from), prompt: String(choice.params['prompt']) });
    this.lastPictureSig.set(last);
    this.picturePreparedSig.set(true);
    this.changeSig.set({ state: 'none' });
    const model = choice.models?.['image'];
    this.push({ part: 'b', how: 'prepared', chip: c, typed: null, madeAt: choice.preparedAt, ...(model ? { model } : {}) });
  }

  /** K203: the tanks request's prepared picture on screen, after its live call missed: a photo, labelled as prepared. */
  private showPreparedTyped(from: StudioPicture, choice: PreparedChoice<'picture_regen'>, last: PictureChange): void {
    const r = choice.records;
    this.pictureSig.set({ imageUrl: r.image_url, imageGcsUri: r.image_gcs_uri, mode: r.mode, style: 'photo', set: from.set, prompt: String(choice.params['prompt']) });
    this.lastPictureSig.set(last);
    this.picturePreparedSig.set(true);
    this.changeSig.set({ state: 'none' });
    const model = choice.models?.['image'];
    this.push({ part: 'b', how: 'prepared', chip: null, typed: last.typed, madeAt: choice.preparedAt, ...(model ? { model } : {}) });
  }

  private applyPicture(r: PictureResult, change: PictureChange): void {
    const c = change.chip;
    this.pictureSig.set({
      imageUrl: r.imageUrl,
      imageGcsUri: r.imageGcsUri,
      mode: r.mode,
      // A chip sent as typed words on a diagram comes back a diagram (K148's illustration chip), and says so;
      // a typed change is a diagram or a scene of the visitor's words, never the style it started from (W10).
      style: r.mode === 'mermaid' ? 'diagram' : c ? styleAfter(c) : 'scene',
      set: c ? setAfter(c, change.from) : change.from.set,
      prompt: change.prompt,
    });
    this.lastPictureSig.set(change);
    this.picturePreparedSig.set(false);
    this.changeSig.set({ state: 'none' });
    this.push({ part: 'b', how: 'live', chip: c, typed: change.typed, madeAt: null, trace: r.trace ?? null });
  }

  /**
   * A regenerate on the chain's draft. K150: every change names the picture it starts from as its
   * source, the model's baseline: a change ending in a scene is a direct edit of it, a diagram's
   * writer gets the diagram. Creation refuses a picture not its own (422 CREATION_REGEN_SOURCE_NOT_OWN),
   * which the press reports loudly.
   */
  private pictureParams(from: StudioPicture, prompt: string, mode: PictureMode): PictureParams {
    const chain = this.chainSig();
    if (!chain) throw new Error('[kiosk] step 4b has no draft to draw on');
    if (!from.imageGcsUri) throw new Error('[kiosk] step 4b: the picture on screen records no image_gcs_uri, so no change can start from it (K150)');
    return { ...chain, prompt, mode, sourceImageGcsUri: from.imageGcsUri };
  }

  private async pressLive(from: StudioDraft, instruction: string, chip: WordChip | null, typed: string | null): Promise<void> {
    this.changeSig.set({ state: 'none' });
    // A new change is a new request (K189), never a repeat of the last one's live result (K186).
    this.live.clear(WORDS_LIVE_KEY);
    let o: LiveOutcome;
    this.ownPress = WORDS_LIVE_KEY;
    try {
      o = await this.live.press(WORDS_LIVE_KEY, 'words', this.wordsParams(from, instruction));
    } catch (err: unknown) {
      console.error(`[kiosk] step 4a could not press LIVE words: ${message(err)}`);
      this.changeSig.set({ state: 'failed', key: 'live.typedFailed' });
      return;
    } finally {
      this.ownPress = null;
    }
    if (o.status === 'done') this.applyLive(o.result as WordsResult, { from, instruction, chip, typed });
    else if (o.status === 'missed') {
      // The failure line says what happened; the row's "Try again" would redo the last change, not this one.
      this.live.clear(WORDS_LIVE_KEY);
      this.missed('words', o.reason);
    }
  }

  /** A missed LIVE change with nothing prepared behind it: the visitor is told (K45, K48). */
  private missed(kind: LiveKind, reason: 'late' | 'failed'): void {
    this.changeSig.set(
      reason === 'late' ? { state: 'failed', key: 'live.typedLate', params: { s: String(LIVE_KINDS[kind].limitMs / 1000) } } : { state: 'failed', key: 'live.typedFailed' },
    );
  }

  private applyLive(r: WordsResult, change: LastChange): void {
    const d = this.draftSig() as StudioDraft;
    this.draftSig.set({ atomId: d.atomId, jobId: r.jobId, draftId: r.draft.draft_id, question: editable(r.draft), critic: r.critic });
    this.lastChangeSig.set(change);
    this.preparedSig.set(false);
    if (change.chip) this.usedSig.update((u) => new Set([...u, change.chip as WordChip]));
    this.changeSig.set({ state: 'none' });
    this.push({ part: 'a', how: 'live', chip: change.chip, typed: change.typed, madeAt: null });
  }

  private push(r: Omit<StudioRevision, 'n' | 'at'>): void {
    this.revisionsSig.update((list) => [...list, { n: list.length + 2, at: new Date(), ...r }]);
  }

  private wordsParams(from: StudioDraft, instruction: string): WordsParams {
    const m = this.manifestSig() as PrewarmManifest;
    const q = from.question;
    return {
      atomId: from.atomId,
      questionType: 'mcq',
      prompt: wordRevisionPrompt(m.wordRevisionTemplate, { prompt: q.prompt, mcq_payload: { options: q.options } }, instruction),
      // 4a changes the words; the picture is 4b's, on the chain's draft (PREPARED-CHOICES.md 5.5).
      imageForStem: false,
    };
  }

  private async readDraft(atomId: string, jobId: string, draftId: string): Promise<StudioDraft> {
    const job = await this.jobs.read(atomId, jobId);
    const draft = this.jobs.draft(job, draftId);
    return { atomId, jobId, draftId, question: editable(draft), critic: criticVerdict(job.pipeline_trace) };
  }
}

/** The prepared choice for a picture chip: diagram changes per SET, restyles per (from, to). */
function pictureKey(c: PictureChip, from: StudioPicture): string {
  if (c === 'uv' || c === 'where') return `pic.${setAfter(c, from).join('.')}`;
  if (c === 'illus') return 'pic.illus';
  // A typed scene has no prepared restyles of its own, so its fallback is the illustration's (K148).
  return `pic.${from.style === 'flat' || from.style === 'scene' ? 'illus' : from.style}.${c}`;
}

/** The prompt "Send to the AI" sends for these words: a diagram's prompt is cumulative, a scene's is the words alone. */
function typedPrompt(from: StudioPicture, words: string): string {
  return from.mode === 'mermaid' && from.prompt ? `${from.prompt}\n${words}` : words;
}

function styleAfter(c: PictureChip): PictureStyle {
  if (c === 'uv' || c === 'where') return 'diagram';
  return c === 'illus' ? 'flat' : c;
}

function setAfter(c: PictureChip, from: StudioPicture): readonly DiagramChip[] {
  return c === 'uv' || c === 'where' ? DIAGRAM_ORDER.filter((x) => x === c || from.set.includes(x)) : from.set;
}

/** A multiple-choice draft as production's question editor holds it. */
function editable(d: KioskDraftCandidate | CandidateDraft): EditableQuestion {
  const options = d.mcq_payload?.options;
  if (!options) throw new Error(`[kiosk] draft ${d.draft_id} is not a multiple-choice question`);
  return {
    question_type: 'mcq',
    prompt: d.prompt,
    options: options.map((o) => ({ option_id: o.option_id || null, label: o.label, is_correct: o.is_correct === true, explainer: o.explainer ?? '' })),
    model_answer: '',
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
