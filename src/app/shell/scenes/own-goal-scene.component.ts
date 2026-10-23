import { ChangeDetectionStrategy, Component, DestroyRef, TemplateRef, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { provideSceneFooter } from '../footer-slot';
import { KioskStore } from '../kiosk.store';

/** One line of a step's picture of the product: a button (b), a field (f), its text (t) or a muted note (m). */
interface MockLine {
  readonly kind: 'b' | 'f' | 't' | 'm';
  /** The string keys shown on the line, joined by " · ". */
  readonly keys: readonly string[];
}

interface Step {
  readonly n: number;
  readonly mock: readonly MockLine[];
}

const b = (...keys: string[]): MockLine => ({ kind: 'b', keys });
const f = (...keys: string[]): MockLine => ({ kind: 'f', keys });
const t = (...keys: string[]): MockLine => ({ kind: 't', keys });
const m = (...keys: string[]): MockLine => ({ kind: 'm', keys });

/**
 * The five steps as round3-design.html section 6 draws them, in the full product's own words (K207: chora-web's
 * my-knowledge, familiar-marketplace, familiar-egg and familiar-hatching screens); step 5 in this kiosk's own
 * Companions labels, the exhibit the visitor has just seen.
 */
const STEPS: readonly Step[] = [
  { n: 1, mock: [b('own.m.newGoal'), f('own.m.nameGoal', 'own.m.nameHint'), b('own.m.create')] },
  { n: 2, mock: [t('own.m.market'), f('own.m.chances'), b('own.m.choose'), m('own.m.stripe', 'own.m.paid', 'own.m.meet')] },
  { n: 3, mock: [t('own.m.yourPod'), b('own.m.send'), f('own.m.warming')] },
  { n: 4, mock: [m('own.m.stirring'), b('own.m.open'), f('own.m.name', 'own.m.voice', 'own.m.persona'), b('own.m.awaken')] },
  { n: 5, mock: [t('comp.title'), f('comp.ab.suggest'), f('comp.ab.quiz'), f('comp.ab.dose'), f('comp.ab.weak')] },
];

/**
 * Your own goal (W91, K207; round3-design.html section 6): a still, five-step storyboard of how a learner adds
 * their own goal and how a Companion bought as a Pod through Stripe warms on its map, awakens and works it. A
 * picture only: it makes no call, takes no payment and has nothing to press but its footer. Opened from the
 * hall's sixth tile, off the tour; Back, the Back key and Esc return to the hall.
 */
@Component({
  selector: 'kiosk-own-goal-scene',
  imports: [TranslatePipe],
  template: `
    <div class="own">
      <div class="kicker on-blue">{{ 'own.kicker' | translate }}</div>
      <h1>{{ 'own.title' | translate }}</h1>
      <p class="lede">{{ 'own.line' | translate }}</p>
      <ol class="own-steps">
        @for (s of steps; track s.n) {
          <li class="own-step glass" [attr.data-step]="s.n">
            <span class="own-sn">{{ 'own.s' + s.n + '.label' | translate }}</span>
            <div class="own-mock">
              @for (line of s.mock; track $index) {
                <span [class]="'own-' + line.kind">
                  @for (k of line.keys; track k; let last = $last) {
                    {{ k | translate }}
                    @if (!last) {
                      ·
                    }
                  }
                </span>
              }
            </div>
            <p class="own-cap">{{ 'own.s' + s.n + '.cap' | translate }}</p>
          </li>
        }
      </ol>
    </div>

    <ng-template #footer>
      <div class="fb-left"></div>
      <div class="fb-right">
        <button class="btn btn-ghost btn-sm" data-act="resetAll" (click)="store.endSession()">{{ 'nav.doneReset' | translate }}</button>
        <button class="btn btn-frame btn-sm" data-act="back" (click)="toHall()">{{ 'nav.back' | translate }}</button>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnGoalSceneComponent {
  protected readonly store = inject(KioskStore);
  private readonly footer = viewChild<TemplateRef<unknown>>('footer');
  protected readonly steps = STEPS;

  constructor() {
    provideSceneFooter(this.footer);
    inject(DestroyRef).onDestroy(this.store.setNav({ back: () => this.toHall(), escape: () => this.toHall() }));
  }

  protected toHall(): void {
    this.store.go('hall');
  }
}
