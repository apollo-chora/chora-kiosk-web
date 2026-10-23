import { TestBed } from '@angular/core/testing';

import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { VisitDecisions } from './visit-decisions';

const s = (id: string, title: string) => ({ suggestionId: id, kind: 'concept', status: 'pending', title }) as ConceptSuggestion;

// What the visitor did to each suggestion this visit (K42): a decided suggestion leaves the pending
// read, so its title and what became of it are kept here for every later scene, until the visit ends.
describe('VisitDecisions', () => {
  it('keeps each decision with its suggestion, the latest winning', () => {
    const d = TestBed.inject(VisitDecisions);
    d.record(s('s-ro', 'Reverse osmosis'), 'accept');
    d.record(s('s-uv', 'UV disinfection'), 'dismiss');
    expect([...d.all().entries()].map(([id, x]) => [id, x.suggestion.title, x.state])).toEqual([
      ['s-ro', 'Reverse osmosis', 'added'],
      ['s-uv', 'UV disinfection', 'dropped'],
    ]);
  });

  it('forgets every decision when the visit ends', () => {
    const d = TestBed.inject(VisitDecisions);
    d.record(s('s-ro', 'Reverse osmosis'), 'accept');
    d.forget();
    expect(d.all().size).toBe(0);
  });
});
