import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * A concept's six-rung ladder (mockup ladderHTML, line 4109), shared by Companions and the atlas:
 * the rungs cleared lit, the next one marked, the rest waiting. A won concept has all six cleared.
 */
@Component({
  selector: 'kiosk-ladder',
  imports: [TranslatePipe],
  template: `
    <div class="ladder">
      @for (r of rungs; track r) {
        <span class="rungpill" [class.on]="r <= cleared()" [class.now]="r === cleared() + 1">{{ 'rung.' + r | translate }}</span>
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
export class LadderComponent {
  /** How many rungs are cleared, 0 to 6. */
  readonly cleared = input.required<number>();
  protected readonly rungs = [1, 2, 3, 4, 5, 6] as const;
}
