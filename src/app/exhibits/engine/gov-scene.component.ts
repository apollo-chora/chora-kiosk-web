import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KioskLanguage } from '../../i18n/i18n';
import { IconComponent } from '../../shared/icon/icon.component';
import { formatDay } from '../../shared/when';
import { provideSceneFooter } from '../../shell/footer-slot';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';
import { IMDA_CAPTURE, IMDA_CAPTURED_ON, SIGNAL_KEY } from './imda-capture';

/**
 * Governance and DevSecOps (mockup SCENES.gov, line 5953; K8, K9, K40): the production O+ IMDA
 * board as captured on 10 Aug 2026, said to be static on screen, with the signal rule the product
 * prints and the DevSecOps facts. It reads nothing: no telemetry engine runs on the laptop (K9).
 */
@Component({
  selector: 'kiosk-gov-scene',
  imports: [TranslatePipe, IconComponent, TourFooterComponent],
  template: `
    <div class="exhibit">
      <div class="ex-head">
        <div>
          <div class="crumb">{{ 'gov.kicker' | translate }}</div>
          <h2>{{ 'gov.title' | translate }}</h2>
          <!-- K220 (W98): what the page is about, in plain words. -->
          <p>{{ 'gov.sub' | translate }}</p>
        </div>
      </div>
      <div class="static-banner"><kiosk-icon name="info" /><span>{{ 'gov.banner' | translate: { d: capturedOn() } }}</span></div>
      <div class="gov-grid">
        <div>
          <div class="kicker on-blue" style="margin-bottom: 10px">{{ 'gov.imda' | translate }}</div>
          <div class="imda">
            @for (d of dims; track d.id) {
              <div class="dim glass" [style.border-left-color]="d.color">
                <h4>{{ d.id.toUpperCase() }} · {{ 'dim.' + d.id | translate }}</h4>
                <span [class]="'signal ' + d.signal"><i></i>{{ signalKey[d.signal] | translate }}</span>
                <div class="what">{{ 'dim.' + d.id + 'w' | translate }}</div>
                <div class="counts">{{ 'gov.counts' | translate: { p: d.p, pa: d.pa, f: d.f, n: d.n } }}</div>
                @if (d.signal === 'green' && d.f) {
                  <div class="counts">{{ 'gov.greenWhy' | translate }}</div>
                }
              </div>
            }
          </div>
          <p class="rule">{{ 'gov.rule' | translate }}</p>
        </div>
        <div class="facts glass">
          <h4>{{ 'gov.devsecops' | translate }}</h4>
          <ul>
            @for (f of facts; track f) {
              <li>{{ f | translate }}</li>
            }
          </ul>
        </div>
      </div>
    </div>

    <ng-template #footer><kiosk-tour-footer /></ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GovSceneComponent {
  private readonly lang = inject(KioskLanguage).lang;
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly dims = IMDA_CAPTURE;
  protected readonly signalKey = SIGNAL_KEY;
  protected readonly facts = ['gov.f1', 'gov.f2', 'gov.f3', 'gov.f4'];
  protected readonly capturedOn = computed(() => formatDay(IMDA_CAPTURED_ON, this.lang()));

  constructor() {
    provideSceneFooter(this.footer);
    provideTourNav();
  }
}
