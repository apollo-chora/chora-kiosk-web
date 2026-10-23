import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KioskLang, KioskLanguage } from '../i18n/i18n';
import { IconComponent } from '../shared/icon/icon.component';
import { KioskStore } from './kiosk.store';

/**
 * The header on every screen (mockup frame-top): the CHORA wordmark (three clicks open the
 * presenter panel, D3), the Credits chip (K32), "About the app" (K33) and the language
 * switch (K25). Names and classes are the mockup's, for its stylesheet and T4's walk.
 */
@Component({
  selector: 'header[kioskFrameHeader]',
  imports: [TranslatePipe, IconComponent],
  host: { class: 'frame-top' },
  template: `
    <div class="brand" id="brand" (click)="store.brandClick()">
      <span class="wordmark">CHORA</span><span class="brand-sub">{{ 'frame.sub' | translate }}</span>
    </div>
    <div class="frame-tools">
      <button class="chip-credits" data-act="credits" (click)="store.toggleCredits()">
        <kiosk-icon name="credits" /><span>{{ 'frame.credits' | translate }}</span>
      </button>
      <button class="chip-local" data-act="disclosure" (click)="store.openOverlay('disclosure')">
        <span class="dot"></span><span>{{ 'frame.about' | translate }}</span>
      </button>
      <div class="lang" role="group" aria-label="Language">
        <button data-act="lang" data-lang="en" [class.on]="language.lang() === 'en'" (click)="setLang('en')">EN</button
        ><button data-act="lang" data-lang="zh" [class.on]="language.lang() === 'zh'" (click)="setLang('zh')">中文</button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrameHeaderComponent {
  protected readonly store = inject(KioskStore);
  protected readonly language = inject(KioskLanguage);

  protected setLang(lang: KioskLang): void {
    void this.language.setLang(lang);
  }
}
