import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { KioskLanguage } from '../../i18n/i18n';
import { ReadinessService } from '../../kiosk-api/readiness.service';
import { VISIT_EVENTS, VisitEvent, VisitsService } from '../../kiosk-api/visits.service';
import { LiveService } from '../../live/live.service';
import { KIOSK_TIMING } from '../kiosk-timing';
import { KioskStore, PresenterTab } from '../kiosk.store';
import { ReadyRow, liveRow, readinessRows } from './readiness-rows';

/** The mockup's presenter jumps, in its order, with their labels. */
const JUMPS: readonly { to: string; label: string; n?: number }[] = [
  { to: 'idle', label: 'presenter.idle' },
  { to: 'h1', label: 'beat.1', n: 1 },
  { to: 'h2', label: 'beat.2', n: 2 },
  { to: 'h3', label: 'beat.3', n: 3 },
  { to: 'h4', label: 'beat.4', n: 4 },
  { to: 'h5', label: 'beat.5', n: 5 },
  { to: 'hall', label: 'presenter.hall' },
  { to: 'maps', label: 'presenter.maps' },
  { to: 'comp', label: 'presenter.comp' },
  { to: 'dash', label: 'presenter.dash' },
  { to: 'grade', label: 'presenter.grade' },
  { to: 'engine', label: 'presenter.engine' },
  { to: 'crews', label: 'presenter.crews' },
  { to: 'safety', label: 'presenter.safety' },
  { to: 'gov', label: 'presenter.gov' },
  { to: 'local', label: 'presenter.local' },
];

/** The mockup's TALK keys, and what each leads to (TALK_NEXT). */
const TALK_NEXT: Readonly<Record<string, string>> = {
  idle: 'h1', h1: 'h2', h2: 'h3', h3: 'h4', h4: 'h4b', h4b: 'h5', h5: 'hall', hall: 'maps', maps: 'comp', comp: 'dash',
  dash: 'dashTake', dashTake: 'grade', grade: 'engine', engine: 'crews', crews: 'safety', safety: 'gov', gov: 'local', local: 'hall',
};

/** The conductor's event names, labelled as the mockup's presenter rows. */
const VISIT_LABEL: Readonly<Record<VisitEvent, string>> = {
  started: 'presenter.started', hook_done: 'presenter.hookDone', hall: 'presenter.hall', maps: 'presenter.maps',
  comp: 'presenter.comp', dash: 'presenter.dash', grade: 'presenter.grade', engine: 'presenter.engine',
};

/**
 * The hidden presenter panel (K19; backtick or three clicks on the wordmark, D3): Run
 * (jumps, reset, idle timer, credits, LIVE off for a bad network, the talking point),
 * Talking points, Readiness (the conductor's opening check, K65, no spend row, K105) and
 * Sessions (anonymous counts). The visitor's UI never depends on it (K1).
 */
@Component({
  selector: 'aside[kioskPresenter]',
  imports: [TranslatePipe],
  host: { class: 'presenter', '[class.open]': 'store.presenterOpen()', 'aria-label': 'Presenter panel' },
  templateUrl: './presenter-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenterPanelComponent {
  protected readonly store = inject(KioskStore);
  protected readonly live = inject(LiveService);
  protected readonly readiness = inject(ReadinessService);
  protected readonly visits = inject(VisitsService);
  private readonly language = inject(KioskLanguage);
  private readonly translate = inject(TranslateService);

  protected readonly tabs: readonly PresenterTab[] = ['run', 'talk', 'ready', 'visits'];
  protected readonly jumps = JUMPS;
  /** K143: the idle waits offered, in minutes. */
  protected readonly idleWaits = KIOSK_TIMING.idleWait.choices;
  protected readonly visitEvents = VISIT_EVENTS;
  protected readonly visitLabel = VISIT_LABEL;

  protected readonly talkNow = computed(() => this.talkKeyOf(this.store.talkKey()));
  protected readonly talkNext = computed(() => this.talkKeyOf(TALK_NEXT[this.store.talkKey()]));
  protected readonly liveView = computed(() =>
    this.view(liveRow(this.readiness.readiness(), this.readiness.unreachable(), this.live.presenterOff(), this.language.lang())),
  );
  protected readonly rowsView = computed(() => {
    const r = this.readiness.readiness();
    return r && !this.readiness.unreachable() ? readinessRows(r, this.language.lang()).map((row) => this.view(row)) : [];
  });
  /** The bars' scale: the largest count, so none runs past its track (Grading is counted per visit, so it can pass "Hook started"). */
  protected readonly maxCount = computed(() => Math.max(1, ...Object.values(this.visits.today()?.counts ?? {})));

  protected tab(tab: PresenterTab): void {
    this.store.setPresenterTab(tab);
    if (tab === 'ready') void this.readiness.load();
    if (tab === 'visits') void this.visits.loadToday();
  }

  protected playCredits(): void {
    this.store.playCredits(KIOSK_TIMING.endCreditsMs);
  }

  protected resetAll(): void {
    void this.store.endSession();
  }

  protected checkAgain(): void {
    void this.readiness.checkAgain();
  }

  protected barWidth(n: number): string {
    return `${Math.round((100 * n) / this.maxCount())}%`;
  }

  /** A row's text in the current language (read here so it follows a language switch). */
  private view(row: ReadyRow): { key: string; tone: string; text: string } {
    this.language.lang();
    const t = (key: string, params?: object) => this.translate.instant(key, params) as string;
    const params = {
      ...row.params,
      ...(row.phaseKey ? { phase: t(row.phaseKey) } : {}),
      ...(row.stepKey ? { step: t(row.stepKey) } : {}),
      ...(row.whyKey ? { why: t(row.whyKey) } : {}),
    };
    return { key: row.key, tone: row.state === 'ok' ? '' : row.state, text: t(row.key, params) };
  }

  private talkKeyOf(key: string | undefined): string | null {
    return key && key in TALK_NEXT ? `talk.${key}` : null;
  }
}
