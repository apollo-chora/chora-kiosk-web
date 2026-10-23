import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KioskStore } from './kiosk.store';

/**
 * K151: a start on a stack a previous demo session changed since its last reset asks first.
 * "Start fresh" runs the reset (its card, then the story); "Continue" keeps the stack as it is.
 * "Continue" is the mockup's quiet button, made for a light surface (K138 W15: its ghost button is
 * white text for a dark one, and read at 1:1 on this card).
 */
@Component({
  selector: 'kiosk-fresh-start',
  imports: [TranslatePipe],
  template: `
    <h2>{{ 'fresh.title' | translate }}</h2>
    <p>{{ 'fresh.body' | translate }}</p>
    <div class="fresh-acts">
      <button class="btn btn-primary" data-act="freshStart" (click)="store.startFresh()">{{ 'fresh.go' | translate }}</button>
      <button class="btn btn-quiet" data-act="keepSession" (click)="store.keepSession()">{{ 'fresh.keep' | translate }}</button>
    </div>
  `,
  styles: `
    .fresh-acts {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshStartComponent {
  protected readonly store = inject(KioskStore);
}
