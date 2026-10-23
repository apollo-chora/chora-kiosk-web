import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KIOSK_TIMING } from './kiosk-timing';
import { KioskStore } from './kiosk.store';

const RING = 2 * Math.PI * 52;

/** "Still there?" (K18): a 15 s ring, then the demo session ends for the next visitor. */
@Component({
  selector: 'kiosk-idle-warn',
  imports: [TranslatePipe],
  template: `
    <svg class="ring" viewBox="0 0 120 120">
      <circle class="track" cx="60" cy="60" r="52" />
      <circle class="bar" id="ringbar" cx="60" cy="60" r="52" [attr.stroke-dasharray]="dash" [attr.stroke-dashoffset]="offset()" />
      <text x="60" y="62" id="ringtext">{{ left() }}</text>
    </svg>
    <h2>{{ 'iw.title' | translate }}</h2>
    <p>{{ 'iw.body' | translate: { s: left() } }}</p>
    <button class="btn btn-primary" data-act="stay" (click)="store.closeOverlays()">{{ 'iw.stay' | translate }}</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdleWarnComponent {
  protected readonly store = inject(KioskStore);
  protected readonly dash = RING.toFixed(1);
  protected readonly left = this.store.idleSecondsLeft;
  protected readonly offset = computed(() => (RING * (1 - this.left() / KIOSK_TIMING.idleCountdownS)).toFixed(1));
}
