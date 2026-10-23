import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KioskLanguage } from '../i18n/i18n';
import { RevealDirective } from '../shared/reveal.directive';
import { formatClock, formatWhen } from '../shared/when';
import { TeacherStudio, type StudioRevision } from './teacher-studio';
import { PreparedInfoComponent } from '../shared/prepared-info/prepared-info.component';

const SHOWN_VERSIONS = 3;

/**
 * Step 4's version history, append-only (mockup histHTML, lines 4314 to 4325): v1 with the golden
 * run's record time, then the last three versions in the order the visitor made them, each with
 * the time it was applied and where it came from (a prepared record's own time, K101; live; or the
 * visitor's own hand). Every prepared stamp carries the "What does Prepared mean?" mark (V11) inside
 * its stamp, the row's second grid column, so the mark never wraps onto a line of its own (W35).
 */
@Component({
  selector: 'kiosk-studio-history',
  imports: [TranslatePipe, RevealDirective, PreparedInfoComponent],
  template: `
    <div class="hist" id="hist">
      <div class="h-title">{{ 'hist.title' | translate }}</div>
      <div class="h-row">
        {{ 'hist.v1' | translate }} <span>{{ 'hist.prepared' | translate: { t: firstAt() } }}<kiosk-prepared-info /></span>
      </div>
      @if (more() > 0) {
        <div class="h-row more">{{ more() === 1 ? ('hist.more1' | translate) : ('hist.more' | translate: { n: more() }) }}</div>
      }
      @for (r of shown(); track r.n) {
        <div class="h-row you" kioskReveal>
          v{{ r.n }} · {{ (r.part === 'a' ? 'hist.words' : 'hist.picture') | translate }} ·
          @if (r.how === 'hand') {
            {{ 'hist.hand' | translate }}
          } @else if (r.chip) {
            {{ 'hist.you' | translate: { c: ('chip.' + r.chip | translate) } }}
          } @else {
            {{ 'hist.you' | translate: { c: r.typed } }}
          }
          <span>
            @switch (r.how) {
              @case ('prepared') {
                {{ 'hist.appliedMade' | translate: { a: clock(r), m: r.madeAt ? when(r.madeAt) : '' } }}<kiosk-prepared-info />
              }
              @case ('live') {
                {{ clock(r) }} · {{ 'hist.live' | translate }}
              }
              @default {
                {{ clock(r) }} · {{ 'hist.byHand' | translate }}
              }
            }
          </span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioHistoryComponent {
  private readonly studio = inject(TeacherStudio);
  private readonly lang = inject(KioskLanguage).lang;

  protected readonly shown = computed(() => this.studio.revisions().slice(-SHOWN_VERSIONS));
  protected readonly more = computed(() => this.studio.revisions().length - this.shown().length);
  protected readonly firstAt = computed(() => {
    const at = this.studio.firstPreparedAt();
    return at ? formatWhen(at.toISOString(), this.lang()) : '';
  });

  protected when(at: Date): string {
    return formatWhen(at.toISOString(), this.lang());
  }

  protected clock(r: StudioRevision): string {
    return formatClock(r.at.toISOString());
  }
}
