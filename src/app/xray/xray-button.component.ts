import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { IconComponent } from '../shared/icon/icon.component';
import { BehindTheScenes, XrayKind } from './behind-the-scenes';

/** A scene footer's "How was this made?" (K75; mockup renderBottom's xray). */
@Component({
  selector: 'kiosk-xray-button',
  imports: [TranslatePipe, IconComponent],
  template: `<button class="btn btn-ghost btn-sm" data-act="xray" [attr.data-kind]="kind()" (click)="bts.open(kind())"><kiosk-icon name="xray" />{{ 'nav.xray' | translate }}</button>`,
  host: { style: 'display: contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XrayButtonComponent {
  readonly kind = input.required<XrayKind>();
  protected readonly bts = inject(BehindTheScenes);
}
