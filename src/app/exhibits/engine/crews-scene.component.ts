import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ContentDirective } from '../../i18n/content.directive';
import { ManifestService } from '../../kiosk-api/manifest.service';
import { QuestionJobsService } from '../../product-api/question-jobs.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { VisitTally } from '../../shared/visit-tally';
import { formatClockSeconds } from '../../shared/when';
import { provideSceneFooter } from '../../shell/footer-slot';
import { TeacherStudio } from '../../story/teacher-studio';
import { CREWS_RECORDS, CrewsTimeline, crewsTimeline } from './crews-replay';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';

/**
 * The decision log row's reason, as the snapshot shows it (mockup crews.v.reason, line 1632): content
 * a critic wrote, so English in every language (K41).
 */
export const SNAPSHOT_REASON = 'Stem is unambiguous, one option is correct, the distractors are plausible.';

type Replay = { readonly state: 'loading' } | { readonly state: 'ready'; readonly timeline: CrewsTimeline } | { readonly state: 'failed' };

/**
 * Agent crews at work (mockup SCENES.crews, line 5935; K8, K15, K21, K40, K81, K82): the two crews, the
 * one gateway every model call leaves through and the runtime guardrail on its path, drawn dashed and
 * simulated (K15, K40); this morning's prepared run from its own records (K101), then this demo
 * session's tally; and the decision log row, said to be a snapshot of a past log (K82). No LIVE press
 * here (K81).
 */
@Component({
  selector: 'kiosk-crews-scene',
  imports: [TranslatePipe, IconComponent, ContentDirective, TourFooterComponent],
  template: `
    <div class="exhibit">
      <div class="ex-head">
        <div>
          <div class="crumb">{{ 'crews.kicker' | translate }}</div>
          <h2>{{ 'crews.title' | translate }}</h2>
          <p>{{ 'crews.sub' | translate }}</p>
        </div>
      </div>
      <div class="crew-grid">
        <div class="crew-diagram glass">
          <svg viewBox="0 0 816 570">
            <path d="M408,80 C408,98 210,98 210,116" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <path d="M408,80 C408,98 606,98 606,116" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <path d="M210,294 C210,310 408,310 408,326" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <path d="M606,294 C606,310 408,310 408,326" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <path d="M408,392 C408,401 408,401 408,410" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <path d="M300,466 C300,479 210,479 210,492" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <path d="M516,466 C516,479 606,479 606,492" fill="none" stroke="#7f9cc0" stroke-width="2.5" />
            <rect x="228" y="8" width="360" height="72" rx="14" fill="#eef4fb" stroke="#1976d2" stroke-width="2" />
            <text x="408" y="40" text-anchor="middle" style="font: 750 18px var(--font); fill: #1e293b">{{ 'crews.orch' | translate }}</text>
            <text x="408" y="62" text-anchor="middle" style="font: 500 13.5px var(--font); fill: #485768">{{ 'crews.orchSub' | translate }}</text>
            <rect x="16" y="116" width="388" height="178" rx="16" fill="#fffaf0" stroke="#f59e0b" stroke-width="2" />
            <text x="210" y="145" text-anchor="middle" style="font: 750 17px var(--font); fill: #854d0e">{{ 'crews.authoring' | translate }}</text>
            <rect x="32" y="160" width="170" height="54" rx="27" fill="#ffffff" stroke="#1976d2" stroke-width="2" />
            <text x="117" y="184" text-anchor="middle" style="font: 700 15px var(--font); fill: #0d47a1">{{ 'crews.writer' | translate }}</text>
            <text x="117" y="202" text-anchor="middle" style="font: 600 11.5px var(--mono); fill: #6b7d92">qgen_question</text>
            <rect x="218" y="160" width="170" height="54" rx="27" fill="#ffffff" stroke="#1976d2" stroke-width="2" />
            <text x="303" y="184" text-anchor="middle" style="font: 700 15px var(--font); fill: #0d47a1">{{ 'crews.critic' | translate }}</text>
            <text x="303" y="202" text-anchor="middle" style="font: 600 11.5px var(--mono); fill: #6b7d92">qgen_critic</text>
            <rect x="125" y="226" width="170" height="54" rx="27" fill="#ffffff" stroke="#1976d2" stroke-width="2" />
            <text x="210" y="250" text-anchor="middle" style="font: 700 15px var(--font); fill: #0d47a1">{{ 'crews.renderer' | translate }}</text>
            <text x="210" y="268" text-anchor="middle" style="font: 600 11.5px var(--mono); fill: #6b7d92">qgen_renderer</text>
            <rect x="412" y="116" width="388" height="178" rx="16" fill="#f0fbf6" stroke="#0f7a4d" stroke-width="2" />
            <text x="606" y="145" text-anchor="middle" style="font: 750 17px var(--font); fill: #0c6640">{{ 'crews.grading' | translate }}</text>
            <rect x="428" y="190" width="170" height="54" rx="27" fill="#ffffff" stroke="#1976d2" stroke-width="2" />
            <text x="513" y="214" text-anchor="middle" style="font: 700 15px var(--font); fill: #0d47a1">{{ 'crews.evaluator' | translate }}</text>
            <text x="513" y="232" text-anchor="middle" style="font: 600 11.5px var(--mono); fill: #6b7d92">oe_evaluator</text>
            <rect x="614" y="190" width="170" height="54" rx="27" fill="#ffffff" stroke="#1976d2" stroke-width="2" />
            <text x="699" y="214" text-anchor="middle" style="font: 700 15px var(--font); fill: #0d47a1">{{ 'crews.moderator' | translate }}</text>
            <text x="699" y="232" text-anchor="middle" style="font: 600 11.5px var(--mono); fill: #6b7d92">oe_moderator</text>
            <rect x="168" y="326" width="480" height="66" rx="14" fill="#ffffff" stroke="#003D7C" stroke-width="2" />
            <text x="408" y="355" text-anchor="middle" style="font: 750 18px var(--font); fill: #1e293b">{{ 'crews.gateway' | translate }}</text>
            <text x="408" y="377" text-anchor="middle" style="font: 500 13.5px var(--font); fill: #485768">{{ 'crews.gatewaySub' | translate }}</text>
            <rect x="110" y="410" width="596" height="56" rx="14" fill="#f6f8fb" stroke="#9aa8b8" stroke-width="2" stroke-dasharray="8 7" />
            <text x="408" y="434" text-anchor="middle" style="font: 750 18px var(--font); fill: #1e293b">{{ 'crews.armor' | translate }}</text>
            <text x="408" y="456" text-anchor="middle" style="font: 500 13.5px var(--font); fill: #485768">{{ 'crews.armorSub' | translate }}</text>
            <rect x="30" y="492" width="360" height="70" rx="14" fill="#eef4fb" stroke="#1976d2" stroke-width="2" />
            <text x="210" y="523" text-anchor="middle" style="font: 750 18px var(--font); fill: #1e293b">{{ 'crews.ollama' | translate }}</text>
            <text x="210" y="545" text-anchor="middle" style="font: 500 13.5px var(--font); fill: #485768">{{ 'mdl.textSub' | translate }}</text>
            <rect x="426" y="492" width="360" height="70" rx="14" fill="#eef4fb" stroke="#1976d2" stroke-width="2" />
            @if (imageModel(); as model) {
              <text x="606" y="523" text-anchor="middle" style="font: 750 18px var(--font); fill: #1e293b">{{ 'crews.gemini' | translate }}</text>
              <text x="606" y="545" text-anchor="middle" style="font: 500 13.5px var(--font); fill: #485768">{{ model }}</text>
            } @else {
              <text x="606" y="533" text-anchor="middle" style="font: 750 18px var(--font); fill: #1e293b">{{ 'crews.gemini' | translate }}</text>
            }
          </svg>
        </div>
        <div class="crew-side">
          <div class="timeline glass">
            <h4>{{ 'crews.replay' | translate }}</h4>
            @if (replay().state === 'failed') {
              <p class="msg-error">{{ 'hook.loadFailed' | translate }}</p>
            } @else {
              <ul class="tl">
                <li class="sim">
                  <code></code><span>{{ 'tl.s' | translate }}<span class="tag-sim">{{ 'xr.sim' | translate }}</span></span>
                </li>
                @for (r of rows(); track r.key) {
                  <li>
                    <code>{{ r.clock }}</code><span>{{ r.key | translate }}</span>
                  </li>
                }
                <li>
                  <code>{{ 'hist.now' | translate }}</code><span>{{ 'tl.visit' | translate: tally() }}</span>
                </li>
              </ul>
            }
          </div>
          <div class="decision glass">
            <h4>{{ 'crews.decision' | translate }}</h4>
            <p class="stamp snap-note"><kiosk-icon name="clock" />{{ 'crews.snapshot' | translate }}</p>
            <div class="kv">
              <b>{{ 'crews.k.decision' | translate }}</b>
              <span><span class="badge ok"><kiosk-icon name="check" />{{ 'crews.v.decision' | translate }}</span></span>
              <b>{{ 'crews.k.reason' | translate }}</b>
              <span kioskContent>{{ reason }}</span>
              <b>{{ 'crews.k.chain' | translate }}</b>
              <code>a71c3e…09bd → 3f9a52…c21e</code>
              <b>{{ 'crews.k.trace' | translate }}</b>
              <span><code>7d1c6e0a93b24f58a1e9c4b7f03d2e61</code><br />{{ 'crews.v.traceNote' | translate }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ng-template #footer><kiosk-tour-footer /></ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrewsSceneComponent {
  private readonly manifest = inject(ManifestService);
  private readonly jobs = inject(QuestionJobsService);
  private readonly decisions = inject(VisitDecisions);
  private readonly answers = inject(VisitTally).answers;
  private readonly revisions = inject(TeacherStudio).revisions;
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly reason = SNAPSHOT_REASON;

  protected readonly replay = signal<Replay>({ state: 'loading' });
  protected readonly rows = computed(() => {
    const r = this.replay();
    return r.state === 'ready' ? r.timeline.rows.map((row) => ({ key: row.key, clock: formatClockSeconds(row.at) })) : [];
  });
  protected readonly imageModel = computed(() => {
    const r = this.replay();
    return r.state === 'ready' ? r.timeline.imageModel : null;
  });
  /** This demo session so far (mockup state.tally): ideas added, answers graded, revisions made. */
  protected readonly tally = computed(() => ({
    i: [...this.decisions.all().values()].filter((d) => d.state === 'added').length,
    a: this.answers(),
    r: this.revisions().length,
  }));

  constructor() {
    provideSceneFooter(this.footer);
    provideTourNav();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const m = await this.manifest.load();
      const draft = m.choice(CREWS_RECORDS.draft, 'question_draft').records;
      const job = await this.jobs.read(draft.atom_id, draft.job_id);
      this.replay.set({ state: 'ready', timeline: crewsTimeline(m, job) });
    } catch (err: unknown) {
      console.error(`[kiosk] the crews timeline could not be read: ${err instanceof Error ? err.message : String(err)}`);
      this.replay.set({ state: 'failed' });
    }
  }
}
