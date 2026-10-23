import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * An element an answer brings onto the screen (a verdict, a won banner) scrolls itself into view
 * inside its drawer once drawn (K138 W4: the Companions quiz drawer showed about 442 of its 724 px,
 * so the verdict and the win stayed below the fold). `nearest` moves only the drawer's own scroll
 * box (.kd-body; the stage clips and cannot scroll); the smoothness is the drawer's CSS, which
 * prefers-reduced-motion turns off (_kiosk-additions.scss).
 */
@Directive({ selector: '[kioskReveal]' })
export class RevealDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => el.scrollIntoView({ block: 'nearest' }));
  }
}
