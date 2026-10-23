import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { LearnerAssessmentDetail, LearnerQuestion } from '../../aplus/me-assessments/me-assessments.model';
import type { TestSetWithQuestions } from '../../aplus/test-set-editor/test-set-editor.model';
import { MapsService } from '../../aplus/my-knowledge/maps.service';
import { ManifestService, type PreparedChoice, type PrewarmManifest } from '../../kiosk-api/manifest.service';
import { SessionService } from '../../kiosk-api/session.service';
import { AssessmentsService, type CreatedAssessment, type GradingRead } from '../../product-api/assessments.service';
import { TodayService } from '../../product-api/today.service';
import { VisitTally } from '../../shared/visit-tally';
import type { IconName } from '../../shared/icon/icons';

/**
 * The learner's three banks in the mockup's order (DASH.banks, line 5089), by the prepared-choice
 * list's keys; `id` is the mockup's swatch class and `icon` its picture. The grading sample's bank
 * (bank.grading) is not a dashboard bank.
 */
const BANKS = [
  { key: 'bank.water', id: 'water', icon: 'drop' },
  { key: 'bank.nature', id: 'nature', icon: 'leaf' },
  { key: 'bank.hawker', id: 'hawker', icon: 'bowl' },
] as const;

/**
 * Where a question came from, as the list says it (db.src.*): every value is read from a record. The
 * step 4 copy (`morning`) also carries its picture's mode, from the draft it copies (K119): null when
 * the copy has no picture, `mode` null when its picture is not that draft's own (said loudly).
 */
export type DashSource =
  | { readonly kind: 'morning'; readonly at: Date; readonly picture: { readonly mode: 'mermaid' | 'scene' | null } | null }
  | { readonly kind: 'alsoGrade' }
  | { readonly kind: 'ai' };

/** A take question's picture (the take read's prompt.image_url), or null. */
export function pictureOf(q: LearnerQuestion): string | null {
  return (typeof q.prompt === 'string' ? null : q.prompt.image_url?.trim()) || null;
}

export interface DashRow {
  readonly testSetQuestionId: string;
  readonly questionId: string;
  readonly type: 'mcq' | 'oe';
  readonly stem: string;
  readonly points: number;
  readonly source: DashSource;
}

export interface DashBank {
  readonly key: string;
  readonly id: string;
  readonly icon: IconName;
  readonly name: string;
  readonly testSet: TestSetWithQuestions;
  readonly rows: readonly DashRow[];
  /** The bank that holds the step 4 question (the water bank, K55). */
  readonly step4: boolean;
  /** K159: the bank holds a question with a picture (an accept or a copy that made one recorded it). */
  readonly pictures: boolean;
}

/**
 * One bank's take this visit (mockup state.visit.dash, K42). Its ids are kept the moment each call
 * returns, so a take that failed half way is finished on the next press, never made twice (a second
 * create would be a second assessment).
 */
export interface DashAttempt {
  readonly assessment: CreatedAssessment;
  readonly submissionId: string | null;
  /** The learner's take read (the questions with no key), once started. */
  readonly take: LearnerAssessmentDetail | null;
  readonly idx: number;
  /** Each question's answer by its test-set question id: an option id, or the typed text. */
  readonly answers: ReadonlyMap<string, string>;
  readonly status: 'starting' | 'in_progress' | 'submitted';
  /** The submit held the open answer for the grading exhibit (K57). */
  readonly held: boolean;
  /** The marks, from the instructor's grading read, once submitted. */
  readonly grading: GradingRead | null;
}

/**
 * The learner's dashboard (mockup SCENES.dash, K55, K79): the goal, the question banks the golden
 * run made and the published test set each feeds, read from the product by the manifest's ids. A
 * bank that cannot be read fails the dashboard, never a shorter list.
 */
@Injectable({ providedIn: 'root' })
export class DashboardExhibit {
  private readonly manifests = inject(ManifestService);
  private readonly maps = inject(MapsService);
  private readonly api = inject(AssessmentsService);
  private readonly session = inject(SessionService);
  private readonly tally = inject(VisitTally);
  private readonly today = inject(TodayService);

  private readonly statusSig = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly banksSig = signal<readonly DashBank[]>([]);
  private readonly goalSig = signal('');
  private readonly streakSig = signal<number | null>(null);
  private readonly manaSig = signal<number | null>(null);
  private readonly pickedSig = signal<string | null>(null);
  private readonly modeSig = signal<'list' | 'take'>('list');
  private readonly busySig = signal<'take' | 'submit' | null>(null);
  private readonly failedSig = signal<'take' | 'submit' | null>(null);
  private readonly attemptsSig = signal<ReadonlyMap<string, DashAttempt>>(new Map());
  /** The bank whose Submit was pressed with questions unanswered (K138 W14): the next press submits. */
  private readonly warnedSig = signal<string | null>(null);
  private readonly doseCompanionSig = signal<string | null>(null);
  private loading: Promise<void> | null = null;
  /** Counts visitors: a call that outlives its visit (a reset) writes nothing. */
  private visit = 0;

  readonly status = this.statusSig.asReadonly();
  readonly banks = this.banksSig.asReadonly();
  /** The active goal's title, from its map (the today strip's Goal). */
  readonly goalTitle = this.goalSig.asReadonly();
  /** The streak and the mana balance (K131); null when its read failed (said loudly; never shown as 0). */
  readonly streakDays = this.streakSig.asReadonly();
  readonly manaBalance = this.manaSig.asReadonly();
  readonly picked = computed(() => this.banksSig().find((b) => b.key === this.pickedSig()) ?? null);
  readonly mode = this.modeSig.asReadonly();
  readonly busy = this.busySig.asReadonly();
  /** The last press that failed (said on the card or the question), cleared by the next press. */
  readonly failed = this.failedSig.asReadonly();
  /** The picked bank's take this visit, if any. */
  readonly attempt = computed(() => this.attemptsSig().get(this.pickedSig() ?? '') ?? null);
  /**
   * K138 W14: after a Submit with questions unanswered, how many still are, of how many; null when
   * Submit was not pressed that way, or every question is answered now.
   */
  readonly unanswered = computed(() => {
    const a = this.attempt();
    if (!a?.take || a.status !== 'in_progress' || this.warnedSig() !== this.pickedSig()) return null;
    const n = a.take.questions.filter((q) => !a.answers.get(q.test_set_question_id)?.trim()).length;
    return n ? { n, total: a.take.questions.length } : null;
  });
  /** The today strip's dose note is open. */
  /** The active goal's Companion, whose dose "Today's Daily Dose" opens (K160); null when the goal has none (said loudly). */
  readonly doseCompanion = this.doseCompanionSig.asReadonly();

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.read().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  pick(key: string): void {
    if (this.busySig() || !this.banksSig().some((b) => b.key === key)) return;
    this.pickedSig.set(key);
    this.modeSig.set('list');
    this.failedSig.set(null);
  }

  /**
   * K173: a tour beat. D1, the dashboard with no bank picked; D2, a bank's questions (the water bank's),
   * shown and never sat: the list, never a take (a take creates the assessment). Waits for the read.
   */
  async tourShow(bankKey: string | null): Promise<void> {
    if (this.busySig()) return;
    this.modeSig.set('list');
    this.failedSig.set(null);
    if (!bankKey) {
      this.pickedSig.set(null);
      return;
    }
    if (this.statusSig() !== 'ready') await this.load();
    this.pick(bankKey);
  }

  /** K173 (Back's own view first): whether the list shows with that bank picked (or none). */
  tourShows(bankKey: string | null): boolean {
    return this.modeSig() === 'list' && this.pickedSig() === bankKey;
  }

  /**
   * Take this assessment (K55): delivery's create on the bank's test set, inviting the visitor, then
   * the learner's start and the take read. An existing take is opened again (one attempt).
   */
  async take(): Promise<void> {
    const b = this.picked();
    if (!b || this.busySig()) return;
    const had = this.attemptsSig().get(b.key);
    if (had?.take) {
      this.modeSig.set('take');
      return;
    }
    const visit = this.visit;
    this.busySig.set('take');
    this.failedSig.set(null);
    try {
      let a: DashAttempt = had ?? {
        assessment: await this.api.create({ testSetId: b.testSet.test_set_id, title: b.testSet.title, learnerGcid: await this.session.learnerGcid() }),
        submissionId: null,
        take: null,
        idx: 0,
        answers: new Map(),
        status: 'starting',
        held: false,
        grading: null,
      };
      if (visit !== this.visit) return;
      this.setAttempt(b.key, a);
      if (!a.submissionId) {
        a = { ...a, submissionId: (await this.api.start(a.assessment.assessment_id)).submission_id };
        if (visit !== this.visit) return;
        this.setAttempt(b.key, a);
      }
      const take = await this.api.take(a.assessment.assessment_id);
      if (visit !== this.visit) return;
      for (const r of b.rows) {
        if (r.source.kind !== 'morning' || !r.source.picture) continue;
        const q = take.questions.find((x) => x.test_set_question_id === r.testSetQuestionId);
        if (!q || !pictureOf(q)) console.error(`[kiosk] the step 4 copy ${r.testSetQuestionId} has no picture in the take read of ${a.assessment.assessment_id}: the question shows none`);
      }
      this.setAttempt(b.key, { ...a, take, status: 'in_progress' });
      this.modeSig.set('take');
    } catch (err: unknown) {
      console.error(`[kiosk] the assessment could not be taken: ${err instanceof Error ? err.message : String(err)}`);
      if (visit === this.visit) this.failedSig.set('take');
    } finally {
      if (visit === this.visit) this.busySig.set(null);
    }
  }

  /**
   * See your results, or continue the take (mockup dbxOpen). Results with an open answer held for
   * grading are read again, so a grade released in the grading exhibit shows (never by text).
   */
  open(): void {
    const a = this.attempt();
    if (!a?.take) return;
    this.modeSig.set('take');
    if (a.status === 'submitted' && a.held) void this.reread(this.pickedSig() as string);
  }

  /** From the grading exhibit's released grade (mockup dashSeeResults): that bank's results, read again. */
  seeResults(bankKey: string): void {
    if (this.busySig() || !this.attemptsSig().get(bankKey)?.take) return;
    this.pickedSig.set(bankKey);
    this.failedSig.set(null);
    this.open();
  }

  private async reread(key: string): Promise<void> {
    const a = this.attemptsSig().get(key);
    if (!a?.submissionId) return;
    const visit = this.visit;
    try {
      const grading = await this.api.grading(a.assessment.assessment_id, a.submissionId);
      const now = this.attemptsSig().get(key);
      if (visit === this.visit && now) this.setAttempt(key, { ...now, grading });
    } catch (err: unknown) {
      console.error(`[kiosk] the assessment's marks could not be read again: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  toList(): void {
    if (this.busySig() !== 'submit') this.modeSig.set('list');
  }

  /** Back and Next (mockup dashStep): before the first question is the list; past the last is nothing. */
  step(by: -1 | 1): void {
    const a = this.attempt();
    if (!a?.take || a.status !== 'in_progress' || this.busySig()) return;
    const idx = a.idx + by;
    if (idx < 0) return this.toList();
    if (idx >= a.take.questions.length) return;
    this.setAttempt(this.pickedSig() as string, { ...a, idx });
  }

  /** One answer: an option id for multiple choice, the typed text for the open question. */
  answer(testSetQuestionId: string, value: string): void {
    const a = this.attempt();
    if (!a || a.status !== 'in_progress' || this.busySig()) return;
    this.setAttempt(this.pickedSig() as string, { ...a, answers: new Map(a.answers).set(testSetQuestionId, value) });
  }

  /**
   * Submit (mockup dashSubmit): the answers saved, then the submit, which marks the multiple choice
   * by rules at once and holds the open answer for the grading exhibit (K57); the marks are read back.
   * With a question unanswered the first press only warns (K138 W14: an unanswered question scores 0),
   * and the next press submits.
   */
  async submit(): Promise<void> {
    const key = this.pickedSig() as string;
    const a = this.attempt();
    if (!a?.take || !a.submissionId || a.status !== 'in_progress' || this.busySig()) return;
    const missing = a.take.questions.some((q) => !a.answers.get(q.test_set_question_id)?.trim());
    if (missing && this.warnedSig() !== key) {
      this.warnedSig.set(key);
      return;
    }
    const visit = this.visit;
    this.busySig.set('submit');
    this.failedSig.set(null);
    try {
      const answers = a.take.questions.flatMap((q) => {
        const v = a.answers.get(q.test_set_question_id)?.trim();
        if (!v) return [];
        const base = { test_set_question_id: q.test_set_question_id, question_id: q.question_id };
        return [q.question_type === 'mcq' ? { ...base, question_type: 'mcq' as const, mcq_choice_id: v } : { ...base, question_type: 'oe' as const, oe_response_text: v }];
      });
      if (answers.length) await this.api.save(a.assessment.assessment_id, a.submissionId, answers);
      const sent = await this.api.submit(a.assessment.assessment_id, a.submissionId);
      const grading = await this.api.grading(a.assessment.assessment_id, a.submissionId);
      if (visit !== this.visit) return;
      this.setAttempt(key, { ...a, status: 'submitted', held: sent.grading_held === true, grading });
      const mcq = answers.filter((x) => x.question_type === 'mcq').length;
      if (mcq) this.tally.answered(mcq);
    } catch (err: unknown) {
      console.error(`[kiosk] the assessment could not be submitted: ${err instanceof Error ? err.message : String(err)}`);
      if (visit === this.visit) this.failedSig.set('submit');
    } finally {
      if (visit === this.visit) this.busySig.set(null);
    }
  }



  /** A today tile's value, or null with the reason said loudly: the strip shows no tile rather than a made-up number. */
  private async tile(what: string, read: () => Promise<number>): Promise<number | null> {
    try {
      return await read();
    } catch (err: unknown) {
      console.error(`[kiosk] the dashboard's ${what} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private setAttempt(key: string, a: DashAttempt): void {
    this.attemptsSig.update((m) => new Map(m).set(key, a));
  }

  /** A new visitor starts on a fresh read. */
  forget(): void {
    this.visit++;
    this.modeSig.set('list');
    this.busySig.set(null);
    this.failedSig.set(null);
    this.attemptsSig.set(new Map());
    this.warnedSig.set(null);
    this.doseCompanionSig.set(null);
    this.statusSig.set('idle');
    this.banksSig.set([]);
    this.goalSig.set('');
    this.streakSig.set(null);
    this.manaSig.set(null);
    this.pickedSig.set(null);
  }

  private async read(): Promise<void> {
    this.statusSig.set('loading');
    try {
      const m = await this.manifests.load();
      const goal = await firstValueFrom(this.maps.getGraph(m.world('goal.water')));
      this.goalSig.set(goal.title);
      if (goal.attachedFamiliarId) this.doseCompanionSig.set(goal.attachedFamiliarId);
      else console.error(`[kiosk] the goal ${goal.goalId} has no Companion attached: Today's Daily Dose opens nothing`);
      this.streakSig.set(await this.tile('streak', () => this.today.streakDays()));
      this.manaSig.set(await this.tile('mana', () => this.today.manaBalance()));
      // The step 4 question is the golden run's manual copy (K119); the grading exhibit's question is
      // the one the graded samples' test sets hold.
      const copies = m.choices('manual_copy');
      const sampleSets = new Set(m.choices('graded_sample').map((s) => s.records.test_set_id));
      const gradeQuestions = new Set(m.choices('bank').filter((b) => sampleSets.has(b.records.test_set_id)).flatMap((b) => b.records.question_ids));
      const banks: DashBank[] = [];
      for (const b of BANKS) {
        const rec = m.choice(b.key, 'bank').records;
        const bank = await this.api.bank(rec.bank_id);
        const testSet = await this.api.testSet(rec.test_set_id);
        const rows = testSet.questions.map((q): DashRow => {
          const copy = copies.find((c) => c.records.question_id === q.question_id);
          const source: DashSource = copy
            ? { kind: 'morning', at: copy.preparedAt, picture: copy.records.image_url ? { mode: copyMode(m, copy) } : null }
            : gradeQuestions.has(q.question_id)
              ? { kind: 'alsoGrade' }
              : { kind: 'ai' };
          const type = q.question_type ?? q.snapshot?.question_type;
          if (type !== 'mcq' && type !== 'oe') throw new Error(`[kiosk] test set ${rec.test_set_id} question ${q.test_set_question_id} has no question type`);
          const stem = q.payload_snapshot?.stem?.trim();
          if (!stem) throw new Error(`[kiosk] test set ${rec.test_set_id} question ${q.test_set_question_id} has no stem`);
          return { testSetQuestionId: q.test_set_question_id, questionId: q.question_id, type, stem, points: q.points, source };
        });
        const pictures = [...m.choices('accept'), ...copies].some((c) => rec.question_ids.includes(c.records.question_id) && !!c.records.image_url);
        banks.push({ key: b.key, id: b.id, icon: b.icon, name: bank.name, testSet, rows, step4: copies.some((c) => rec.question_ids.includes(c.records.question_id)), pictures });
      }
      this.banksSig.set(banks);
      this.statusSig.set('ready');
    } catch (err: unknown) {
      console.error(`[kiosk] the dashboard could not be read: ${err instanceof Error ? err.message : String(err)}`);
      this.statusSig.set('failed');
    }
  }

}

/** The mode the step 4 copy's picture was made in: its draft's, when the copy carries that draft's own picture. */
function copyMode(m: PrewarmManifest, copy: PreparedChoice<'manual_copy'>): 'mermaid' | 'scene' | null {
  const from = m.choices('question_draft').find((d) => d.records.draft_id === copy.records.from_draft_id);
  if (from?.records.image_url && from.records.image_url === copy.records.image_url) return from.records.image_mode;
  console.error(`[kiosk] ${copy.key}'s picture is not its draft ${copy.records.from_draft_id}'s own: the dashboard shows it with no mode`);
  return null;
}
