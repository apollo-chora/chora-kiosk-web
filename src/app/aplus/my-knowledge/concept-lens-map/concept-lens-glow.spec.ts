import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { ConceptLensMapComponent } from './concept-lens-map.component';
import { HEX_CORNER, HEX_R, roundedHexPath } from './concept-lens';
import type { ConceptEdge, ConceptNode } from '../../discovery-graph/concept-graph.model';

// KIOSK (K37): the gold glow on the ideas to click next, the one addition the approved mockup makes
// to production's lens (`lens-glow`, mockup line 4040: a hex 1.16 times the tile, never on the focus).
const concepts: ConceptNode[] = [
  { conceptId: 'root', title: 'Singapore’s water', atomRefs: [] },
  { conceptId: 'taps', title: 'Four National Taps', atomRefs: [] },
  { conceptId: 'newater', title: 'NEWater', atomRefs: [] },
  { conceptId: 'desal', title: 'Desalination', atomRefs: [] },
];
const edges: ConceptEdge[] = [
  { edgeId: 'e1', sourceConceptId: 'root', targetConceptId: 'taps', class: 'hierarchy', provenance: 'learner_authored' },
  { edgeId: 'e2', sourceConceptId: 'taps', targetConceptId: 'newater', class: 'hierarchy', provenance: 'learner_authored' },
  { edgeId: 'e3', sourceConceptId: 'taps', targetConceptId: 'desal', class: 'hierarchy', provenance: 'learner_authored' },
];

function mount(glowIds: readonly string[] | undefined, focusId = 'taps'): HTMLElement {
  TestBed.configureTestingModule({ imports: [ConceptLensMapComponent], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(ConceptLensMapComponent);
  fixture.componentRef.setInput('concepts', concepts);
  fixture.componentRef.setInput('edges', edges);
  fixture.componentRef.setInput('focusId', focusId);
  fixture.componentRef.setInput('rootId', 'root');
  if (glowIds) fixture.componentRef.setInput('glowIds', glowIds);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const glowsOn = (el: HTMLElement) =>
  [...el.querySelectorAll('.lens-node')].filter((n) => n.querySelector(':scope > .lens-glow')).map((n) => n.getAttribute('data-id'));

describe('the lens glow (KIOSK, K37)', () => {
  it('rings each idea to click next with a hex 1.16 times the tile', () => {
    const el = mount(['newater', 'desal']);
    expect(glowsOn(el).sort()).toEqual(['desal', 'newater']);
    const glow = el.querySelector('[data-id="newater"] > .lens-glow');
    expect(glow?.getAttribute('d')).toBe(roundedHexPath(HEX_R * 1.16, HEX_CORNER * 1.16));
    expect(glow?.getAttribute('aria-hidden')).toBe('true');
  });

  it('never rings the focus, and rings nothing by default (production unchanged)', () => {
    expect(glowsOn(mount(['taps', 'newater']))).toEqual(['newater']);
    TestBed.resetTestingModule();
    expect(glowsOn(mount(undefined))).toEqual([]);
  });
});
