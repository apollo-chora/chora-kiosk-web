import { DestroyRef, Injectable, Signal, TemplateRef, effect, inject, signal } from '@angular/core';

/**
 * The frame's footer (#bottom) belongs to the shell; what it holds belongs to the scene
 * showing (the mockup's renderBottom per scene). A scene hands its footer template here
 * while it shows; the shell renders it in place.
 */
@Injectable({ providedIn: 'root' })
export class FooterSlot {
  private readonly current = signal<TemplateRef<unknown> | null>(null);
  readonly template = this.current.asReadonly();

  set(template: TemplateRef<unknown>): void {
    this.current.set(template);
  }

  clear(template: TemplateRef<unknown>): void {
    if (this.current() === template) this.current.set(null);
  }
}

/**
 * For a scene component: shows its footer template while the scene lives. Pass a viewChild
 * declared as a class field (the compiler makes queries only from field initializers):
 *   private readonly footer = viewChild<TemplateRef<unknown>>('footer');
 *   constructor() { provideSceneFooter(this.footer); }
 */
export function provideSceneFooter(template: Signal<TemplateRef<unknown> | undefined>): void {
  const slot = inject(FooterSlot);
  let shown: TemplateRef<unknown> | undefined;
  effect(() => {
    const t = template();
    if (t && t !== shown) {
      shown = t;
      slot.set(t);
    }
  });
  inject(DestroyRef).onDestroy(() => {
    if (shown) slot.clear(shown);
  });
}
