import { ChangeDetectionStrategy, Component, TemplateRef, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DisclosureTableComponent } from '../../shell/disclosure-table.component';
import { ArchDiagramComponent } from './arch-diagram.component';
import { provideSceneFooter } from '../../shell/footer-slot';
import { TourFooterComponent } from '../../shell/tour/tour-footer.component';
import { provideTourNav } from '../../shell/tour/tour-nav';

/**
 * How this demo runs (mockup SCENES.local; K15, K21, K22, K33, K40): the comparison of this computer's
 * demo with the full platform, the same table the header's About the app shows. K208 (W92): the
 * architecture diagram opens the page, the table under it; the two scroll together.
 */
@Component({
  selector: 'kiosk-local-scene',
  imports: [TranslatePipe, ArchDiagramComponent, DisclosureTableComponent, TourFooterComponent],
  template: `
    <div class="exhibit ex-local">
      <div class="ex-head">
        <div>
          <div class="crumb">{{ 'local.kicker' | translate }}</div>
          <h2>{{ 'local.title' | translate }}</h2>
          <p>{{ 'local.sub' | translate }}</p>
        </div>
      </div>
      <div class="local-scroll">
        <div class="glass arch-card"><kiosk-arch-diagram /></div>
        <div class="glass local-table" style="padding: 10px 18px 6px"><kiosk-disclosure-table /></div>
      </div>
    </div>

    <ng-template #footer><kiosk-tour-footer /></ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalSceneComponent {
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');

  constructor() {
    provideSceneFooter(this.footer);
    provideTourNav();
  }
}
