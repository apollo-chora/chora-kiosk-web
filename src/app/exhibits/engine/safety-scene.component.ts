import { ChangeDetectionStrategy, Component, TemplateRef, computed, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { IconComponent } from '../../shared/icon/icon.component';
import { provideSceneFooter } from '../../shell/footer-slot';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';
import { SAFETY_ATTACKS, SAFETY_STAGES, type SafetyStage } from './safety-stages';

/**
 * AI safety and evaluation (mockup SCENES.safety, safetyPipeHTML and safetyDetailHTML, lines 6039
 * to 6092; K15, K73, K74): the release pipeline's five checks, three before release (the AI judge,
 * the red team, the fail-closed gate) and two after (the runtime screen, simulated here, and the
 * drift watch). A stage opens to its sentence, its rule and its evidence: crops of the project's
 * own screenshots, verdict lines only. Static and read-free; the open stage is the page's own state,
 * so each visit starts on the judge. Next and Back step the stages; Back on the first and Esc lead to
 * the Engine Room (K40).
 */
@Component({
  selector: 'kiosk-safety-scene',
  imports: [TranslatePipe, IconComponent, TourFooterComponent],
  template: `
    <div class="exhibit sf">
      <div class="ex-head">
        <div>
          <div class="crumb">{{ 'sf.kicker' | translate }}</div>
          <h2>{{ 'sf.title' | translate }}</h2>
          <p>{{ 'sf.sub' | translate }}</p>
        </div>
      </div>
      <div class="static-banner"><kiosk-icon name="info" /><span>{{ 'sf.banner' | translate }}</span></div>
      <div class="sf-pipe" role="group" [attr.aria-label]="'sf.pipeAria' | translate">
        @for (phase of phases; track phase) {
          @if (phase === 'post') {
            <div class="sf-release" aria-hidden="true"><span>{{ 'sf.release' | translate }}</span><kiosk-icon name="arrow" /></div>
          }
          <div class="sf-phase" [class.sf-phase--post]="phase === 'post'">
            <span class="sf-phase__label">{{ (phase === 'pre' ? 'sf.pre' : 'sf.post') | translate }}</span>
            <div class="sf-steps">
              @for (s of stagesOf(phase); track s.id; let first = $first) {
                @if (!first) {
                  <span class="sf-arrow" aria-hidden="true"><kiosk-icon name="arrow" /></span>
                }
                <button class="sf-step" [class.on]="s.id === stage().id" data-act="sfStage" [attr.data-id]="s.id" [attr.aria-pressed]="s.id === stage().id" (click)="open(s.id)">
                  <span class="sf-step__n" aria-hidden="true">{{ number(s) }}</span>
                  <span class="sf-step__txt"
                    ><b>{{ 'sf.st.' + s.id | translate }}</b>
                    @if (s.sim) {
                      <span class="tag-sim">{{ 'xr.sim' | translate }}</span>
                    } @else {
                      <small>{{ 'sf.sub.' + s.id | translate }}</small>
                    }
                  </span>
                </button>
              }
            </div>
          </div>
        }
      </div>
      @if (stage(); as s) {
        <div class="sf-detail glass" aria-live="polite">
          <div class="sf-detail__text">
            <div class="kicker">{{ 'sf.stageOf' | translate: { n: number(s), phase: ((s.phase === 'pre' ? 'sf.pre' : 'sf.post') | translate) } }}</div>
            <h3>
              {{ 'sf.st.' + s.id | translate }}
              @if (s.sim) {
                <span class="tag-sim">{{ 'xr.sim' | translate }}</span>
              }
            </h3>
            <p class="sf-say">{{ 'sf.say.' + s.id | translate }}</p>
            <p class="sf-rule">{{ 'sf.rule.' + s.id | translate }}</p>
            @if (s.note) {
              <p class="sf-note"><kiosk-icon name="info" /><span>{{ 'sf.note.' + s.id | translate }}</span></p>
            }
            @if (s.attacks) {
              <ul class="sf-attacks">
                @for (a of attacks; track a) {
                  <li><b>{{ 'sf.atk.' + a | translate }}</b><code>{{ a }}</code></li>
                }
              </ul>
            }
          </div>
          <div class="sf-detail__ev">
            <div class="sf-ev__head">
              {{ 'sf.evidence' | translate }}
              @if (s.masked) {
                <span class="sf-mask">{{ 'sf.maskNote' | translate }}</span>
              }
            </div>
            @for (c of s.crops; track c.k) {
              <figure class="sf-crop" [class.sf-crop--side]="!!c.side" [attr.data-crop]="c.k">
                <img [src]="'assets/safety/' + c.k + '.png'" [alt]="('sf.c.' + c.k + '.meta' | translate) + '. ' + ('sf.c.' + c.k | translate)" draggable="false" />
                <figcaption>
                  <b>{{ 'sf.c.' + c.k + '.meta' | translate }}</b><span>{{ 'sf.c.' + c.k | translate }}</span>
                </figcaption>
              </figure>
            }
          </div>
        </div>
      }
    </div>

    <ng-template #footer><kiosk-tour-footer /></ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetySceneComponent {
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly phases = ['pre', 'post'] as const;
  protected readonly attacks = SAFETY_ATTACKS;
  private readonly index = signal(0);
  protected readonly stage = computed(() => SAFETY_STAGES[this.index()]);

  constructor() {
    provideSceneFooter(this.footer);
    // K173 (E3): the page is one beat; Next and Back move between the tour's pages, the five stages a click away.
    provideTourNav();
  }

  protected stagesOf(phase: SafetyStage['phase']): readonly SafetyStage[] {
    return SAFETY_STAGES.filter((s) => s.phase === phase);
  }

  protected number(s: SafetyStage): number {
    return SAFETY_STAGES.indexOf(s) + 1;
  }

  protected open(id: SafetyStage['id']): void {
    const i = SAFETY_STAGES.findIndex((s) => s.id === id);
    if (i < 0) throw new Error(`[kiosk] unknown safety stage: ${id}`);
    this.index.set(i);
  }
}
