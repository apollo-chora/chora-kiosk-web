import { TestBed } from '@angular/core/testing';

import { VisitTally } from './visit-tally';

// The demo session's answers, for the crews timeline's last row (mockup state.tally.answers):
// each scene counts an answer the product graded, and the count is forgotten when the session ends.
describe('VisitTally', () => {
  it('counts answers, several at once for a submitted assessment, and forgets them', () => {
    const tally = TestBed.inject(VisitTally);
    expect(tally.answers()).toBe(0);
    tally.answered();
    tally.answered(3);
    expect(tally.answers()).toBe(4);
    tally.forget();
    expect(tally.answers()).toBe(0);
  });

  it('refuses a count that is not a positive whole number', () => {
    const tally = TestBed.inject(VisitTally);
    expect(() => tally.answered(0)).toThrow(/not a count of answers: 0/);
    expect(() => tally.answered(1.5)).toThrow(/not a count of answers: 1.5/);
    expect(tally.answers()).toBe(0);
  });
});
