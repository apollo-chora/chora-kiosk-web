import { ChangeDetectionStrategy, Component, DestroyRef, TemplateRef, computed, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ContentDirective } from '../../i18n/content.directive';
import { KioskLanguage } from '../../i18n/i18n';
import { LiveRowComponent } from '../../live/live-row.component';
import { LiveService } from '../../live/live.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { formatWhen } from '../../shared/when';
import { provideSceneFooter } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';
import { DashboardExhibit } from '../dashboard/dashboard-exhibit';
import { GRADE_LIMIT_S, GRADE_LIVE_KEY, GradeExhibit } from './grade-exhibit';
import { XrayButtonComponent } from '../../xray/xray-button.component';
import { PreparedInfoComponent } from '../../shared/prepared-info/prepared-info.component';

/**
 * A stem longer than this sets the grading layout dense (_kiosk-additions.scss, K138 W2): the
 * mockup's question is 59 characters, the golden run's 319, which pushed Submit and the LIVE row
 * under the footer at 1366 x 768.
 */
const LONG_STEM = 160;

/** What a LIVE grade that gave no grade says (mockup live.gradeLate and grade.stopped; a failure has its own line). */
const MISS_KEY = { late: 'live.gradeLate', failed: 'live.gradeFailed', stopped: 'grade.stopped' } as const;

/**
 * The grading exhibit (mockup SCENES.grade, gradeStepsHTML, reviewHTML and resultHTML, lines 5003,
 * 4976, 4984 and 4994): the question card with its rubric and the answer, and the grade card with
 * the three steps, the review as the instructor and the released grade (K27, K57).
 */
@Component({
  selector: 'kiosk-grade-scene',
  imports: [TranslatePipe, ContentDirective, IconComponent, LiveRowComponent, XrayButtonComponent, PreparedInfoComponent, TourFooterComponent],
  templateUrl: './grade-scene.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradeSceneComponent {
  protected readonly exhibit = inject(GradeExhibit);
  protected readonly store = inject(KioskStore);
  private readonly lang = inject(KioskLanguage).lang;
  private readonly live = inject(LiveService);
  private readonly dashboard = inject(DashboardExhibit);
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly liveKey = GRADE_LIVE_KEY;

  constructor() {
    provideSceneFooter(this.footer);
    // Lead 6b: a read that failed (a 502 while a reset ran elsewhere) is tried again when the scene opens again.
    if (this.exhibit.status() === 'idle' || this.exhibit.status() === 'failed') void this.exhibit.load();
    // K173: Next is the tour's: G2 puts the strong sample on review, G3 approves and releases it.
    provideTourNav();
    inject(DestroyRef).onDestroy(() => this.exhibit.leave());
  }

  protected readonly calling = computed(() => this.live.state(GRADE_LIVE_KEY)()?.status === 'calling');

  protected readonly longStem = computed(() => (this.exhibit.question()?.stem.length ?? 0) > LONG_STEM);

  /** The three steps (mockup gradeStepsHTML): scored and checked once a grade is on review; the person's step waits, then is done on release. */
  protected readonly steps = computed(() => {
    const stage = this.exhibit.stage();
    const cls = (i: number) => (stage === 'released' ? 'done' : stage === 'review' ? (i < 3 ? 'done' : 'wait') : '');
    return [1, 2, 3].map((i) => ({ key: `grade.s${i}`, cls: cls(i) }));
  });

  protected readonly missLine = computed(() => {
    const m = this.exhibit.miss();
    return m ? { key: MISS_KEY[m], params: { s: GRADE_LIMIT_S } } : null;
  });

  protected readonly released = computed(() => {
    const r = this.exhibit.released();
    if (!r) return null;
    return { ...r, when: r.preparedAt ? formatWhen(r.preparedAt.toISOString(), this.lang()) : null };
  });

  /** K101, K138 W17: the grade on review says where it came from before any release, as the released one does. */
  protected readonly reviewSource = computed(() => {
    const r = this.exhibit.review();
    if (!r) return null;
    return { origin: r.origin, when: r.preparedAt ? formatWhen(r.preparedAt.toISOString(), this.lang()) : null };
  });

  /** The dashboard answer on screen until it is released (grade.subFromDash; no sample chips meanwhile). */
  protected readonly fromDash = computed(() => (this.exhibit.source().kind === 'dash' && this.exhibit.stage() !== 'released' ? this.exhibit.dash() : null));

  /** Back to the dashboard assessment's results (mockup dashSeeResults), read again there. */
  protected seeResults(bankKey: string): void {
    this.dashboard.seeResults(bankKey);
    this.store.go('dash');
  }

  protected value(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
}
