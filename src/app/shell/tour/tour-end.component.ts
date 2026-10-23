import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KioskStore } from '../kiosk.store';
import { KioskTour } from './kiosk-tour';

/**
 * The end of the tour (W55): Next on the Engine Room's last page opens this modal dialog over it, the
 * focus on its first button. Done ends the demo session exactly as the footer's Done does (the store's
 * endSession); Stay in the hall is the tour's toHall, and so is Esc (the kiosk's keys reach the scene's
 * tour Esc, an open overlay or the presenter panel closing first). Next and Back wait while it shows.
 * The two buttons are too wide for one row of the mockup's warnbox, so they stack. Mounted once by the
 * root, among the overlays; its host adds no box.
 */
@Component({
  selector: 'kiosk-tour-end',
  imports: [TranslatePipe],
  template: `
    <div class="overlay" id="ov-tour-end" [class.show]="tour.ended()">
      @if (tour.ended()) {
        <div class="warnbox glass" id="tour-end-box" role="dialog" aria-modal="true" aria-labelledby="tour-end-title" aria-describedby="tour-end-body">
          <h2 id="tour-end-title">{{ 'tour.endTitle' | translate }}</h2>
          <p id="tour-end-body">{{ 'tour.endBody' | translate }}</p>
          <div class="tour-end-acts">
            <button #done class="btn btn-primary" data-act="tourEndDone" (click)="store.endSession()">{{ 'nav.done' | translate }}</button>
            <button class="btn btn-quiet" data-act="tourEndStay" (click)="tour.toHall()">{{ 'tour.endStay' | translate }}</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    .tour-end-acts {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TourEndComponent {
  protected readonly tour = inject(KioskTour);
  protected readonly store = inject(KioskStore);
  private readonly done = viewChild<ElementRef<HTMLButtonElement>>('done');

  constructor() {
    afterRenderEffect(() => this.done()?.nativeElement.focus());
  }
}
