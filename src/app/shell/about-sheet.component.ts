import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DisclosureTableComponent } from './disclosure-table.component';
import { KioskStore } from './kiosk.store';

/** "About the app" (K33): the layperson's comparison of the full platform with this demo. */
@Component({
  selector: 'kiosk-about-sheet',
  imports: [TranslatePipe, DisclosureTableComponent],
  template: `
    <div class="kicker">{{ 'frame.about' | translate }}</div>
    <h2>{{ 'disc.title' | translate }}</h2>
    <p style="font: 500 17px/1.5 var(--font); color: var(--text-muted); margin: 0 0 12px">{{ 'disc.sub' | translate }}</p>
    <div class="disc-scroll"><kiosk-disclosure-table /></div>
    <div class="close-row">
      <span></span>
      <button class="btn btn-primary btn-sm" data-act="closeOverlay" (click)="store.closeOverlays()">{{ 'xr.close' | translate }}</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutSheetComponent {
  protected readonly store = inject(KioskStore);
}
