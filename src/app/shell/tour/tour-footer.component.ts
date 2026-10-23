import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { IconComponent } from '../../shared/icon/icon.component';
import { KioskStore } from '../kiosk.store';
import { KioskTour } from './kiosk-tour';

/**
 * The tour's footer (K173, ruling 1): at the left the beat marker ("Meet the Companions, 2 of 5", or on
 * the hall where Next starts); at the right the scene's own extra (projected: Behind the scenes), "Back
 * to Explore", Done, Back, and Next last, so Next sits at the same spot on every beat and on the hall
 * (the owner). The hall has no Back and no "Back to Explore". Next and Back wait while a beat shows.
 * Goes inside a scene's footer template; its host adds no box, so the frame's footer lays out its two halves.
 */
@Component({
  selector: 'kiosk-tour-footer',
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="fb-left">
      @let m = tour.marker();
      <span class="tour-marker">{{ m.key | translate: (m.key === 'tour.marker' ? { x: (m.titleKey | translate), n: m.n, m: m.m } : { x: (m.titleKey | translate) }) }}</span>
    </div>
    <div class="fb-right">
      <ng-content />
      @if (!atHall()) {
        <button class="btn btn-ghost btn-sm" data-act="toHall" (click)="tour.toHall()">{{ 'nav.toHall' | translate }}</button>
      }
      <button class="btn btn-ghost btn-sm" data-act="resetAll" (click)="store.endSession()">{{ 'nav.doneReset' | translate }}</button>
      @if (!atHall()) {
        <button class="btn btn-ghost btn-sm" data-act="back" [disabled]="tour.busy()" (click)="tour.back()">{{ 'nav.back' | translate }}</button>
      }
      <button class="btn btn-frame btn-sm" data-act="next" [disabled]="tour.busy()" (click)="tour.next()">{{ 'nav.next' | translate }} <kiosk-icon name="arrow" /></button>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TourFooterComponent {
  protected readonly tour = inject(KioskTour);
  protected readonly store = inject(KioskStore);
  protected readonly atHall = computed(() => this.tour.beat() === null);
}
