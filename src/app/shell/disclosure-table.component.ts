import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The comparison table (K33, K84, K85): the header's "About the app" and the Engine Room's
 * "How this demo runs" show the same eleven rows. Row 4, the safety screen, is flagged (K15). Row 10,
 * K128's embeddings, sits after the pictures (K168, W33), and row 11, payments, after sign-in (K172,
 * W43): the keys keep their numbers, the order is here.
 */
@Component({
  selector: 'kiosk-disclosure-table',
  imports: [TranslatePipe],
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    <table class="disclose">
      <thead>
        <tr>
          <th>{{ 'local.part' | translate }}</th>
          <th>{{ 'local.cloud' | translate }}</th>
          <th>{{ 'local.here' | translate }}</th>
        </tr>
      </thead>
      <tbody>
        @for (i of rows; track i) {
          <tr [class.flag]="i === 4">
            <td>{{ 'local.r' + i | translate }}</td>
            <td>{{ 'local.r' + i + 'c' | translate }}</td>
            <td>{{ 'local.r' + i + 'h' | translate }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisclosureTableComponent {
  protected readonly rows = [1, 2, 3, 10, 4, 5, 6, 11, 7, 8, 9];
}
