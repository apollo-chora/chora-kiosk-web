import { Injectable, inject, signal } from '@angular/core';

import { KioskStore } from '../shell/kiosk.store';

/** Every kind of "Behind the scenes" (mockup xrayHTML, line 6283). */
export type XrayKind = 'q' | 'words' | 'draft' | 'rev' | 'maps' | 'comp' | 'dash' | 'grade';

/** The kinds that describe how a scene works, not one run: no record to read. */
export type DescriptiveKind = Extract<XrayKind, 'maps' | 'comp' | 'dash' | 'grade'>;

/**
 * "How was this made?" opens the "Behind the scenes" panel (K75; mockup openXray) on the scene's own
 * kind, in the overlay the store keeps.
 */
@Injectable({ providedIn: 'root' })
export class BehindTheScenes {
  private readonly store = inject(KioskStore);
  private readonly kindSig = signal<XrayKind | null>(null);
  readonly kind = this.kindSig.asReadonly();

  open(kind: XrayKind): void {
    this.store.openOverlay('xray');
    this.kindSig.set(kind);
  }
}
