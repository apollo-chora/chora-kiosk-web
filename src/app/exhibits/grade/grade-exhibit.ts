import { Injectable, computed, inject, signal } from '@angular/core';

import { ManifestService, type PreparedChoice } from '../../kiosk-api/manifest.service';
import { SessionService } from '../../kiosk-api/session.service';
import type { GradeParams, GradeResult } from '../../live/kinds/grade.live';
import { LiveService, type LiveOutcome } from '../../live/live.service';
import { LIVE_KINDS } from '../../live/live-kinds';
import { AssessmentsService, type GradedRow, type GradingRead } from '../../product-api/assessments.service';
import { VisitTally } from '../../shared/visit-tally';
import { composite, type RubricWeight } from './composite';
import type { Arrival } from '../../shell/tour/kiosk-tour';

/** The grading exhibit's LIVE row: one result on screen, the open answer's grade. */
export const GRADE_LIVE_KEY = 'grade:grade:answer';

/**
 * The instructor's note for one changed criterion, as the mockup words it (grade.adjNote, line
 * 1607). It is written into the learner's comment, so it is content: English in every language
 * (K41), and the stored record carries every change (production stores only the question's
 * total and its comment; the orchestrator's T3.9 b ruling A).
 */
export function adjNote(criterion: string, ai: number, final: number): string {
  return `Instructor’s note: “${criterion}” changed from ${ai} ${ai === 1 ? 'mark' : 'marks'} to ${final}.`;
}

/** The open question the samples were graded on (bank.grading's published test set). */
export interface GradeQuestion {
  readonly testSetId: string;
  readonly title: string;
  readonly testSetQuestionId: string;
  readonly questionId: string;
  readonly stem: string;
  readonly rubric: readonly string[];
  /** The question's picture, from the accept choice that made it (null: said loudly). */
  readonly picture: string | null;
}

export type SampleKey = 'strong' | 'weak';

/** A sample answer the golden run graded this morning (PREPARED-CHOICES.md 5.10): its grade is prepared. */
export interface GradeSample {
  readonly key: SampleKey;
  readonly assessmentId: string;
  readonly submissionId: string;
  readonly text: string;
  readonly preparedAt: Date;
  readonly read: GradingRead;
}

/** One criterion as the grading crew scored it. */
export interface GradeCriterion {
  /** The rubric's criterion_id, which carries the criterion's weight. */
  readonly id: string;
  readonly title: string;
  readonly ai: number;
  readonly max: number;
  readonly feedback: string;
}

/** The open answer on review (K27): the crew's grade as the grading read gives it. */
export interface GradeOnReview {
  readonly assessmentId: string;
  readonly submissionId: string;
  readonly testSetQuestionId: string;
  /** The morning's prepared grade, or this visit's LIVE press. */
  readonly origin: 'prepared' | 'live';
  readonly preparedAt: Date | null;
  readonly points: number;
  readonly aiTotal: number;
  readonly possible: number;
  readonly comment: string;
  readonly criteria: readonly GradeCriterion[];
  /** The weights the crew's total was computed on (the test set's rubric, as the grading read projects it). */
  readonly rubric: readonly RubricWeight[];
}

/** A released grade, read back from the grading read; `final` is this visit's stepper, null when read without it. */
export interface GradeReleased {
  readonly submissionId: string;
  readonly origin: 'prepared' | 'live';
  readonly preparedAt: Date | null;
  readonly total: number;
  readonly possible: number;
  readonly aiTotal: number;
  readonly comment: string;
  readonly criteria: readonly (GradeCriterion & { readonly final: number | null })[];
}

/** The visitor's own answer from the dashboard's results (mockup dashToGrade): its held submission, graded there behind LIVE. */
export interface DashLink {
  readonly bankKey: string;
  readonly assessmentId: string;
  readonly submissionId: string;
  readonly testSetQuestionId: string;
  readonly text: string;
  /** The dashboard assessment's title (grade.subFromDash). */
  readonly title: string;
  /**
   * The question this answer was written for (K159, W27): its stem and rubric from the bank's test
   * set, its picture from its accept, so a nature or hawker answer is never shown under water's.
   */
  readonly question: {
    readonly stem: string;
    readonly rubric: readonly string[];
    readonly picture: string | null;
    /** The picture's caption: water's own (dbx.q3Cap) only for the question the samples answer. */
    readonly captionKey: 'dbx.q3Cap' | 'img.label';
  };
}

/** The question on screen: the exhibit's own, or the dashboard answer's (only what the card draws). */
export type ShownQuestion = Pick<GradeQuestion, 'testSetQuestionId' | 'stem' | 'rubric' | 'picture'> & { readonly captionKey: 'dbx.q3Cap' | 'img.label' };

/** Where the answer on screen comes from: a sample, the visitor's own words, or their dashboard answer. */
export type GradeSource = { readonly kind: 'sample'; readonly key: SampleKey } | { readonly kind: 'typed' } | { readonly kind: 'dash' };

/** Why the last LIVE press gave no grade (the scene says it; no prepared grade stands behind a typed answer). */
export type GradeMiss = 'late' | 'failed' | 'stopped';

/**
 * The grading exhibit (mockup SCENES.grade, GRADE line 3539, K27, K57): an open answer scored by
 * the grading crew, then reviewed and released by the visitor acting as the instructor. A sample
 * shows the grade the golden run prepared; the visitor's own words go to the crew behind LIVE, on
 * a fresh assessment the press makes. Every number and word on review is the grading read's.
 */
@Injectable({ providedIn: 'root' })
export class GradeExhibit {
  private readonly manifests = inject(ManifestService);
  private readonly api = inject(AssessmentsService);
  private readonly session = inject(SessionService);
  private readonly live = inject(LiveService);
  private readonly tally = inject(VisitTally);

  private readonly statusSig = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  private readonly questionSig = signal<GradeQuestion | null>(null);
  private readonly samplesSig = signal<ReadonlyMap<SampleKey, GradeSample>>(new Map());
  private readonly sourceSig = signal<GradeSource>({ kind: 'sample', key: 'strong' });
  private readonly typedSig = signal('');
  /** K186: the typed answers graded live this demo session; the same words are never graded live again. */
  private readonly gradedLiveSig = signal<ReadonlySet<string>>(new Set());
  private readonly reviewSig = signal<GradeOnReview | null>(null);
  private readonly finalSig = signal<readonly number[]>([]);
  private readonly commentSig = signal('');
  private readonly editedSig = signal(false);
  private readonly busySig = signal<'release' | null>(null);
  private readonly failedSig = signal<'review' | 'release' | null>(null);
  private readonly missSig = signal<GradeMiss | null>(null);
  private readonly releasedSig = signal<ReadonlyMap<string, GradeReleased>>(new Map());
  private readonly dashSig = signal<DashLink | null>(null);
  /** W79: a live grade that came back while its answer was off screen (the scene left mid-call), by answer, until it returns. */
  private readonly heldSig = signal<ReadonlyMap<string, GradeResult>>(new Map());
  private readonly calling = computed(() => this.live.state(GRADE_LIVE_KEY)()?.status === 'calling');

  constructor() {
    // W79: the grade comes from the one LIVE door, with the answer it was pressed for, so a scene left mid-call
    // loses nothing and a grade never lands on another answer; the row binds no outcome.
    this.live.onOutcome((key, o, params) => {
      if (key === GRADE_LIVE_KEY) this.onGradeOutcome(o as LiveOutcome<GradeResult>, params as GradeParams);
    });
  }
  private learnerGcid: string | null = null;
  private loading: Promise<void> | null = null;
  /** Counts visitors: a call that outlives its visit (a reset) writes nothing. */
  private visit = 0;

  readonly status = this.statusSig.asReadonly();
  /**
   * The question on screen: a dashboard answer's own (W27; the grading crew already reads the
   * submission's real question server-side, so this is the screen only), else the samples' question.
   */
  readonly question = computed<ShownQuestion | null>(() => {
    const d = this.dashSig();
    if (this.sourceSig().kind === 'dash' && d) return { testSetQuestionId: d.testSetQuestionId, ...d.question };
    const own = this.questionSig();
    return own && { ...own, captionKey: 'dbx.q3Cap' };
  });
  readonly source = this.sourceSig.asReadonly();
  readonly review = this.reviewSig.asReadonly();
  /** The steppers, one per criterion of the answer on review. */
  readonly final = this.finalSig.asReadonly();
  /** The comment as the visitor leaves it (the crew's until edited); the notes are added on release. */
  readonly comment = this.commentSig.asReadonly();
  readonly busy = this.busySig.asReadonly();
  readonly failed = this.failedSig.asReadonly();
  readonly miss = this.missSig.asReadonly();
  /** The dashboard answer on screen, if the visitor came from the dashboard's results. */
  readonly dash = this.dashSig.asReadonly();
  /** The answer on screen: a sample's verbatim, the dashboard answer, or what the visitor typed. */
  readonly text = computed(() => {
    const s = this.sourceSig();
    if (s.kind === 'sample') return this.samplesSig().get(s.key)?.text ?? '';
    return s.kind === 'dash' ? (this.dashSig()?.text ?? '') : this.typedSig();
  });
  /** The released grade on screen, if the answer on screen has one this visit. */
  readonly released = computed(() => {
    const id = this.reviewSig()?.submissionId ?? (this.sourceSig().kind === 'dash' ? this.dashSig()?.submissionId : this.sampleOnScreen()?.submissionId);
    return id ? (this.releasedSig().get(id) ?? null) : null;
  });
  readonly stage = computed<'answer' | 'review' | 'released'>(() => (this.released() ? 'released' : this.reviewSig() ? 'review' : 'answer'));
  /**
   * The points a release would store: the steppers through production's own rule on the rubric's
   * weights (composite.ts, scoring.py compute_composite), never their plain sum. With no stepper
   * changed it is the AI's total exactly, which toReview checks before a grade goes on review.
   */
  readonly releaseTotal = computed(() => {
    const r = this.reviewSig();
    return r ? totalOf(r, this.finalSig()) : null;
  });
  /** The instructor's notes the release will add, one per changed criterion. */
  readonly notes = computed(() => {
    const r = this.reviewSig();
    const f = this.finalSig();
    return r ? r.criteria.flatMap((c, i) => (f[i] !== c.ai ? [adjNote(c.title, c.ai, f[i])] : [])) : [];
  });
  /**
   * The LIVE press's parameters: the dashboard answer's held submission, or, for typed words, a
   * fresh assessment of the grading test set; null when there is nothing to grade.
   */
  readonly liveParams = computed<GradeParams | null>(() => {
    const source = this.sourceSig().kind;
    const d = this.dashSig();
    if (source === 'dash') return d ? { assessmentId: d.assessmentId, submissionId: d.submissionId } : null;
    const q = this.questionSig();
    const text = this.typedSig().trim();
    if (!q || !text || !this.learnerGcid || source !== 'typed') return null;
    return { typed: { testSetId: q.testSetId, title: q.title, learnerGcid: this.learnerGcid, testSetQuestionId: q.testSetQuestionId, questionId: q.questionId, text } };
  });

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.read().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  /** A sample chip (mockup data-act sample): its verbatim answer, and its released grade if it has one. */
  useSample(key: SampleKey): void {
    if (this.locked()) return;
    this.dashSig.set(null);
    this.toAnswer({ kind: 'sample', key });
  }

  /** From the dashboard's results (mockup dashToGrade): the visitor's held answer, graded here behind LIVE. */
  fromDash(link: DashLink): void {
    if (this.busySig() || this.calling()) return;
    this.dashSig.set(link);
    this.toAnswer({ kind: 'dash' });
    this.showHeld();
  }

  /** From the dashboard's results with no open answer written: a sample, shown graded here. */
  showSample(key: SampleKey): void {
    if (this.busySig() || this.calling()) return;
    this.dashSig.set(null);
    this.toAnswer({ kind: 'sample', key });
  }

  /** The visitor's own words; a text equal to a sample's is that sample. The dashboard answer cannot be edited here. */
  type(text: string): void {
    if (this.locked() || this.sourceSig().kind === 'dash') return;
    const sample = [...this.samplesSig().values()].find((s) => s.text === text.trim());
    if (!sample) this.typedSig.set(text);
    // K186: a different answer is a new request, so the LIVE row's spent result goes; the same words stay spent.
    if (!this.gradedLiveSig().has(text.trim())) this.live.clear(GRADE_LIVE_KEY);
    this.toAnswer(sample ? { kind: 'sample', key: sample.key } : { kind: 'typed' });
    this.showHeld();
  }

  /** K186: the words on screen were graded live already this demo session, so LIVE offers no second grade of them. */
  readonly gradedLive = computed(() => this.sourceSig().kind === 'typed' && this.gradedLiveSig().has(this.typedSig().trim()));

  /** Submit for grading with a sample: the morning's grade, on review (no model call; K50). */
  submitSample(): void {
    const sample = this.sampleOnScreen();
    if (!sample || this.locked()) return;
    if (this.releasedSig().has(sample.submissionId)) return;
    this.failedSig.set(null);
    this.toReview(sample.read, 'prepared', sample.preparedAt, sample.assessmentId, (this.questionSig() as GradeQuestion).testSetQuestionId);
  }

  /**
   * K173: a tour beat, always on the STRONG sample (F52: the weak one's release embeds on Vertex, a model
   * call nobody pressed). G1 ('answer') shows it; G2 ('review') puts its prepared grade on review (no
   * call); G3 ('release') by Next approves and releases it (Pingu +30, K140), by Back writes nothing. A
   * released sample shows released on every beat, and arriving again writes nothing (K42). A LIVE grade
   * still running keeps the card as it is.
   */
  async tourShow(step: 'answer' | 'review' | 'release', by: Arrival): Promise<void> {
    if (this.statusSig() !== 'ready') await this.load();
    if (this.statusSig() !== 'ready' || this.busySig() || this.calling()) return;
    if (step === 'answer' || !this.onStrong()) {
      this.dashSig.set(null);
      this.toAnswer({ kind: 'sample', key: 'strong' });
    }
    if (step === 'answer') return;
    this.submitSample();
    if (step === 'release' && by === 'next') await this.release();
  }

  /** K173 (Back's own view first): whether the card shows the beat's view of the strong sample (released counts for all three). */
  tourShows(step: 'answer' | 'review' | 'release'): boolean {
    if (!this.onStrong()) return false;
    const stage = this.stage();
    return stage === 'released' || stage === (step === 'answer' ? 'answer' : 'review');
  }

  /** W100: the strong sample shows released, so G3 has nothing left to do and Next passes it. */
  tourReleased(): boolean {
    return this.onStrong() && this.stage() === 'released';
  }

  private onStrong(): boolean {
    const s = this.sourceSig();
    return s.kind === 'sample' && s.key === 'strong';
  }

  /**
   * A LIVE grade press for the answer `params` names ended: the crew's grade goes on review; a miss is said,
   * and nothing is shown as graded. W79: when that answer is no longer on screen (the scene was left mid-call),
   * its grade is held until it returns, never put on the answer now shown.
   */
  onGradeOutcome(o: LiveOutcome<GradeResult>, params: GradeParams): void {
    const answer = answerOf(params);
    const onScreen = answer === this.answerOnScreen();
    if (o.status === 'done') {
      if ('typed' in params) this.gradedLiveSig.update((s) => new Set(s).add(params.typed.text));
      if (!onScreen) {
        this.heldSig.update((m) => new Map(m).set(answer, o.result));
        return;
      }
      this.missSig.set(null);
      this.toReview(o.result.detail, 'live', null, o.result.assessmentId, this.testSetQuestionOnScreen());
      return;
    }
    if (onScreen) this.missSig.set(o.status === 'stopped' ? 'stopped' : o.reason);
  }

  /** The answer on screen as a LIVE press names it: the dashboard answer's submission, or the typed words; a sample is none. */
  private answerOnScreen(): string | null {
    const s = this.sourceSig().kind;
    if (s === 'dash') return this.dashSig() ? `dash:${this.dashSig()?.submissionId}` : null;
    return s === 'typed' ? `typed:${this.typedSig().trim()}` : null;
  }

  private testSetQuestionOnScreen(): string {
    return (this.sourceSig().kind === 'dash' ? this.dashSig()?.testSetQuestionId : this.questionSig()?.testSetQuestionId) as string;
  }

  /** W79: the answer back on screen had its live grade come back while it was away: that grade goes on review. */
  private showHeld(): void {
    const answer = this.answerOnScreen();
    const held = answer ? this.heldSig().get(answer) : undefined;
    if (!answer || !held) return;
    this.heldSig.update((m) => {
      const next = new Map(m);
      next.delete(answer);
      return next;
    });
    this.toReview(held.detail, 'live', null, held.assessmentId, this.testSetQuestionOnScreen());
  }

  /** A criterion's stepper (mockup adjustGrade), within 0 and its maximum. */
  adjust(i: number, by: -1 | 1): void {
    const r = this.reviewSig();
    if (!r || this.busySig() || !r.criteria[i]) return;
    this.finalSig.update((f) => f.map((v, k) => (k === i ? Math.max(0, Math.min(r.criteria[i].max, v + by)) : v)));
  }

  editComment(text: string): void {
    if (!this.reviewSig() || this.busySig()) return;
    this.commentSig.set(text);
    this.editedSig.set(true);
  }

  /**
   * Approve and release as the instructor (K27): the person's changes (the steppers' weighted
   * total, and the comment as left with one note per changed criterion; only what changed is sent,
   * so an unchanged field keeps its AI provenance), then approve, then release; the grade shown
   * after is read back from the grading read.
   */
  async release(): Promise<void> {
    const r = this.reviewSig();
    if (!r || this.busySig() || this.released()) return;
    const visit = this.visit;
    const final = this.finalSig();
    const total = totalOf(r, final);
    const comment = [this.editedSig() ? this.commentSig().trim() : r.comment, ...this.notes()].filter((x) => x).join(' ');
    this.busySig.set('release');
    this.failedSig.set(null);
    try {
      const edit = { pointsEarned: total !== r.points ? total : undefined, comment: comment !== r.comment ? comment : undefined };
      if (edit.pointsEarned !== undefined || edit.comment !== undefined) await this.api.editGrade(r.assessmentId, r.submissionId, { testSetQuestionId: r.testSetQuestionId, ...edit });
      await this.api.approve(r.assessmentId, r.submissionId);
      await this.api.release(r.assessmentId);
      const read = await this.api.grading(r.assessmentId, r.submissionId);
      if (visit !== this.visit) return;
      const row = this.oeRow(read, r.testSetQuestionId);
      this.releasedSig.update((m) =>
        new Map(m).set(r.submissionId, {
          submissionId: r.submissionId,
          origin: r.origin,
          preparedAt: r.preparedAt,
          total: row.points_earned,
          possible: row.points_possible,
          aiTotal: r.aiTotal,
          comment: row.comment ?? '',
          criteria: r.criteria.map((c, i) => ({ ...c, final: final[i] })),
        }),
      );
      this.tally.answered();
    } catch (err: unknown) {
      console.error(`[kiosk] the grade could not be released: ${err instanceof Error ? err.message : String(err)}`);
      if (visit === this.visit) this.failedSig.set('release');
    } finally {
      if (visit === this.visit) this.busySig.set(null);
    }
  }

  /** Grade another answer: back to the answer, keeping what was released this visit. */
  again(): void {
    if (this.busySig()) return;
    this.reviewSig.set(null);
    this.missSig.set(null);
    this.failedSig.set(null);
  }

  /**
   * The grading scene was left (K138 W8): a dashboard answer goes back to the dashboard, whose
   * results hand it over again, so Grading opened from the hall always shows the prepared samples.
   * The samples' reviews and releases stay as they were.
   */
  leave(): void {
    if (this.sourceSig().kind !== 'dash') return;
    this.dashSig.set(null);
    this.toAnswer({ kind: 'sample', key: 'strong' });
  }

  /** A new visitor starts on a fresh read. */
  forget(): void {
    this.visit++;
    this.statusSig.set('idle');
    this.questionSig.set(null);
    this.samplesSig.set(new Map());
    this.sourceSig.set({ kind: 'sample', key: 'strong' });
    this.typedSig.set('');
    this.reviewSig.set(null);
    this.finalSig.set([]);
    this.commentSig.set('');
    this.editedSig.set(false);
    this.busySig.set(null);
    this.failedSig.set(null);
    this.missSig.set(null);
    this.releasedSig.set(new Map());
    this.heldSig.set(new Map());
    this.gradedLiveSig.set(new Set());
    this.dashSig.set(null);
    this.learnerGcid = null;
  }

  /** On review, releasing or while the LIVE grade runs, the question card is locked; a released grade leaves it open for another answer. */
  readonly locked = computed(() => this.stage() === 'review' || this.busySig() !== null || this.calling());

  /** Another answer on the card: what was on review or released stays with its own answer. */
  private toAnswer(source: GradeSource): void {
    this.sourceSig.set(source);
    this.reviewSig.set(null);
    this.missSig.set(null);
    this.failedSig.set(null);
  }

  private sampleOnScreen(): GradeSample | null {
    const s = this.sourceSig();
    return s.kind === 'sample' ? (this.samplesSig().get(s.key) ?? null) : null;
  }

  /** The crew's grade on review; a grade that is not waiting for the person, or lacks a criterion's numbers, says so. */
  private toReview(read: GradingRead, origin: 'prepared' | 'live', preparedAt: Date | null, assessmentId: string, testSetQuestionId: string): void {
    try {
      const row = this.oeRow(read, testSetQuestionId);
      if (read.state === 'RELEASED' || read.review_status === 'APPROVED') {
        this.releasedSig.update((m) => new Map(m).set(read.submission_id, released(read, row, origin, preparedAt)));
        return;
      }
      if (read.state !== 'GRADED' || read.review_status !== 'PENDING_REVIEW') {
        throw new Error(`submission ${read.submission_id} is ${read.state} with review ${String(read.review_status)}, not graded and waiting for the person`);
      }
      const criteria = criteriaOf(row, read.submission_id);
      const rubric = rubricOf(row, read.submission_id);
      const weighed = new Set(rubric.map((c) => c.criterionId));
      const stray = criteria.find((c) => !weighed.has(c.id));
      if (stray) throw new Error(`submission ${read.submission_id}'s criterion ${stray.id} is not in its rubric, so its stepper could not move the grade`);
      const aiTotal = row.ai_points_earned ?? row.points_earned;
      const ruled = composite(rubric, criteria.map((c) => ({ criterionId: c.id, score: c.ai, max: c.max })), row.points_possible);
      if (ruled !== aiTotal) throw new Error(`submission ${read.submission_id}: the AI's ${aiTotal} of ${row.points_possible} is not what its rubric gives (${ruled})`);
      const comment = row.comment ?? row.ai_comment ?? '';
      this.reviewSig.set({
        assessmentId,
        submissionId: read.submission_id,
        testSetQuestionId,
        origin,
        preparedAt,
        points: row.points_earned,
        aiTotal,
        possible: row.points_possible,
        comment,
        criteria,
        rubric,
      });
      this.finalSig.set(criteria.map((c) => c.ai));
      this.commentSig.set(comment);
      this.editedSig.set(false);
    } catch (err: unknown) {
      console.error(`[kiosk] the grade cannot be reviewed: ${err instanceof Error ? err.message : String(err)}`);
      this.failedSig.set('review');
    }
  }

  private oeRow(read: GradingRead, testSetQuestionId: string): GradedRow {
    const row = read.questions.find((x) => x.test_set_question_id === testSetQuestionId && x.question_type === 'oe');
    if (!row) throw new Error(`submission ${read.submission_id} has no open answer for ${testSetQuestionId}`);
    return row;
  }

  private async read(): Promise<void> {
    this.statusSig.set('loading');
    const visit = this.visit;
    try {
      const m = await this.manifests.load();
      const choices = (['strong', 'weak'] as const).map((k) => [k, m.choice(`sample.${k}`, 'graded_sample')] as const);
      const first = choices[0][1].records;
      for (const [k, c] of choices) {
        if (c.records.test_set_id !== first.test_set_id || c.records.test_set_question_id !== first.test_set_question_id) {
          throw new Error(`[kiosk] sample.${k} is not graded on the same question as sample.strong`);
        }
      }
      const ts = await this.api.testSet(first.test_set_id);
      const tq = ts.questions.find((x) => x.test_set_question_id === first.test_set_question_id);
      const stem = tq?.payload_snapshot?.stem?.trim();
      if (!tq || !stem) throw new Error(`[kiosk] test set ${first.test_set_id} has no published open question ${first.test_set_question_id}`);
      const rubric = (tq.payload_snapshot?.rubric ?? []).map((r) => (r.description || r.title || '').trim()).filter((x) => x);
      if (!rubric.length) throw new Error(`[kiosk] the open question ${first.test_set_question_id} publishes no rubric`);
      const picture = m.choices('accept').find((a) => a.records.question_id === first.question_id)?.records.image_url ?? null;
      if (!picture) console.error(`[kiosk] no accept choice records a picture for question ${first.question_id}: the grading exhibit shows none`);
      const samples = new Map<SampleKey, GradeSample>();
      for (const [k, c] of choices) samples.set(k, await this.sample(k, c));
      const gcid = await this.session.learnerGcid();
      if (visit !== this.visit) return;
      this.questionSig.set({ testSetId: first.test_set_id, title: ts.title, testSetQuestionId: first.test_set_question_id, questionId: first.question_id, stem, rubric, picture });
      this.samplesSig.set(samples);
      this.learnerGcid = gcid;
      this.statusSig.set('ready');
    } catch (err: unknown) {
      console.error(`[kiosk] the grading exhibit could not be read: ${err instanceof Error ? err.message : String(err)}`);
      if (visit === this.visit) this.statusSig.set('failed');
    }
  }

  /** A sample's answer and its grade, as the golden run left them (graded, waiting for the person). */
  private async sample(key: SampleKey, c: PreparedChoice<'graded_sample'>): Promise<GradeSample> {
    const r = c.records;
    const read = await this.api.grading(r.assessment_id, r.submission_id);
    const text = this.oeRow(read, r.test_set_question_id).learner_answer?.oe_response_text?.trim();
    if (!text) throw new Error(`[kiosk] sample.${key}'s submission ${r.submission_id} holds no answer`);
    return { key, assessmentId: r.assessment_id, submissionId: r.submission_id, text, preparedAt: c.preparedAt, read };
  }
}

/** The late line's limit, in seconds (live.gradeLate). */
export const GRADE_LIMIT_S = String(LIVE_KINDS.grade.limitMs / 1000);

function criteriaOf(row: GradedRow, submissionId: string): GradeCriterion[] {
  const rows = row.criterion_scores ?? [];
  if (!rows.length) throw new Error(`submission ${submissionId}'s open answer has no criterion scores`);
  return rows.map((c, i) => {
    if (!c.criterion_id?.trim() || !c.title?.trim() || typeof c.score !== 'number' || typeof c.max_score !== 'number') {
      throw new Error(`submission ${submissionId}'s criterion ${i + 1} lacks its id, title, score or maximum`);
    }
    return { id: c.criterion_id.trim(), title: c.title.trim(), ai: c.score, max: c.max_score, feedback: c.feedback?.trim() ?? '' };
  });
}

/** The weights the crew graded on; without them no stepper total can follow production's rule. */
function rubricOf(row: GradedRow, submissionId: string): RubricWeight[] {
  const rows = row.rubric ?? [];
  if (!rows.length) throw new Error(`submission ${submissionId}'s open answer carries no rubric, so a changed score has no weights`);
  return rows.map((c, i) => {
    if (!c.criterion_id?.trim() || typeof c.weight !== 'number') throw new Error(`submission ${submissionId}'s rubric criterion ${i + 1} lacks its id or weight`);
    return { criterionId: c.criterion_id.trim(), weight: c.weight };
  });
}

/** The points the steppers give, by production's rule on the review's rubric. */
function totalOf(r: GradeOnReview, final: readonly number[]): number {
  return composite(r.rubric, r.criteria.map((c, i) => ({ criterionId: c.id, score: final[i], max: c.max })), r.possible);
}

/** A grade already released, as stored: no stepper state, so no "adjusted by you" tag. */
function released(read: GradingRead, row: GradedRow, origin: 'prepared' | 'live', preparedAt: Date | null): GradeReleased {
  return {
    submissionId: read.submission_id,
    origin,
    preparedAt,
    total: row.points_earned,
    possible: row.points_possible,
    aiTotal: row.ai_points_earned ?? row.points_earned,
    comment: row.comment ?? '',
    criteria: criteriaOf(row, read.submission_id).map((c) => ({ ...c, final: null })),
  };
}

/** The answer a LIVE grade press was for, as `answerOnScreen` names it: the submission, or the typed words. */
function answerOf(params: GradeParams): string {
  return 'typed' in params ? `typed:${params.typed.text}` : `dash:${params.submissionId}`;
}
