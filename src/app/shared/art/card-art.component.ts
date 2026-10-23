import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input } from '@angular/core';

import { CARD_ART, CardArtName } from './card-art';

/**
 * One of the hall's card drawings (the mockup's ART.card_*, verbatim), inline as the mockup has
 * them. The host takes no box, so the stylesheet's ".ex-card .art svg" sizes the drawing in place.
 * The markup is a compile-time constant typed against CARD_ART, so it is written to the host
 * directly: a sanitised [innerHTML] binding would strip the svg element.
 */
@Component({
  selector: 'kiosk-card-art',
  template: '',
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardArtComponent {
  readonly name = input.required<CardArtName>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const el = this.host.nativeElement;
      el.innerHTML = CARD_ART[this.name()];
      // The card's title says what it opens.
      el.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    });
  }
}
