import { Provider } from '@angular/core';

import { VISIT_RANDOM } from './visit-order';

/** Fisher-Yates swaps each position with itself: the serve door's order stays. */
const KEEP = () => 1 - Number.EPSILON;

/** A seeded random source (mulberry32) for K149's tests: the same seed, the same draws. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * For a spec that is not about K149: every draw keeps an option where it stands (Fisher-Yates
 * swaps each position with itself), so the options show in the serve door's order.
 */
export function keepServedOrder(): Provider[] {
  return [{ provide: VISIT_RANDOM, useValue: KEEP }];
}

/**
 * For a spec whose K149 cases share its TestBed setup: the serve door's order until a case calls
 * `drawFrom(seed)` before the scene reads its question.
 */
export class OrderSource {
  private next: () => number = KEEP;
  readonly providers: Provider[] = [{ provide: VISIT_RANDOM, useValue: () => this.next() }];

  drawFrom(seed: number): void {
    this.next = seededRandom(seed);
  }

  keep(): void {
    this.next = KEEP;
  }
}
