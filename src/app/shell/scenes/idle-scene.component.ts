import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { KioskLang, KioskLanguage } from '../../i18n/i18n';
import { KioskStore } from '../kiosk.store';
import { StartCheck } from '../start-check';

/**
 * The start screen (K1, K16, K25, K31), in the original NUS-ISS design (K22): the story's
 * question, a start button in each language (each labelled in its own language), and a
 * click anywhere starts in the language shown. The learner's map behind the headline is
 * production's lens, darkened, never blurred (K31); it is mounted in #idlemap by T3.6. K164: while
 * it shows, K151's answer is kept fresh in the background, and a button pressed before one is fresh
 * says it is checking, in its own language, until the store acts.
 */
@Component({
  selector: 'kiosk-idle-scene',
  imports: [TranslatePipe],
  template: `
    <div class="idle" data-act="start" (click)="start()">
      <div class="bg-map" id="idlemap"></div>
      <div class="idle-scrim"></div>
      <div class="hero">
        <div class="kicker on-blue">{{ 'idle.kicker' | translate }}</div>
        <h1>{{ 'idle.title' | translate }}</h1>
        <p>{{ 'idle.sub' | translate }}</p>
        <div class="starts">
          @for (b of buttons; track b.lang) {
            <button [class]="'btn ' + b.cls" data-act="start" [attr.data-lang]="b.lang" [attr.aria-busy]="pressed() === b.lang" (click)="start(b.lang, $event)">
@if (pressed() === b.lang) {<span class="db-spin" aria-hidden="true"></span>{{ b.checking | translate }}} @else {{{ b.label | translate }}}</button>
          }
        </div>
      </div>
      <div class="clickhint"><i></i>{{ 'idle.clickhint' | translate }}</div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdleSceneComponent {
  private readonly store = inject(KioskStore);
  private readonly lang = inject(KioskLanguage).lang;
  protected readonly buttons = [
    { lang: 'en', cls: 'btn-frame', label: 'idle.startEn', checking: 'idle.checkingEn' },
    { lang: 'zh', cls: 'btn-ghost', label: 'idle.startZh', checking: 'idle.checkingZh' },
  ] as const;
  /** The button checking: the one pressed, or the shown language's for a click anywhere. */
  protected readonly pressed = computed(() => {
    const c = this.store.checking();
    return c === 'any' ? this.lang() : c;
  });

  constructor() {
    inject(DestroyRef).onDestroy(inject(StartCheck).watch());
  }

  protected start(lang?: KioskLang, event?: Event): void {
    event?.stopPropagation();
    void this.store.startStory(lang);
  }
}
