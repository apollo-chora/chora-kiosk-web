import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input } from '@angular/core';

import { ICONS, IconName } from './icons';

/**
 * One inline SVG icon from the kiosk's table (the mockup's own markup, verbatim). The host
 * takes no box (display: contents), so the mockup's stylesheet sizes the svg in place,
 * exactly as it does in the mockup (".btn svg", ".stamp .clock").
 *
 * The markup is a compile-time constant (the name is typed against ICONS, so no runtime
 * text reaches it), so it is written to the host directly: a sanitised [innerHTML] binding
 * would strip the svg element.
 */
@Component({
  selector: 'kiosk-icon',
  template: '',
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const el = this.host.nativeElement;
      el.innerHTML = ICONS[this.name()];
      // The button or text beside an icon carries its meaning.
      el.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    });
  }
}
