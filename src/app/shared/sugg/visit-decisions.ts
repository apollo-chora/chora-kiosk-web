import { Injectable, signal } from '@angular/core';

import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';

/** A suggestion this visit decided, kept with its title. */
export interface Decided {
  readonly suggestion: ConceptSuggestion;
  readonly state: 'added' | 'dropped';
}

/**
 * What the visitor did to each suggestion this visit (K42: the atlas shows the hook's new ideas). A
 * decided suggestion leaves the pending read, so each scene that decides one records it here, and a
 * later scene shows it as added or dismissed. Forgotten when the demo session ends.
 */
@Injectable({ providedIn: 'root' })
export class VisitDecisions {
  private readonly decided = signal<ReadonlyMap<string, Decided>>(new Map());
  readonly all = this.decided.asReadonly();

  record(suggestion: ConceptSuggestion, action: 'accept' | 'dismiss'): void {
    const state = action === 'accept' ? 'added' : 'dropped';
    this.decided.update((m) => new Map(m).set(suggestion.suggestionId, { suggestion, state }));
  }

  forget(): void {
    this.decided.set(new Map());
  }
}
