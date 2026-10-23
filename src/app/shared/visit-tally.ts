import { Injectable, signal } from '@angular/core';

/**
 * The answers this demo session gave (mockup state.tally.answers), for the crews timeline's last row:
 * the story's practice question, the atlas's, the Companions' quiz and dose check, a submitted
 * assessment's multiple-choice answers and a released grade each count once the product has them.
 * The ideas added and the revisions made are read from VisitDecisions and the studio. Forgotten when
 * the demo session ends.
 */
@Injectable({ providedIn: 'root' })
export class VisitTally {
  private readonly answersSig = signal(0);
  readonly answers = this.answersSig.asReadonly();

  answered(n = 1): void {
    if (!Number.isInteger(n) || n < 1) throw new Error(`[kiosk] not a count of answers: ${n}`);
    this.answersSig.update((a) => a + n);
  }

  forget(): void {
    this.answersSig.set(0);
  }
}
