import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { KioskLanguage } from '../i18n/i18n';
import { IconComponent } from '../shared/icon/icon.component';
import { formatWhen } from '../shared/when';
import { LIVE_KINDS, type LiveKind } from './live-kinds';
import { LiveService } from './live.service';
import { PreparedInfoComponent } from '../shared/prepared-info/prepared-info.component';

// Where a kind's call goes (kiosk/config/models.example.yaml's tiers; K124 moved pictures to Vertex AI).
export const VIA_TEXT = 'Ollama';
export const VIA_PICTURE = 'Google Vertex AI';
const TICK_MS = 100;

/**
 * One LIVE row (mockup liveRowHTML, liveBtnHTML, liveCallingHTML and liveSourceHTML, lines 5656 to
 * 5694): where the result on screen came from (the prepared record's own stamp, K101; live, just
 * now; or the labelled prepared fallback, K45), and the LIVE button that presses the kind through
 * the one LIVE service. While a call runs the row shows the provider, the elapsed counter and the
 * crew's workers, and "Stop waiting"; the button never states an estimate (K52). It is off, and
 * says why, when the opening check found the kind's provider down (K65) or another call runs.
 * The screen above the row shows the result, told it by LiveService.onOutcome (W79: a row left
 * mid-call is destroyed, so it never carries the outcome itself). K186: once a call has its live
 * result the button is gone for the demo session; a missed call offers "Try again" until one lands
 * (K189). An additive kind's list holds both, so it shows both stamps.
 */
@Component({
  selector: 'kiosk-live-row',
  imports: [NgTemplateOutlet, TranslatePipe, IconComponent, PreparedInfoComponent],
  template: `
    <div class="live-row" [attr.data-live]="liveKey()">
      @switch (state()?.status) {
        @case ('calling') {
          <span class="live-status" [attr.data-key]="liveKey()">
            <span class="live-spin" aria-hidden="true"></span>
            <span class="live-tag">{{ 'live.tag' | translate }}</span>
            <span>{{ 'live.calling' | translate: { via: via() } }}</span>
            <b class="live-secs">{{ 'live.secs' | translate: { s: elapsed() } }}</b>
            <span class="mini-trace">
              <span class="sim">{{ 'trace.safety' | translate }} · {{ 'xr.sim' | translate }}</span>
              @for (st of stages(); track st.id) {
                <span [class.done]="st.state === 'done'" [class.run]="st.state === 'running'">{{ 'live.st.' + st.id | translate }}</span>
              }
            </span>
            <button class="link" data-act="liveCancel" (click)="live.stopWaiting()">{{ 'live.cancel' | translate }}</button>
          </span>
        }
        @case ('done') {
          @if (additive()) {
            <ng-container *ngTemplateOutlet="prepared" />
          }
          <span class="stamp live-done"><kiosk-icon name="bolt" />{{ liveWhen() ? ('live.doneAt' | translate: { when: liveWhen() }) : ('live.done' | translate) }}</span>
        }
        @case ('missed') {
          @if (!noFallback()) {
            @if (additive()) {
              <ng-container *ngTemplateOutlet="prepared" />
            }
            <span class="stamp fallback"><kiosk-icon name="clock" />{{ missedLine() }}</span>
            <!-- Gap (b), K45 and K101: the prepared result shown in place of the live one carries its own true time. -->
            @if (fallbackWhen(); as w) {
              <span class="stamp"><kiosk-icon name="clock" />{{ 'stamp.prepared' | translate: { when: w } }}<kiosk-prepared-info /></span>
            }
          }
        }
        @default {
          <ng-container *ngTemplateOutlet="prepared" />
          <!-- K186: spent on another exhibit; only a list the result joined says when (a result row shows the prepared one). -->
          @if (spentAt() && additive()) {
            <span class="stamp live-done"><kiosk-icon name="bolt" />{{ 'live.doneAt' | translate: { when: liveWhen() ?? when(spentAt()!) } }}</span>
          }
        }
      }
      @if (state()?.status !== 'calling' && state()?.status !== 'done' && !spentAt() && offer()) {
        <button class="live-btn sm" data-act="live" [attr.data-key]="liveKey()" [disabled]="whyOff() !== null || disabled()" (click)="press()">
          <span class="live-dot" aria-hidden="true"></span>
          <span class="live-tag">{{ 'live.tag' | translate }}</span>
          <span class="live-label">{{ buttonLabel() }}</span>
          <span class="live-eta">{{ (spec().budget === 'single' ? 'live.waitShort' : 'live.waitLong') | translate }}</span>
        </button>
        @switch (whyOff()) {
          @case ('off') {
            <span class="live-why">{{ 'live.off' | translate }}</span>
          }
          @case ('busy') {
            <span class="live-why">{{ 'live.busy' | translate }}</span>
          }
          @case ('not_wired') {
            <span class="live-why">{{ 'live.off' | translate }}</span>
          }
        }
      }
    </div>
    <ng-template #prepared>
      @if (preparedAt(); as at) {
        <span class="stamp"><kiosk-icon name="clock" />{{ 'stamp.prepared' | translate: { when: when(at) } }}<kiosk-prepared-info /></span>
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveRowComponent {
  protected readonly live = inject(LiveService);
  private readonly lang = inject(KioskLanguage).lang;

  /** `<kind>:<scene>:<subject>`, one per result on screen. */
  readonly liveKey = input.required<string>();
  readonly kind = input.required<LiveKind>();
  /** The button's label, already translated (it names the Companion or the change). */
  readonly label = input.required<string>();
  readonly params = input<unknown>();
  /** The prepared result's own time (K101); null when nothing prepared stands behind the row. */
  readonly preparedAt = input<Date | null>(null);
  /** A kind whose live result joins the prepared one (fresh ideas join the list, K189): the prepared stamp stays beside the live one. */
  readonly additive = input(false);
  /** The live result's own time when it came earlier this demo session (W41: read back from the product); null for just now. */
  readonly liveAt = input<Date | null>(null);
  /** An additive kind's fallback after a miss (K64: the hidden batch): its own prepared time, stamped beside the miss. */
  readonly fallbackAt = input<Date | null>(null);
  /** Nothing prepared stands behind the result (a typed answer to grade): a miss shows no fallback; the scene says what happened. */
  readonly noFallback = input(false);
  readonly disabled = input(false);
  /** False: the row only says where the result came from, with no press (K147: 4b redoes only a prepared picture). */
  readonly offer = input(true);

  protected readonly spec = computed(() => LIVE_KINDS[this.kind()]);
  protected readonly state = computed(() => this.live.state(this.liveKey())());
  protected readonly whyOff = computed(() => this.live.whyOff(this.kind())());
  protected readonly spentAt = computed(() => this.live.spentAt(this.liveKey())());
  // Pictures and K158's reader tier are on Vertex AI; every other tier on Ollama.
  protected readonly via = computed(() => (this.spec().providers.some((p) => p === 'picture' || p === 'reader') ? VIA_PICTURE : VIA_TEXT));
  protected readonly stages = computed(() => {
    const s = this.state();
    return s?.status === 'calling' ? s.stages : [];
  });
  private readonly now = signal(Date.now());
  protected readonly elapsed = computed(() => {
    const s = this.state();
    return s?.status === 'calling' ? (Math.max(0, this.now() - s.startedAt) / 1000).toFixed(1) : '0.0';
  });
  protected readonly buttonLabel = computed(() => (this.state()?.status === 'missed' ? this.t('live.retry') : this.label()));
  /** The prepared result a miss shows: an additive kind's fallback batch, else the prepared result already on screen. */
  protected readonly fallbackWhen = computed(() => {
    const at = this.additive() ? this.fallbackAt() : this.preparedAt();
    return at ? this.when(at) : null;
  });
  protected readonly liveWhen = computed(() => {
    const at = this.liveAt();
    return at ? this.when(at) : null;
  });
  protected readonly missedLine = computed(() => {
    const s = this.state();
    if (s?.status !== 'missed') return '';
    return s.reason === 'late' ? this.t('live.fallback', { s: String(this.spec().limitMs / 1000) }) : this.t('live.fallbackFailed');
  });

  private readonly translate = inject(TranslateService);

  constructor() {
    // The elapsed counter ticks only while a call runs.
    let timer: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const calling = this.state()?.status === 'calling';
      if (calling && !timer) timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
      if (!calling && timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (timer) clearInterval(timer);
    });
  }

  protected async press(): Promise<void> {
    this.now.set(Date.now());
    await this.live.press(this.liveKey(), this.kind(), this.params());
  }

  protected when(at: Date): string {
    return formatWhen(at.toISOString(), this.lang());
  }

  /** A string for a computed: reading the language makes the computed follow a switch. */
  private t(key: string, params?: Record<string, string>): string {
    this.lang();
    return this.translate.instant(key, params) as string;
  }
}
