import { ChangeDetectionStrategy, Component, TemplateRef, computed, effect, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ContentDirective } from '../../i18n/content.directive';
import { KioskLanguage } from '../../i18n/i18n';
import { IconComponent } from '../../shared/icon/icon.component';
import { formatWhen } from '../../shared/when';
import { provideSceneFooter } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';
import { TeacherStudio } from '../../story/teacher-studio';
import type { LearnerQuestion } from '../../aplus/me-assessments/me-assessments.model';
import { CompanionsExhibit } from '../companions/companions-exhibit';
import { GradeExhibit } from '../grade/grade-exhibit';
import { DashboardExhibit, pictureOf, type DashAttempt, type DashBank, type DashSource } from './dashboard-exhibit';
import { XrayButtonComponent } from '../../xray/xray-button.component';
import { VisitOrder } from '../../shared/visit-order';
import { PreparedInfoComponent } from '../../shared/prepared-info/prepared-info.component';

const MARKS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** The mode tag of the step 4 picture (mockup dashPicMode): the draft's image mode. */
const MODE_KEY = { mermaid: 'img.modeDiagram', scene: 'img.modeIllus' } as const;

/**
 * A take question's stem and options (the take read's prompt; no key), in this visit's order (K149):
 * delivery's per-learner shuffle (K145) is one order for the kiosk's one learner, the same for every
 * visitor, so the take and the results draw the visit's own order over it, and both letter the
 * options alike. Answers still go by option id; the grading exhibit keeps delivery's order.
 */
function promptOf(q: LearnerQuestion, order: VisitOrder): { readonly stem: string; readonly options: readonly { readonly id: string; readonly text: string }[] } {
  const p = typeof q.prompt === 'string' ? { stem: q.prompt } : q.prompt;
  const options = (('options' in p && p.options) || []).map((o) => ({ id: o.option_id, text: o.text || o.label }));
  return { stem: p.stem, options: order.options(options, (o) => o.id) };
}

/**
 * A learner's dashboard (mockup SCENES.dash, dashTodayHTML, dashBanksHTML and dashAssessHTML,
 * lines 5392, 5567, 5216 and 5241): the today strip with its dose note, the question banks and the
 * assessment the picked one feeds, with its questions (answers hidden) and "Take this assessment"
 * (K55, K79). While the visitor sits it the talking point is dashTake (the mockup's review key).
 */
@Component({
  selector: 'kiosk-dashboard-scene',
  imports: [TranslatePipe, ContentDirective, IconComponent, XrayButtonComponent, PreparedInfoComponent, TourFooterComponent],
  templateUrl: './dashboard-scene.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSceneComponent {
  protected readonly exhibit = inject(DashboardExhibit);
  protected readonly store = inject(KioskStore);
  protected readonly lang = inject(KioskLanguage).lang;
  private readonly studio = inject(TeacherStudio);
  private readonly companions = inject(CompanionsExhibit);
  private readonly grade = inject(GradeExhibit);
  private readonly order = inject(VisitOrder);
  protected readonly flow = [1, 2, 3, 4] as const;
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');

  constructor() {
    provideSceneFooter(this.footer);
    // Lead 6b: a read that failed (a 502 while a reset ran elsewhere) is tried again when the scene opens again.
    if (this.exhibit.status() === 'idle' || this.exhibit.status() === 'failed') void this.exhibit.load();
    effect(() => this.store.setTalkKey(this.exhibit.mode() === 'take' ? 'dashTake' : 'dash'));
    // K173: the keys follow the tour; a take's questions step by its own buttons (dbx.prevQ, dbx.nextQ).
    provideTourNav();
  }

  /** The source line's string key and its params (db.src.*). */
  protected source(s: DashSource): { readonly key: string; readonly params: Record<string, string> } {
    if (s.kind === 'morning') return { key: 'db.src.morning', params: { when: formatWhen(s.at.toISOString(), this.lang()) } };
    if (s.kind === 'alsoGrade') return { key: 'db.src.alsoGrade', params: {} };
    return { key: 'db.src.ai', params: {} };
  }

  /** How many steps of "bank, test set, assessment, your assessments" are lit (mockup dashBanksHTML). */
  protected lit(): number {
    return this.exhibit.picked() ? (this.exhibit.attempt()?.take ? 4 : 3) : 0;
  }

  /** The status chip (mockup dashChipHTML): its class and its words; a held open answer once released is graded. */
  protected chip(a: DashAttempt | null): { readonly cls: string; readonly key: string } {
    if (!a?.take) return { cls: 'db-idle', key: 'db.status.idle' };
    if (a.status !== 'submitted') return { cls: 'available', key: 'dbx.status.inProgress' };
    return { cls: 'dbx-submitted', key: a.held && a.grading?.state !== 'RELEASED' ? 'dbx.status.submitted' : 'dbx.status.graded' };
  }

  /**
   * To the grading exhibit (mockup dashToGrade): the visitor's held open answer, graded there behind
   * LIVE, or, with no answer written, a sample shown graded there.
   */
  protected toGrade(): void {
    const b = this.exhibit.picked();
    const a = this.exhibit.attempt();
    const q = a?.take?.questions.find((x) => x.question_type === 'oe');
    if (!b || !a?.submissionId || !q) return;
    const text = a.answers.get(q.test_set_question_id)?.trim();
    if (text) {
      const tq = b.testSet.questions.find((x) => x.test_set_question_id === q.test_set_question_id);
      const rubric = (tq?.payload_snapshot?.rubric ?? []).map((r) => (r.description || r.title || '').trim()).filter((x) => x);
      if (!rubric.length) console.error(`[kiosk] the open question ${q.test_set_question_id} of ${b.key} publishes no rubric: Grading shows none`);
      const own = b.rows.some((r) => r.testSetQuestionId === q.test_set_question_id && r.source.kind === 'alsoGrade');
      const question = {
        stem: (tq?.payload_snapshot?.stem ?? (typeof q.prompt === 'string' ? q.prompt : q.prompt.stem)).trim(),
        rubric,
        picture: pictureOf(q),
        captionKey: own ? ('dbx.q3Cap' as const) : ('img.label' as const),
      };
      this.grade.fromDash({ bankKey: b.key, assessmentId: a.assessment.assessment_id, submissionId: a.submissionId, testSetQuestionId: q.test_set_question_id, text, title: b.testSet.title, question });
    } else {
      this.grade.showSample('strong');
    }
    this.store.openScene('grade');
  }

  /**
   * W27: a graded sample can stand in for an empty open answer only on the question the samples answer
   * (water's q3, the one "Get an answer graded" holds); another bank's open question has none.
   */
  protected readonly canSample = computed(() => this.exhibit.picked()?.rows.some((r) => r.type === 'oe' && r.source.kind === 'alsoGrade') ?? false);

  /** The assessment's own window, as delivery made it (no window was sent: now to +24 h). */
  protected window(a: DashAttempt): { readonly from: string; readonly to: string } {
    return { from: formatWhen(a.assessment.scheduled_open_at, this.lang()), to: formatWhen(a.assessment.scheduled_close_at, this.lang()) };
  }

  /** The question on screen while the take is in progress (mockup dashQuestionHTML). */
  protected readonly question = computed(() => {
    const a = this.exhibit.attempt();
    if (!a?.take || a.status !== 'in_progress') return null;
    const q = a.take.questions[a.idx];
    return { q, ...promptOf(q, this.order), idx: a.idx, n: a.take.questions.length, last: a.idx === a.take.questions.length - 1, value: a.answers.get(q.test_set_question_id) ?? '' };
  });

  /**
   * The question's picture beside it (mockup dashPicPanelHTML and dashImgPanelHTML): the step 4 copy
   * with its mode, when it was prepared and, after a Keep in step 4, that this assessment holds the
   * version prepared for the demo (K119, Q1 A); the open question with its caption; the AI mark on
   * every one (K66).
   */
  protected readonly side = computed(() => {
    const v = this.question();
    const url = v && pictureOf(v.q);
    if (!v || !url) return null;
    const src = this.exhibit.picked()?.rows.find((r) => r.testSetQuestionId === v.q.test_set_question_id)?.source;
    if (src?.kind === 'morning') {
      const mode = src.picture?.mode ?? null;
      return {
        url,
        modeKey: mode ? MODE_KEY[mode] : null,
        altKey: mode === 'mermaid' ? 'dbx.altDiagram' : 'img.label',
        when: formatWhen(src.at.toISOString(), this.lang()),
        kept: this.studio.kept() !== null,
        caption: false,
      };
    }
    const caption = src?.kind === 'alsoGrade';
    return { url, modeKey: null, altKey: caption ? 'dbx.q3Cap' : 'img.label', when: null, kept: false, caption };
  });

  /**
   * "Today's Daily Dose" (K160, amending K49): today's practice cards for the active goal, as
   * Companions' "Today's dose" shows them for that goal's Companion with its greeting (K54, K127), so
   * the button opens that dose, as the atlas's "Practise today's dose" does (mockup doseFromMap).
   */
  protected openDose(): void {
    const id = this.exhibit.doseCompanion();
    if (!id) {
      console.error('[kiosk] the active goal has no Companion: Today\'s Daily Dose opens nothing');
      return;
    }
    void this.companions.openDoseFor(id);
    this.store.openScene('comp');
  }

  /** After Submit (mockup dashResultsHTML): each answer as the grading read marked it, the key and explanation from the test set. */
  protected readonly results = computed(() => {
    const b = this.exhibit.picked();
    const a = this.exhibit.attempt();
    if (!b || !a?.take || a.status !== 'submitted') return null;
    return results(b, a, this.order);
  });

  /** The mana balance as the mockup writes it ("1,240"). */
  protected units(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }

  protected marker(i: number): string {
    return MARKS[i] ?? String(i + 1);
  }
}

function results(b: DashBank, a: DashAttempt, order: VisitOrder) {
  const take = a.take as NonNullable<DashAttempt['take']>;
  const rows = take.questions.map((q) => {
    const { stem, options } = promptOf(q, order);
    const points = q.points ?? q.points_possible ?? 0;
    if (q.question_type === 'oe') {
      const text = a.answers.get(q.test_set_question_id)?.trim() ?? '';
      // Released in the grading exhibit: the product's grade, read again (never by comparing text).
      const graded = a.grading?.state === 'RELEASED' ? a.grading.questions.find((r) => r.test_set_question_id === q.test_set_question_id) : undefined;
      const oe = !text ? ('empty' as const) : graded ? ('released' as const) : ('waiting' as const);
      return { id: q.test_set_question_id, stem, type: 'oe' as const, points, oe, score: graded?.points_earned ?? 0 };
    }
    const marked = a.grading?.questions.find((r) => r.test_set_question_id === q.test_set_question_id);
    const pinned = b.testSet.questions.find((t) => t.test_set_question_id === q.test_set_question_id)?.payload_snapshot;
    const right = pinned?.options?.find((o) => o.is_correct);
    const at = right ? options.findIndex((o) => o.id === right.option_id) : -1;
    if (!right || at < 0) console.error(`[kiosk] question ${q.test_set_question_id} has no answer key in test set ${b.testSet.test_set_id} that matches its options`);
    return {
      id: q.test_set_question_id,
      stem,
      type: 'mcq' as const,
      points,
      answered: !!marked,
      correct: marked?.correct === true,
      earned: marked?.points_earned ?? 0,
      key: at >= 0 ? `${MARKS[at] ?? at + 1}, ${options[at].text}` : null,
      why: right?.explainer?.trim() || null,
    };
  });
  const mcq = rows.filter((r) => r.type === 'mcq');
  const oe = rows.find((r) => r.type === 'oe') ?? null;
  const got = mcq.reduce((n, r) => n + ('earned' in r ? r.earned : 0), 0);
  const released = oe && 'oe' in oe && oe.oe === 'released' ? oe.score : null;
  return {
    rows,
    got,
    of: mcq.reduce((n, r) => n + r.points, 0),
    oe,
    held: a.held && oe?.type === 'oe' && 'oe' in oe && oe.oe === 'waiting',
    /** The whole assessment once the open answer is released (mockup dashResultsHTML). */
    total: released === null ? null : { p: got + released, m: rows.reduce((n, r) => n + r.points, 0) },
  };
}
