import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { ConceptGraphService } from '../../aplus/discovery-graph/concept-graph.service';
import { getQuestionType, type LearningAtom, type McqQuestionPayload } from '../../aplus/atomic-session/atomic-session.model';
import type { FamiliarGrowthState, GrowthEventRecord } from '../../core/familiar/familiar-growth.model';
import { ManifestService, type PreparedChoice, type PrewarmManifest } from '../../kiosk-api/manifest.service';
import { PreparedGreetings, type Greeting } from '../../live/kinds/greet.live';
import { questionAt, type QResult } from '../../live/kinds/q.live';
import { liveRows } from '../../shared/sugg/sugg-list';
import { LiveService, type LiveOutcome } from '../../live/live.service';
import type { HookFresh } from '../../story/hook-story';
import { CampaignPracticeService, type CampaignQuestion } from '../../aplus/daily-dose/campaign-practice/campaign-practice.service';
import type { CampaignAnswerResult } from '../../aplus/my-knowledge/campaign.model';
import type { MapGraph } from '../../aplus/my-knowledge/maps.model';
import { MapsService } from '../../aplus/my-knowledge/maps.service';
import { AtomsService } from '../../product-api/atoms.service';
import { CompanionsService } from '../../product-api/companions.service';
import { DoseService, type DoseRead } from '../../product-api/dose.service';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { VisitTally } from '../../shared/visit-tally';
import { servePrepared } from '../prepared-practice';
import { GOAL_KEYS } from '../world-goals';
import { ABILITY_WORDS, REASON_WORDS, SKILL_WORDS } from './companion-words';
import { CompanionWeakness, type WeakDoc } from './companions-weak';
import { KioskStore } from '../../shell/kiosk.store';
import type { Arrival } from '../../shell/tour/kiosk-tour';

/** A won hex's credits land through Pub/Sub (no HTTP route sets EXP): the ledger is read until it lists them. */
export const GROWTH_POLL_MS = 1000;
export const GROWTH_POLL_TRIES = 15;

/**
 * What a winning answer earns (K135): it also clears the last rung, so consumption credits both,
 * as two separate events (campaign/grader.go; growth/curve.go: 8 and 25 EXP).
 */
const WIN_CREDITS = ['campaign_rung_cleared', 'campaign_node_won'] as const;
/** The Companions' LIVE keys: fresh ideas (Suggest's and the won hex's ask) and the quiz end in the idea's id; the greeting and the essay's read (K206) in the Companion's. */
const SUGG_KEY = 'sugg:comp:';
const Q_KEY = 'q:comp:';
const GREET_KEY = 'greet:comp:';
const WEAK_KEY = 'weak:comp:';

/** What a dose answer earns: consumption credits the ACTIVE Companion atom_session (3 right, 1 wrong; K102). */
const ANSWER_CREDITS = ['atom_session'] as const;

/**
 * What opening a dose earns (W37): the read publishes daily_dose.served and consumption credits the
 * ACTIVE Companion +2, capped at 2 a day (companion_growth_subscriber.go, growth/curve.go), so only a
 * visit's first dose earns it (every reset restores a ledger with no row dated today).
 */
const DOSE_OPEN_CREDITS = ['daily_dose_open'] as const;

/** A Companion's four abilities, as the drawer opens them. */
export type CompanionAbility = 'suggest' | 'quiz' | 'dose' | 'weak';

export type CompanionQuiz =
  | { readonly state: 'none' | 'loading' | 'failed' }
  | {
      readonly state: 'ready';
      readonly question: CampaignQuestion;
      /** The prepared set's own time (K101): the LIVE row's stamp. */
      readonly preparedAt: Date;
      /** Set when a LIVE q press replaced the question: the answer is graded against that set (K103). */
      readonly freshSetId?: string;
    };

export type CompanionAnswer =
  | { readonly state: 'none' }
  | { readonly state: 'checking' | 'failed'; readonly selected: string }
  | { readonly state: 'done'; readonly selected: string; readonly result: CampaignAnswerResult };

/** A Companion's dose this visit: read once, then stepped through (mockup state.visit.doseIdx). */
export type CompanionDose =
  | { readonly state: 'loading' | 'failed' }
  | {
      readonly state: 'ready';
      readonly read: DoseRead;
      /** Each card's atom (its body and its question); null when the read failed or has no body (said loudly). */
      readonly atoms: ReadonlyMap<string, LearningAtom | null>;
      readonly index: number;
    };

/** One dose card's answer (mockup cxqAnswer): graded on the server; the EXP named from the ledgers (K102). */
export type DoseAnswer =
  | { readonly state: 'checking' | 'failed'; readonly selected: string }
  | {
      readonly state: 'done';
      readonly selected: string;
      readonly correct: boolean;
      /** The picked option's own explanation, when the question carries one. */
      readonly explainer: string | null;
      /** The Companion the ledger shows credited and its EXP; 'waiting' until it lands; null if it never did. */
      readonly credit: { readonly companionId: string; readonly name: string; readonly exp: number } | 'waiting' | null;
    };

/** The rail's greeting: the golden run's turn replayed (K49), and the last LIVE one, if any. */
export interface CompanionGreeting {
  readonly prepared: { readonly text: string; readonly model: string; readonly preparedAt: Date } | null;
  readonly live: Greeting | null;
}

/** A won hex's growth (mockup profileSheetHTML with stageUp): the sheet before and after, from the reads. */
export interface CompanionGrew {
  readonly companionId: string;
  /** The concept the win took (the greeting prepared before it says so, cx.dose.aiGreetingBefore). */
  readonly wonTitle: string;
  readonly from: FamiliarGrowthState;
  readonly to: FamiliarGrowthState;
  /** The EXP the win's credits awarded, summed from the ledger. */
  readonly gained: number;
  /** Production's stage-up reveals (familiar-stage-up-overlay): set only when the stage changed. */
  readonly stageUp: {
    readonly slots: number;
    /** The skills granted at the new stage, and whether Chora has switched each on (catalogueActive). */
    readonly woke: readonly { readonly key: string; readonly active: boolean }[];
    /** The tools the new stage added to the kit (the growth reads' unlockedTools, before and after). */
    readonly abilities: readonly string[];
  } | null;
}

/** A fresh batch as the drawer's list takes it (freshGroup). */
export interface CompanionFresh {
  readonly source: 'live' | 'prepared';
  readonly preparedAt: Date | null;
  readonly liveAt: Date | null;
  readonly rows: HookFresh['rows'];
}

/** A fresh batch kept for the demo session: its press's own time, and the drawer opening that first showed it. */
interface FreshBatch {
  readonly source: 'live' | 'prepared';
  readonly preparedAt: Date | null;
  readonly at: Date | null;
  readonly opening: number;
  readonly rows: HookFresh['rows'];
}

/** One Companion on its map: what its roster button and its profile sheet show. */
export interface CompanionView {
  readonly id: string;
  readonly goalId: string;
  readonly map: MapGraph;
  /** The map's root, where the lens rests on entry (the mockup's compFocus). */
  readonly rootId: string;
  readonly growth: FamiliarGrowthState;
  /** The goal's march concept (the map's campaign focus): the sheet's Focus. */
  readonly focusTitle: string;
}

/**
 * Companions at work (mockup SCENES.comp, K38): each of the learner's maps names the Companion
 * attached to it and its march, and each Companion's growth read gives its sheet. A map that names
 * no Companion, or a march the map does not hold, is a loud failure, never a guessed pairing.
 */
@Injectable({ providedIn: 'root' })
export class CompanionsExhibit {
  private readonly manifests = inject(ManifestService);
  private readonly maps = inject(MapsService);
  private readonly companions = inject(CompanionsService);
  private readonly concepts = inject(ConceptGraphService);
  private readonly decisions = inject(VisitDecisions);
  private readonly tally = inject(VisitTally);
  private readonly practiceApi = inject(CampaignPracticeService);
  private readonly doseApi = inject(DoseService);
  private readonly atoms = inject(AtomsService);
  private readonly greetings = inject(PreparedGreetings);
  private readonly weakness = inject(CompanionWeakness);
  private readonly store = inject(KioskStore);
  private readonly live = inject(LiveService);

  private readonly statusSig = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly rosterSig = signal<readonly CompanionView[]>([]);
  private readonly selectedSig = signal<string | null>(null);
  private readonly manifestSig = signal<PrewarmManifest | null>(null);
  private readonly viewSig = signal<CompanionAbility | null>(null);
  /** K206: the document "Read my marked test" shows; the test opens first, every time the ability opens. */
  private readonly weakDocSig = signal<WeakDoc>('test');
  private readonly quizSig = signal<CompanionQuiz>({ state: 'none' });
  private readonly quizAnswerSig = signal<CompanionAnswer>({ state: 'none' });
  /** K222 (K218): a LIVE question that ended while the quiz answer was graded, held until the grade says whether the hex is won. */
  private lateQ: { readonly conceptId: string; readonly outcome: LiveOutcome } | null = null;
  private readonly focalSig = signal<string | null>(null);
  private readonly pendingSig = signal<readonly ConceptSuggestion[]>([]);
  /** Each (Companion, idea)'s fresh batches, newest first, kept until the demo session ends (K186: their button is spent). */
  private readonly freshSig = signal<ReadonlyMap<string, readonly FreshBatch[]>>(new Map());
  /** Counts the drawer's openings: a batch shown again in a later one says when its press came (W41). */
  private readonly openingSig = signal(0);
  private readonly busySig = signal(false);
  private readonly grownSig = signal<ReadonlyMap<string, CompanionGrew>>(new Map());
  private readonly dosesSig = signal<ReadonlyMap<string, CompanionDose>>(new Map());
  private readonly greetingsSig = signal<ReadonlyMap<string, CompanionGreeting>>(new Map());
  /** The dose card whose quick check is open (an index into the picked Companion's dose), and every answer this visit. */
  private readonly doseQuizSig = signal<number | null>(null);
  private readonly doseAnswersSig = signal<ReadonlyMap<string, DoseAnswer>>(new Map());
  private loading: Promise<void> | null = null;
  /** Counts visitors: a poll that outlives its visit (a reset) stops and writes nothing. */
  private visit = 0;
  /** This visit's first dose read has started the wait for its credit (W37). */
  private doseOpenWaited = false;

  constructor() {
    // Gap (a), W79: every outcome comes from the one LIVE door, so a press answered after its drawer has
    // gone (another Companion picked, the ability closed, the scene left) still lands; the rows bind none.
    this.live.onOutcome((key, o) => {
      if (key.startsWith(SUGG_KEY)) void this.onSuggOutcome(key.slice(SUGG_KEY.length), o);
      else if (key.startsWith(Q_KEY)) this.onQOutcome(key.slice(Q_KEY.length), o);
      else if (key.startsWith(GREET_KEY)) this.onGreetOutcome(key.slice(GREET_KEY.length), o);
      else if (key.startsWith(WEAK_KEY)) this.weakness.onLive(key.slice(WEAK_KEY.length), o);
    });
  }

  readonly status = this.statusSig.asReadonly();
  readonly roster = this.rosterSig.asReadonly();
  readonly selected = computed(() => this.rosterSig().find((c) => c.id === this.selectedSig()) ?? null);
  /** The ability on show (mockup state.comp.view); null shows the map and the prompt to pick one. */
  readonly view = this.viewSig.asReadonly();
  /**
   * The drawer's fresh batches, newest first (R1): Suggest's idea's, or the won march's after a win.
   * The newest press shown in the open drawer is "just now"; an earlier one gives its own time (W41).
   */
  readonly fresh = computed((): readonly CompanionFresh[] => {
    const key = this.freshKey();
    const opening = this.openingSig();
    return (key ? (this.freshSig().get(key) ?? []) : []).map((g) => ({ source: g.source, preparedAt: g.preparedAt, liveAt: g.opening === opening ? null : g.at, rows: g.rows }));
  });
  /** Whose fresh batches the drawer lists: the picked Companion's, on the idea a LIVE fresh-ideas press asks about. */
  private readonly freshKey = computed(() => {
    const c = this.selectedSig();
    const concept = this.viewSig() === 'suggest' ? this.focalSig() : this.quizWon() ? (this.march()?.id ?? null) : null;
    return c && concept ? `${c}:${concept}` : null;
  });
  readonly quiz = this.quizSig.asReadonly();
  readonly quizAnswer = this.quizAnswerSig.asReadonly();
  /**
   * The hidden batch the golden run prepared around the won march (prepared-choices.json
   * fresh.<goal>.<focal>, K64), found by its world ids: the won ask stands on it, and shows only with it.
   */
  readonly wonBatch = computed(() => {
    const c = this.selected();
    const m = this.manifestSig();
    const mq = this.march();
    if (!c || !m || !mq || !this.quizWon()) return null;
    return m.choices('suggestions').find((b) => b.hidden && b.records.goal_id === c.goalId && b.records.focal_concept_id === mq.id) ?? null;
  });
  /** The answer on show won the hex: the drawer drops the LIVE q row (mockup compQuizHTML). */
  readonly quizWon = computed(() => {
    const a = this.quizAnswerSig();
    return a.state === 'done' && a.result.won;
  });
  /** The march and the rung its quiz is on: rungs cleared plus one. */
  readonly march = computed(() => {
    const c = this.selected();
    const id = c?.map.campaign?.focusConceptId;
    const concept = c?.map.concepts.find((x) => x.conceptId === id);
    if (!c || !concept) return null;
    const node = c.map.campaign?.nodes[concept.conceptId];
    return { id: concept.conceptId, title: concept.title, rung: (node?.rungsCleared ?? 0) + 1, counted: node?.currentRungCorrect ?? 0, won: !!node?.wonAt };
  });
  readonly busy = this.busySig.asReadonly();
  /** The picked Companion's growth from a hex won this visit, kept when another is picked and back. */
  readonly grew = computed(() => this.grownSig().get(this.selectedSig() ?? '') ?? null);

  /** One Companion's win this visit, if any (the dashboard's dose note says its greeting came before it). */
  grewOf(companionId: string): CompanionGrew | null {
    return this.grownSig().get(companionId) ?? null;
  }
  /** The picked Companion's dose (its own goal's, K127) and its rail's greeting. */
  readonly dose = computed(() => this.dosesSig().get(this.selectedSig() ?? '') ?? null);
  readonly greeting = computed(() => this.greetingsSig().get(this.selectedSig() ?? '') ?? null);
  /** The picked Companion's marked test this visit (K158), kept when another is picked and back. */
  readonly weak = computed(() => this.weakness.all().get(this.selectedSig() ?? '') ?? null);
  /** K206 (W90): the picked Companion's essay this visit (Pingu's alone), kept when another is picked and back. */
  readonly essay = computed(() => this.weakness.essays().get(this.selectedSig() ?? '') ?? null);
  /** K206: the document on show, the test unless the Companion has an essay and the visitor chose it. */
  readonly weakDoc = computed((): WeakDoc => (this.essay() ? this.weakDocSig() : 'test'));
  /** The reading on show for the document on show (the essay's: its LIVE run, or its prepared one after a miss or with LIVE off). */
  readonly weakShown = computed(() => {
    const c = this.selectedSig();
    return c ? this.weakness.reading(c, this.weakDoc()) : null;
  });
  /** The open quick check: its card, the atom's MCQ and the answer, if any. */
  readonly doseQuiz = computed(() => {
    const i = this.doseQuizSig();
    const d = this.dose();
    if (i === null || d?.state !== 'ready') return null;
    const card = d.read.cards[i];
    const question = this.questionOf(d.atoms.get(card.atomId) ?? null);
    return question ? { index: i, card, question, answer: this.answerOf(card.atomId) } : null;
  });

  /** The picked Companion's prepared batches (the hidden fresh ones kept out, K64), in run order. */
  private readonly batches = computed(() => {
    const m = this.manifestSig();
    const goal = this.selected()?.goalId;
    if (!m || !goal) return [];
    return m.choices('suggestions').filter((c) => !c.hidden && c.records.goal_id === goal);
  });
  private readonly batch = computed(() => this.batches().find((b) => b.records.focal_concept_id === this.focalSig()) ?? null);

  /** The won idea the drawer shows (mockup compFirstFocal), and its suggestions with what the visitor decided. */
  readonly focal = computed(() => {
    const id = this.focalSig();
    const c = this.selected()?.map.concepts.find((x) => x.conceptId === id);
    return c ? { id: c.conceptId, title: c.title, preparedAt: this.batch()?.preparedAt ?? null } : null;
  });
  readonly rows = computed(() => {
    const b = this.batch();
    if (!b) return [];
    // W25: an idea decided this visit, here or in another scene (the story's six), shows as decided,
    // as the atlas shows it (K42); a waiting one from the pending read; any other was decided before.
    const byId = new Map(this.pendingSig().map((x) => [x.suggestionId, x]));
    const visit = this.decisions.all();
    return b.records.suggestion_ids.flatMap((id): { suggestion: ConceptSuggestion; state: 'added' | 'dropped' | null }[] => {
      const d = visit.get(id);
      if (d) return [{ suggestion: d.suggestion, state: d.state }];
      const s = byId.get(id);
      return s ? [{ suggestion: s, state: null }] : [];
    });
  });

  /** Where the lens rests: on the drawer's idea, else on the root (mockup compFocus). */
  readonly lensFocusId = computed(() => {
    if (this.viewSig() === 'suggest' && this.focalSig()) return this.focalSig() as string;
    if (this.viewSig() === 'quiz' && this.march()) return this.march()?.id as string;
    return this.selected()?.rootId ?? '';
  });

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.read().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  select(companionId: string): void {
    if (!this.rosterSig().some((c) => c.id === companionId) || this.busySig()) return;
    this.selectedSig.set(companionId);
    this.closeAbility();
  }

  /** Suggest: the Companion's waiting suggestions around the first won idea that still has some. */
  async openSuggest(): Promise<void> {
    const c = this.selected();
    if (!c || this.viewSig() === 'suggest' || this.busySig()) return;
    this.closeAbility();
    this.busySig.set(true);
    try {
      const m = this.manifestSig() as PrewarmManifest;
      const list = await firstValueFrom(this.concepts.getSuggestions(undefined, c.goalId));
      // K64: the hidden fresh batches stay off every read until a missed LIVE press shows one.
      this.pendingSig.set(list.suggestions.filter((x) => !m.hiddenSuggestionIds.has(x.suggestionId)));
      const waiting = new Set(this.pendingSig().map((x) => x.suggestionId));
      const first = this.batches().find((b) => b.records.suggestion_ids.some((id) => waiting.has(id))) ?? this.batches()[0];
      this.focalSig.set(first?.records.focal_concept_id ?? null);
      this.viewSig.set('suggest');
    } catch (err: unknown) {
      this.fail(err);
    } finally {
      this.busySig.set(false);
    }
  }

  /** Quiz: production's campaign practice on the march, served only for a set the golden run prepared (h3 = A). */
  async openQuiz(): Promise<void> {
    const c = this.selected();
    const march = this.march();
    if (!c || this.viewSig() === 'quiz' || this.busySig()) return;
    this.closeAbility();
    this.viewSig.set('quiz');
    if (!march || march.won) return;
    const set = (this.manifestSig() as PrewarmManifest)
      .choices('practice_set')
      .find((x) => x.records.goal_id === c.goalId && x.records.concept_id === march.id && x.records.rung === march.rung);
    if (!set) return;
    // W79: a LIVE question written for this march at this rung this demo session shows again in its place.
    const done = this.live.state(`${Q_KEY}${march.id}`)();
    const live = done?.status === 'done' ? questionAt(done.result as QResult, march.rung) : null;
    if (live) {
      this.quizSig.set({ state: 'ready', question: live.question, preparedAt: set.preparedAt, freshSetId: live.freshSetId });
      return;
    }
    this.quizSig.set({ state: 'loading' });
    try {
      const question = await servePrepared(this.practiceApi, set);
      this.quizSig.set({ state: 'ready', question, preparedAt: set.preparedAt });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[kiosk] ${reason}`);
      this.quizSig.set({ state: 'failed' });
    }
  }

  /**
   * Today's dose: the Companion's goal's (?goal_id= always, T2.18), read once a visit (a second open
   * the same day credits nothing and composes the same cards); each card's body from its atom (F17)
   * and the rail's greeting, the golden run's turn replayed with no model call (K49).
   */
  async openDose(): Promise<void> {
    const c = this.selected();
    if (!c || this.viewSig() === 'dose' || this.busySig()) return;
    this.closeAbility();
    this.viewSig.set('dose');
    if (this.dosesSig().get(c.id)?.state === 'ready' || this.dosesSig().get(c.id)?.state === 'loading') return;
    const visit = this.visit;
    this.setDose(c.id, { state: 'loading' });
    // The greeting's read never throws (it says what failed), so it runs beside the dose's.
    const greeting = this.greetingsSig().has(c.id) ? Promise.resolve() : this.readGreeting(c.id, visit);
    // Each Companion's sheet total before the read: the read itself publishes the open's credit.
    const before = new Map(this.rosterSig().map((x) => [x.id, x.growth.expCumulative] as const));
    try {
      const read = await this.doseApi.open(c.goalId);
      if (!this.doseOpenWaited && visit === this.visit) {
        this.doseOpenWaited = true;
        void this.afterDoseOpen(before, visit, c.goalId);
      }
      for (const card of read.cards) if (!REASON_WORDS[card.reason]) console.error(`[kiosk] dose card ${card.atomId} has a reason the kiosk has no words for: ${card.reason}`);
      const atoms = new Map(await Promise.all(read.cards.map(async (card) => [card.atomId, await this.atomOf(card.atomId)] as const)));
      await greeting;
      if (visit !== this.visit) return;
      this.setDose(c.id, { state: 'ready', read, atoms, index: 0 });
    } catch (err: unknown) {
      console.error(`[kiosk] ${c.id}'s dose could not be read: ${err instanceof Error ? err.message : String(err)}`);
      if (visit === this.visit) this.setDose(c.id, { state: 'failed' });
    }
  }

  /**
   * Read my marked test (K158): the Companion's prepared paper and its run's proposed weak spots,
   * in the map's place, as the dose takes it.
   */
  async openWeak(): Promise<void> {
    const c = this.selected();
    if (!c || this.viewSig() === 'weak' || this.busySig()) return;
    this.closeAbility();
    this.viewSig.set('weak');
    await this.weakness.open(c.id, this.manifestSig() as PrewarmManifest);
  }

  /** K206: one of the picked Companion's documents on show (the essay only when it has one). */
  showWeakDoc(doc: WeakDoc): void {
    if (this.viewSig() !== 'weak' || (doc === 'essay' && !this.essay())) return;
    this.weakDocSig.set(doc);
  }

  /**
   * W52 (K182): how the Companion read its marked test, over its panel and inside the scene: the paper
   * full size, each lost mark and the weak spot placed under it. A store overlay, so Esc closes it
   * first and a scene change closes it; static (no request, no write). Only over a panel that shows,
   * for the document on show (K206: the essay's once it has a reading).
   */
  readonly paperOpen = computed(() => this.store.overlay() === 'paper' && this.viewSig() === 'weak');

  openPaper(): void {
    const w = this.weakShown();
    if (this.viewSig() !== 'weak' || (w?.state !== 'review' && w?.state !== 'saved')) return;
    this.store.openOverlay('paper');
  }

  closePaper(): void {
    if (this.store.overlay() === 'paper') this.store.closeOverlays();
  }

  /**
   * K173: a tour beat, always on Pingu (the water map's Companion, the roster's first; Nova and Ember are
   * never in Next): no ability (C1, its intro), or one of its four, or (C6, W52) its marked test with the
   * paper's popup open. Back never writes, so by Back the dose opens only when this visit already read
   * it (a first open credits the day's +2); otherwise the intro shows, the dose a click away.
   */
  async tourShow(view: CompanionAbility | 'paper' | null, by: Arrival): Promise<void> {
    if (this.statusSig() !== 'ready') await this.load();
    const pingu = this.rosterSig()[0];
    if (!pingu) return;
    if (this.busySig()) {
      console.error(`[kiosk] the tour could not show Pingu's ${view ?? 'intro'}: an ability is still answering`);
      return;
    }
    this.select(pingu.id);
    if (view !== 'paper') this.closePaper();
    if (view === 'dose' && by === 'back' && !this.dosesSig().has(pingu.id)) return;
    if (view === 'suggest') return this.openSuggest();
    if (view === 'quiz') return this.openQuiz();
    if (view === 'dose') return this.openDose();
    if (view === 'weak') return this.openWeak();
    if (view === 'paper') {
      await this.openWeak();
      const w = this.weak();
      if (w?.state !== 'review' && w?.state !== 'saved') {
        console.error(`[kiosk] the tour could not open Pingu's paper: its marked test is ${w?.state ?? 'not open'}`);
        return;
      }
      this.openPaper();
    }
  }

  /** W100: Pingu's dose is on screen, so C4 by Next has nothing left to open (its intro stand-in does not count). */
  tourDoseOpen(): boolean {
    return this.selectedSig() === (this.rosterSig()[0]?.id ?? null) && this.viewSig() === 'dose';
  }

  /**
   * K173 (Back's own view first): whether the screen shows the beat's view, Pingu with that ability (or
   * none); C4's, while this visit read no dose, is Pingu's intro (what Back shows there), so Back moves on.
   * C5's is the marked test with the paper's popup closed, C6's with it open (W52); both on the test's tab (K206).
   */
  tourShows(view: CompanionAbility | 'paper' | null): boolean {
    const pingu = this.rosterSig()[0]?.id ?? null;
    if (this.selectedSig() !== pingu) return false;
    if (view === 'paper') return this.paperOpen() && this.weakDoc() === 'test';
    if (view === 'weak') return this.viewSig() === 'weak' && !this.paperOpen() && this.weakDoc() === 'test';
    if (view === 'dose' && !this.dosesSig().has(pingu as string)) return this.viewSig() === null || this.viewSig() === 'dose';
    return this.viewSig() === view;
  }

  /**
   * K173 ruling (3): the three growths read again (reads only), on every Companions entry and when the
   * hall shows, so EXP credited elsewhere (Grading's release, +30) shows on the sheet and the hall's card.
   * A read that fails keeps the last one and says so.
   */
  async refreshGrowth(): Promise<void> {
    if (this.statusSig() !== 'ready') return;
    const visit = this.visit;
    try {
      const read = await Promise.all(this.rosterSig().map(async (c) => [c.id, await this.companions.growth(c.id)] as const));
      if (visit !== this.visit) return;
      const fresh = new Map(read);
      this.rosterSig.update((r) => r.map((c) => ({ ...c, growth: fresh.get(c.id) ?? c.growth })));
    } catch (err: unknown) {
      console.error(`[kiosk] the Companions' growth could not be read again: ${err instanceof Error ? err.message : String(err)}; the last read stays`);
    }
  }

  /** The atlas's "Practise today's dose" (mockup doseFromMap): that map's Companion, on its dose. */
  async openDoseFor(companionId: string): Promise<void> {
    if (this.statusSig() !== 'ready') await this.load();
    if (!this.rosterSig().some((c) => c.id === companionId)) {
      console.error(`[kiosk] the atlas asked for the dose of ${companionId}, which no map names`);
      return;
    }
    this.select(companionId);
    await this.openDose();
  }

  /**
   * A hex won in the atlas (K42, K135): credited as a win here is (both credits waited for, then the
   * growth read once), with the won map read again, so the hall's card and the sheet show it. The
   * growth before the win must already be read: with no roster the credit cannot be told apart.
   */
  async creditWin(companionId: string, wonTitle: string): Promise<CompanionGrew | null> {
    const c = this.statusSig() === 'ready' ? this.rosterSig().find((x) => x.id === companionId) : undefined;
    if (!c) {
      console.error(`[kiosk] a hex was won for ${companionId} before the Companions were read: the win's EXP cannot be shown`);
      return null;
    }
    const visit = this.visit;
    try {
      const map = await firstValueFrom(this.maps.getGraph(c.goalId));
      if (visit !== this.visit) return null;
      this.rosterSig.update((r) => r.map((x) => (x.id === c.id ? { ...x, map } : x)));
      await this.afterWin(c.id, c.growth, wonTitle);
    } catch (err: unknown) {
      console.error(`[kiosk] the atlas's win for ${companionId} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    return visit === this.visit ? this.grewOf(companionId) : null;
  }

  /** Previous, Next and the dots (mockup compDose cxDosePrev, cxDoseNext, cxDoseGo). */
  doseGo(index: number): void {
    const c = this.selected();
    const d = c ? this.dosesSig().get(c.id) : undefined;
    if (!c || d?.state !== 'ready') return;
    this.doseQuizSig.set(null);
    this.setDose(c.id, { ...d, index: Math.max(0, Math.min(d.read.cards.length - 1, index)) });
  }

  /**
   * Play: a campaign card opens production's campaign practice on the march (the Quiz ability);
   * any other card opens its quick check on the atom's own question.
   */
  async playDose(): Promise<void> {
    const d = this.dose();
    if (d?.state !== 'ready') return;
    const card = d.read.cards[d.index];
    if (card.reason === 'campaign') return this.openQuiz();
    if (this.questionOf(d.atoms.get(card.atomId) ?? null)) this.doseQuizSig.set(d.index);
  }

  /** Back to the cards (mockup cxqBack), or on to the next one (cxqNext). */
  closeDoseQuiz(next = false): void {
    const i = this.doseQuizSig();
    this.doseQuizSig.set(null);
    if (next && i !== null) this.doseGo(i + 1);
  }

  /** Whether the card has a quick check (an MCQ on its atom) to play. */
  playable(atomId: string): boolean {
    const d = this.dose();
    return d?.state === 'ready' && !!this.questionOf(d.atoms.get(atomId) ?? null);
  }

  answerOf(atomId: string): DoseAnswer | null {
    return this.doseAnswersSig().get(`${this.selectedSig()}:${atomId}`) ?? null;
  }

  /**
   * One answer per card per visit: production's attempt (start, then submit), graded by rule on the
   * server. The credit goes to the ACTIVE Companion through Pub/Sub, which need not be the dose's
   * own (K102), so every Companion's ledger is read until one lists it, and the quiz names that one.
   */
  async answerDose(optionId: string): Promise<void> {
    const c = this.selected();
    const q = this.doseQuiz();
    if (!c || !q || q.answer) return;
    const key = `${c.id}:${q.card.atomId}`;
    const visit = this.visit;
    const set = (a: DoseAnswer) => {
      if (visit === this.visit) this.doseAnswersSig.update((m) => new Map(m).set(key, a));
    };
    set({ state: 'checking', selected: optionId });
    // Each Companion's sheet total before the answer: a ledger row past it was credited since.
    const before = new Map(this.rosterSig().map((x) => [x.id, x.growth.expCumulative] as const));
    let graded: Extract<DoseAnswer, { state: 'done' }>;
    try {
      const session = await this.atoms.start(q.card.atomId);
      const result = await this.atoms.submit(q.card.atomId, { session_id: session.session_id, answer_id: answerId(), selected_option_id: optionId });
      const explainer = q.question.options.find((o) => o.option_id === optionId)?.explainer?.trim() || null;
      graded = { state: 'done', selected: optionId, correct: result.is_correct, explainer, credit: 'waiting' };
      set(graded);
      if (visit === this.visit) this.tally.answered();
    } catch (err: unknown) {
      console.error(`[kiosk] the dose answer on ${q.card.atomId} was not graded: ${err instanceof Error ? err.message : String(err)}`);
      set({ state: 'failed', selected: optionId });
      return;
    }
    const credit = await this.credited(before, ANSWER_CREDITS, visit, `the dose answer on ${q.card.atomId}`);
    if (visit !== this.visit) return;
    if (!credit) {
      set({ ...graded, credit: null });
      return;
    }
    const who = this.rosterSig().find((x) => x.id === credit.companionId) as CompanionView;
    try {
      const g = await this.companions.growth(credit.companionId);
      if (visit !== this.visit) return;
      this.rosterSig.update((r) => r.map((x) => (x.id === credit.companionId ? { ...x, growth: g } : x)));
    } catch (err: unknown) {
      console.error(`[kiosk] ${credit.companionId}'s growth could not be read after the dose credit: ${err instanceof Error ? err.message : String(err)}`);
    }
    set({ ...graded, credit: { companionId: credit.companionId, name: who.growth.displayName || who.map.attachedFamiliarName || credit.companionId, exp: credit.rows.reduce((n, e) => n + e.expDelta, 0) } });
  }

  /** The open's credit lands by event: the ledgers are read until one lists it, then that Companion's sheet is read again. */
  private async afterDoseOpen(before: ReadonlyMap<string, number>, visit: number, goalId: string): Promise<void> {
    const credit = await this.credited(before, DOSE_OPEN_CREDITS, visit, `the dose of ${goalId} opened`);
    if (!credit || visit !== this.visit) return;
    try {
      const g = await this.companions.growth(credit.companionId);
      if (visit !== this.visit) return;
      this.rosterSig.update((r) => r.map((x) => (x.id === credit.companionId ? { ...x, growth: g } : x)));
    } catch (err: unknown) {
      console.error(`[kiosk] ${credit.companionId}'s growth could not be read after the dose open's credit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** A LIVE greet press ended: a new greeting replaces the quote; a miss shows the prepared one again (K45). */
  onGreetOutcome(companionId: string, o: LiveOutcome): void {
    if (o.status === 'stopped') return;
    const g = this.greetingsSig().get(companionId) ?? { prepared: null, live: null };
    this.greetingsSig.update((m) => new Map(m).set(companionId, { ...g, live: o.status === 'done' ? (o.result as Greeting) : null }));
  }

  private setDose(companionId: string, d: CompanionDose): void {
    this.dosesSig.update((m) => new Map(m).set(companionId, d));
  }

  private questionOf(atom: LearningAtom | null): McqQuestionPayload | null {
    return atom && getQuestionType(atom) === 'mcq' ? (atom.question_payload as McqQuestionPayload) : null;
  }

  private async atomOf(atomId: string): Promise<LearningAtom | null> {
    try {
      const atom = await this.atoms.read(atomId);
      if (atom.body?.trim()) return atom;
      console.error(`[kiosk] atom ${atomId} has no body: its dose card shows the error, never the dose's summary (F17)`);
    } catch (err: unknown) {
      console.error(`[kiosk] dose card ${atomId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }

  private async readGreeting(companionId: string, visit: number): Promise<void> {
    const choice = (this.manifestSig() as PrewarmManifest).choices('greeting').find((g) => g.records.companion_id === companionId);
    let prepared: CompanionGreeting['prepared'] = null;
    if (!choice) {
      console.error(`[kiosk] no prepared greeting for ${companionId}: the golden run makes one per Companion (PREPARED-CHOICES.md 5.11); the rail shows none`);
    } else {
      try {
        const g = await this.greetings.read(companionId, choice.records.turn_id);
        prepared = { text: g.greeting, model: g.model, preparedAt: choice.preparedAt };
      } catch (err: unknown) {
        console.error(`[kiosk] the prepared greeting for ${companionId} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (visit === this.visit) this.greetingsSig.update((m) => new Map(m).set(companionId, { prepared, live: m.get(companionId)?.live ?? null }));
  }

  /** One answer, graded by rules on the server; a win reads the map and the Companion's growth again. */
  async answerQuiz(optionId: string): Promise<void> {
    const c = this.selected();
    const q = this.quizSig();
    const march = this.march();
    if (!c || !march || q.state !== 'ready' || this.quizAnswerSig().state !== 'none') return;
    this.quizAnswerSig.set({ state: 'checking', selected: optionId });
    try {
      const result = await firstValueFrom(
        this.practiceApi.answer(c.goalId, {
          concept_id: march.id,
          rung: march.rung,
          question_index: q.question.sourceIndex,
          selected_option_id: optionId,
          ...(q.freshSetId ? { fresh_set_id: q.freshSetId } : {}),
        }),
      );
      const late = this.takeLateQ();
      this.quizAnswerSig.set({ state: 'done', selected: optionId, result });
      this.tally.answered();
      if (!result.won && late) this.onQOutcome(late.conceptId, late.outcome);
      if (result.won) {
        const map = await firstValueFrom(this.maps.getGraph(c.goalId));
        this.rosterSig.update((r) => r.map((x) => (x.id === c.id ? { ...x, map } : x)));
        await this.afterWin(c.id, c.growth, march.title);
      }
    } catch (err: unknown) {
      console.error(`[kiosk] the quiz answer was not graded: ${err instanceof Error ? err.message : String(err)}`);
      const late = this.takeLateQ();
      this.quizAnswerSig.set({ state: 'failed', selected: optionId });
      if (late) this.onQOutcome(late.conceptId, late.outcome);
    }
  }

  private takeLateQ(): { readonly conceptId: string; readonly outcome: LiveOutcome } | null {
    const late = this.lateQ;
    this.lateQ = null;
    return late;
  }

  /**
   * A LIVE fresh-ideas press around `conceptId` ended, Suggest's or the won hex's ask (mockup wonAskHTML),
   * whatever the drawer shows now (gap (a)): its ideas join the top of the idea's list for the demo session
   * (R1, K189 (2)), or, when it gave none, the hidden batch prepared around the idea (K64), from the goal's
   * suggestions read anew (the drawer that pressed may have gone, and its read with it).
   */
  async onSuggOutcome(conceptId: string, o: LiveOutcome): Promise<void> {
    if (o.status === 'stopped') return;
    const c = this.rosterSig().find((x) => x.map.concepts.some((k) => k.conceptId === conceptId));
    if (!c) {
      console.error(`[kiosk] fresh ideas came back around ${conceptId}, which no Companion's map holds: they are not shown`);
      return;
    }
    const key = `${c.id}:${conceptId}`;
    const live = liveRows(o);
    if (live && o.status === 'done') {
      this.addFresh(key, { source: 'live', preparedAt: null, at: o.at, rows: live });
      return;
    }
    if (this.listsFallback(key)) return;
    const batch = this.manifestSig()
      ?.choices('suggestions')
      .find((b) => b.hidden && b.records.goal_id === c.goalId && b.records.focal_concept_id === conceptId);
    if (!batch) {
      console.error(`[kiosk] no prepared fresh ideas around ${conceptId}: the LIVE press gave none and nothing stands behind it`);
      return;
    }
    const visit = this.visit;
    try {
      const list = await firstValueFrom(this.concepts.getSuggestions(undefined, c.goalId));
      if (visit !== this.visit || this.listsFallback(key)) return;
      this.addFresh(key, { source: 'prepared', preparedAt: batch.preparedAt, at: null, rows: freshRows(batch, list.suggestions) });
    } catch (err: unknown) {
      console.error(`[kiosk] the prepared fresh ideas ${batch.key} could not be read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * A LIVE q press on the march `conceptId` ended: while its quiz is on screen at that rung, the fresh set's
   * question replaces the prepared one (K103); a missed one leaves it (K45). Off screen, the quiz finds it
   * when it opens again (W79). K222 (K218): a hex won takes no more questions, so a question ending after
   * the win is dropped, never shown; one ending while the answer is graded waits for the grade.
   */
  onQOutcome(conceptId: string, o: LiveOutcome): void {
    const q = this.quizSig();
    const m = this.march();
    if (o.status !== 'done' || q.state !== 'ready' || m?.id !== conceptId || this.quizWon()) return;
    if (this.quizAnswerSig().state === 'checking') {
      this.lateQ = { conceptId, outcome: o };
      return;
    }
    const live = questionAt(o.result as QResult, m.rung);
    if (!live) return;
    this.quizSig.set({ state: 'ready', question: live.question, preparedAt: q.preparedAt, freshSetId: live.freshSetId });
    this.quizAnswerSig.set({ state: 'none' });
  }

  /**
   * Add or Dismiss one suggestion (K42: real calls), `fresh` for one of the fresh batch's; either way
   * it leaves the list (K189 (2)), and an added one is read back from the map.
   */
  async decide(suggestionId: string, action: 'accept' | 'dismiss', fresh = false): Promise<void> {
    const c = this.selected();
    if (!c || this.busySig()) return;
    this.busySig.set(true);
    try {
      await firstValueFrom(action === 'accept' ? this.concepts.acceptSuggestion(suggestionId) : this.concepts.dismissSuggestion(suggestionId));
      const key = this.freshKey();
      const shown = key ? (this.freshSig().get(key) ?? []) : [];
      const decided = [...this.pendingSig(), ...shown.flatMap((g) => g.rows.map((r) => r.suggestion))].find((s) => s.suggestionId === suggestionId);
      if (decided) this.decisions.record(decided, action);
      else console.error(`[kiosk] the decided suggestion ${suggestionId} is not on screen: the atlas will not show it`);
      if (fresh && key) {
        const mark = action === 'accept' ? 'added' : 'dropped';
        const marked = (g: FreshBatch): FreshBatch => ({ ...g, rows: g.rows.map((r) => (r.suggestion.suggestionId === suggestionId ? { ...r, state: mark } : r)) });
        this.freshSig.update((m) => new Map(m).set(key, (m.get(key) ?? []).map(marked)));
      }
      if (action === 'accept') {
        const map = await firstValueFrom(this.maps.getGraph(c.goalId));
        this.rosterSig.update((r) => r.map((x) => (x.id === c.id ? { ...x, map } : x)));
      }
    } catch (err: unknown) {
      this.fail(err);
    } finally {
      this.busySig.set(false);
    }
  }

  /** A fresh batch joins the top of its idea's list for the demo session (R1, K189 (2)). */
  private addFresh(key: string, g: Omit<FreshBatch, 'opening'>): void {
    this.freshSig.update((m) => new Map(m).set(key, [{ ...g, opening: this.openingSig() }, ...(m.get(key) ?? [])]));
  }

  /** The K64 fallback is listed already: a press that misses again has nothing new to show. */
  private listsFallback(key: string): boolean {
    return (this.freshSig().get(key) ?? []).some((g) => g.source === 'prepared');
  }

  /**
   * After a won hex: wait for both credits, then read the growth once (the ledger row and the growth
   * are written in one transaction, and the new stage's skills are minted in it too). Without both
   * credits the sheet shows the growth as read and no moment, never a guessed one.
   */
  private async afterWin(companionId: string, from: FamiliarGrowthState, wonTitle: string): Promise<void> {
    const visit = this.visit;
    this.grownSig.update((m) => {
      const next = new Map(m);
      next.delete(companionId);
      return next;
    });
    const credits = (await this.credited(new Map([[companionId, from.expCumulative]]), WIN_CREDITS, visit, 'the win'))?.rows ?? null;
    if (visit !== this.visit) return;
    const to = await this.companions.growth(companionId);
    if (visit !== this.visit) return;
    this.rosterSig.update((r) => r.map((x) => (x.id === companionId ? { ...x, growth: to } : x)));
    if (!credits) return;
    let stageUp: CompanionGrew['stageUp'] = null;
    if (to.growthStage > from.growthStage) {
      const l = await this.companions.loadout(companionId);
      if (visit !== this.visit) return;
      stageUp = {
        slots: l.skillSlotsUnlocked,
        woke: l.grants.filter((g) => g.unlockedAtStage === to.growthStage).map((g) => ({ key: g.skillKey, active: g.catalogueActive })),
        abilities: to.unlockedTools.filter((t) => !from.unlockedTools.includes(t)),
      };
      const unnamed = [...stageUp.woke.map((w) => w.key).filter((k) => !SKILL_WORDS[k]), ...stageUp.abilities.filter((k) => !ABILITY_WORDS[k])];
      if (unnamed.length) console.error(`[kiosk] the stage-up names ${unnamed.join(', ')} with no plain words: the sheet shows the raw keys`);
    }
    const gained = credits.reduce((n, e) => n + e.expDelta, 0);
    this.grownSig.update((m) => new Map(m).set(companionId, { companionId, wonTitle, from, to, gained, stageUp }));
  }

  /**
   * The first Companion whose ledger lists every one of `sources` past its total in `before`, in
   * any order, with those rows; null, said loudly, if none does within the reads (or the visit ends).
   */
  private async credited(
    before: ReadonlyMap<string, number>,
    sources: readonly string[],
    visit: number,
    what: string,
  ): Promise<{ companionId: string; rows: GrowthEventRecord[] } | null> {
    const seen = new Set<string>();
    for (let i = 0; i < GROWTH_POLL_TRIES && visit === this.visit; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, GROWTH_POLL_MS));
      if (visit !== this.visit) return null;
      const reads = await Promise.all([...before].map(async ([id, total]) => ({ id, total, page: await this.companions.growthEvents(id) })));
      for (const { id, total, page } of reads) {
        // Cumulative EXP only rises, so a row whose total is past the sheet's was credited since it was read.
        const fresh = page.events.filter((e) => e.expCumulativeAfter > total);
        const found = sources.map((source) => fresh.find((e) => e.source === source));
        found.forEach((e, k) => e && seen.add(sources[k]));
        if (found.every((e) => !!e)) return { companionId: id, rows: found as GrowthEventRecord[] };
      }
    }
    if (visit !== this.visit) return null;
    const missing = sources.filter((x) => !seen.has(x));
    console.warn(`[kiosk] no ledger of ${[...before.keys()].join(', ')} listed ${missing.length ? missing.join(' and ') : sources.join(' with ')} after ${what} within ${GROWTH_POLL_TRIES} reads: the screen shows the growth as read and names no credit`);
    return null;
  }

  private closeAbility(): void {
    this.closePaper();
    this.viewSig.set(null);
    this.weakDocSig.set('test');
    this.focalSig.set(null);
    this.pendingSig.set([]);
    this.openingSig.update((n) => n + 1);
    this.quizSig.set({ state: 'none' });
    this.quizAnswerSig.set({ state: 'none' });
    this.lateQ = null;
    this.doseQuizSig.set(null);
  }

  /** A new visitor starts on a fresh read. */
  forget(): void {
    this.visit++;
    this.doseOpenWaited = false;
    this.grownSig.set(new Map());
    this.dosesSig.set(new Map());
    this.greetingsSig.set(new Map());
    this.doseAnswersSig.set(new Map());
    this.freshSig.set(new Map());
    this.weakness.forget();
    this.statusSig.set('idle');
    this.rosterSig.set([]);
    this.selectedSig.set(null);
    this.manifestSig.set(null);
    this.busySig.set(false);
    this.closeAbility();
  }

  private async read(): Promise<void> {
    this.statusSig.set('loading');
    try {
      const m = await this.manifests.load();
      this.manifestSig.set(m);
      const bound: Omit<CompanionView, 'growth'>[] = [];
      for (const key of GOAL_KEYS) {
        const goalId = m.world(key);
        const map = await firstValueFrom(this.maps.getGraph(goalId));
        const id = map.attachedFamiliarId;
        if (!id) throw new Error(`[kiosk] the map of ${key} names no Companion`);
        if (!map.rootConceptId) throw new Error(`[kiosk] the map of ${key} names no root`);
        const focus = map.concepts.find((c) => c.conceptId === map.campaign?.focusConceptId);
        if (!focus) throw new Error(`[kiosk] the map of ${key} holds no march concept ${String(map.campaign?.focusConceptId)}`);
        bound.push({ id, goalId, map, rootId: map.rootConceptId, focusTitle: focus.title });
      }
      const roster: CompanionView[] = [];
      for (const b of bound) roster.push({ ...b, growth: await this.companions.growth(b.id) });
      this.rosterSig.set(roster);
      this.selectedSig.set(roster[0].id);
      this.statusSig.set('ready');
    } catch (err: unknown) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    console.error(`[kiosk] the Companions could not be read: ${err instanceof Error ? err.message : String(err)}`);
    this.statusSig.set('failed');
  }
}

/** A prepared batch's rows in its run order, from the suggestions read (a decided one has left the read). */
function freshRows(batch: PreparedChoice<'suggestions'>, read: readonly ConceptSuggestion[]): HookFresh['rows'] {
  const byId = new Map(read.map((x) => [x.suggestionId, x]));
  return batch.records.suggestion_ids.flatMap((id) => (byId.has(id) ? [{ suggestion: byId.get(id) as ConceptSuggestion, state: 'pending' as const }] : []));
}

/** The answer's idempotency key (me_handlers.go answer_id): a retry of the same answer reuses it. */
function answerId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('[kiosk] no crypto.randomUUID: the kiosk must be opened on 127.0.0.1 or localhost (a secure context)');
  }
  return crypto.randomUUID();
}
