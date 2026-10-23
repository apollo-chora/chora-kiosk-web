import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ResetPhaseId, ResetService } from '../kiosk-api/reset.service';
import { IconComponent } from '../shared/icon/icon.component';

/** The four conductor phases in the mockup's plain words (K70, K112). */
const PHASE_KEY: Readonly<Record<ResetPhaseId, string>> = {
  pausing: 'reset.s1',
  restoring_data: 'reset.s2',
  clearing_queues_and_pictures: 'reset.s3',
  starting: 'reset.s4',
};

const TICK_MS = 250;
const RING = 2 * Math.PI * 28;
/** The ring reaches this at the estimate, then holds and turns: never full, so never "finished" or still. */
const NEAR_FULL = 0.9;

/**
 * The waiting card while a demo session is reset (K70): the conductor's phases as sent,
 * ticked off as they finish, the last measured time as "about {n} seconds" (none before
 * the first measured reset), and, if the reset fails, the card stays with its failure line
 * (ADR-260 D9): no visit starts on a partial restore.
 *
 * W56: the owner read the bare spinner as a long, frozen wait. A courtesy note says it may take
 * a minute or so, and a ring fills over the estimate with the seconds counting up inside it;
 * past the estimate, or with none, it holds near full and turns, so something always moves.
 * The seconds count from the moment this card first sees the reset running, not the conductor's
 * started_at: that stamp is whole seconds on the conductor's clock, and the dev fixtures replay a
 * fixed one. The card is up before the POST, whose answer is the first running status.
 */
@Component({
  selector: 'kiosk-reset-card',
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="rc-in">
      @if (!failed()) {
        <svg class="rc-ring" [class.rc-turning]="turning()" viewBox="0 0 64 64" aria-hidden="true" [attr.data-fill]="fill().toFixed(3)">
          <circle class="rc-track" cx="32" cy="32" r="28" />
          <g class="rc-turn">
            <circle class="rc-arc" cx="32" cy="32" r="28" transform="rotate(-90 32 32)" [attr.stroke-dasharray]="dash" [attr.stroke-dashoffset]="offset()" />
          </g>
          <text class="rc-secs" x="32" y="32">{{ 'live.secs' | translate: { s: seconds() } }}</text>
        </svg>
      }
      <h2>{{ 'reset.title' | translate }}</h2>
      <p>{{ estimate() ? ('reset.sub' | translate: { n: estimate() }) : ('reset.subNoEstimate' | translate) }}</p>
      @if (!failed()) {
        <p class="rc-note">{{ 'reset.note' | translate }}</p>
      }
      <ol class="rc-steps">
        @for (p of phases(); track p.id) {
          <li [class]="p.state === 'done' ? 'done' : p.state === 'running' ? 'run' : ''">
            @if (p.state === 'done') {
              <kiosk-icon name="check" />
            } @else {
              <i></i>
            }
            <span>{{ phaseKey[p.id] | translate }}</span>
          </li>
        }
      </ol>
      <p class="rc-why">{{ 'reset.why' | translate }}</p>
      @if (failed()) {
        <p class="rc-failed" role="alert">{{ 'reset.failed' | translate }}</p>
      }
    </div>
  `,
  styles: `
    .rc-ring {
      width: 64px;
      height: 64px;
      overflow: visible;
    }
    .rc-track,
    .rc-arc {
      fill: none;
      stroke-width: 5;
    }
    .rc-track {
      stroke: currentColor;
      stroke-opacity: 0.18;
    }
    .rc-arc {
      stroke: var(--curiosity-fill);
      stroke-linecap: round;
      transition: stroke-dashoffset 250ms linear;
    }
    .rc-turn {
      transform-box: view-box;
      transform-origin: 50% 50%;
    }
    .rc-turning .rc-turn {
      animation: rc-turn 1.4s linear infinite;
    }
    .rc-secs {
      fill: currentColor;
      font: 700 14px/1 var(--font);
      text-anchor: middle;
      dominant-baseline: central;
    }
    .rc-steps li.run i {
      animation:
        rc-turn 1s linear infinite,
        rc-pulse 1.4s ease-out infinite;
    }
    @keyframes rc-turn {
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes rc-pulse {
      0% {
        box-shadow: 0 0 0 0 var(--curiosity-fill);
      }
      70%,
      100% {
        box-shadow: 0 0 0 7px transparent;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .rc-turning .rc-turn {
        animation: none;
      }
      .rc-steps li.run i {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetCardComponent {
  private readonly resets = inject(ResetService);
  protected readonly phaseKey = PHASE_KEY;
  protected readonly dash = RING.toFixed(1);
  protected readonly phases = computed(() => this.resets.status()?.phases ?? []);
  protected readonly estimate = computed(() => this.resets.status()?.estimate_s ?? null);
  protected readonly failed = computed(() => this.resets.unreachable() || this.resets.status()?.state === 'failed');
  private readonly running = computed(() => !this.failed() && this.resets.status()?.state === 'running');

  private readonly now = signal(Date.now());
  /** The reset this card is counting, and when it first saw it running. */
  private readonly since = signal<{ readonly id: string; readonly at: number } | null>(null);
  private readonly elapsedMs = computed(() => {
    const s = this.since();
    return s ? Math.max(0, this.now() - s.at) : 0;
  });
  protected readonly seconds = computed(() => Math.floor(this.elapsedMs() / 1000));
  /** Elapsed over the estimate; null while there is no running reset with a measured estimate. */
  private readonly progress = computed(() => {
    const est = this.estimate();
    return this.running() && est ? this.elapsedMs() / (est * 1000) : null;
  });
  protected readonly turning = computed(() => {
    const p = this.progress();
    return p === null || p >= 1;
  });
  protected readonly fill = computed(() => NEAR_FULL * Math.min(1, this.progress() ?? 1));
  protected readonly offset = computed(() => (RING * (1 - this.fill())).toFixed(1));

  constructor() {
    // The ring and the seconds tick only while a reset runs.
    let timer: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const running = this.running();
      const id = this.resets.status()?.reset_id ?? '';
      if (running && untracked(this.since)?.id !== id) {
        this.now.set(Date.now());
        this.since.set({ id, at: Date.now() });
      }
      if (running && !timer) timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
      if (!running && timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (timer) clearInterval(timer);
    });
  }
}
