import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { ConceptLensMapComponent } from './concept-lens-map.component';
import { HEX_R, RELAX_MARGIN, REFOCUS_MS } from './concept-lens';
import type { ConceptEdge, ConceptNode } from '../../discovery-graph/concept-graph.model';
import type { FogGhost } from '../campaign.model';
import waterGraph from '../../../../../dev/fixtures/world/map-water-graph.json';

// KIOSK (K174): a face-down "?" ghost that would touch an idea is left out of every lens (story, atlas,
// Companions); it stays listed in the concept's drawer. Positions and data are unchanged. The seeded water
// map is the golden world's own (dev/fixtures/world/map-water-graph.json).
const WATER = waterGraph.body;
const concepts = WATER.concepts as unknown as ConceptNode[];
const edges = WATER.edges as unknown as ConceptEdge[];
const idOf = (title: string): string => {
  const c = concepts.find((x) => x.title === title);
  if (!c) throw new Error(`the water map has no ${title}`);
  return c.conceptId;
};
const TAPS = idOf('Four National Taps');
const DESAL = idOf('Desalination');

const six = (focal: string): FogGhost[] => Array.from({ length: 6 }, (_, i) => ({ suggestionId: `g${i}`, focalConceptId: focal, title: 'Mystery' }));

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function placed(el: Element): Placed {
  const t = el.getAttribute('transform') ?? '';
  const m = /translate\(([-\d.]+)\s+([-\d.]+)\)\s*scale\(([\d.]+)\)/.exec(t);
  if (!m) throw new Error(`no translate and scale in "${t}"`);
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
}

describe('the lens fog (KIOSK, K174): no ghost touches an idea', () => {
  let fixture: ComponentFixture<ConceptLensMapComponent>;
  let element: HTMLElement;

  function mount(focusId: string, ghosts: readonly FogGhost[], withEdges: readonly ConceptEdge[] = edges): void {
    fixture.componentRef.setInput('concepts', concepts);
    fixture.componentRef.setInput('edges', withEdges);
    fixture.componentRef.setInput('focusId', focusId);
    fixture.componentRef.setInput('rootId', WATER.rootConceptId);
    fixture.componentRef.setInput('fogGhosts', ghosts);
    fixture.detectChanges();
  }

  const ghostEls = () => [...element.querySelectorAll('[data-testid^="lens-fog-ghost-"]')];
  const ghostIds = () => ghostEls().map((g) => g.getAttribute('data-testid'));
  const nodeOf = (id: string) => element.querySelector(`[data-testid="concept-lens-node-${id}"]`) as Element;

  /** Each shown ghost's clearance to every idea but its own (negative: it touches). */
  function clearances(focal: string): number[] {
    return ghostEls().flatMap((g) => {
      const p = placed(g);
      return concepts
        .filter((c) => c.conceptId !== focal)
        .map((c) => {
          const n = placed(nodeOf(c.conceptId));
          return Math.hypot(p.x - n.x, p.y - n.y) - HEX_R * (0.45 * p.z + n.z) * RELAX_MARGIN;
        });
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConceptLensMapComponent], providers: [provideTranslateService()] }).compileComponents();
    fixture = TestBed.createComponent(ConceptLensMapComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('story step 1 (the lens on Four National Taps): all six of Desalination ghosts show, none too close', () => {
    // K202 keeps a fixed distance between linked ideas, so Desalination (a sibling of Taps, riding the
    // root's landmass) sits clear of its neighbours and every slot around it is free of ideas; on the
    // squeezed layout before it, two of the six touched an idea and were left out (W48).
    mount(TAPS, six(DESAL));
    expect(ghostEls()).toHaveLength(6);
    expect(Math.min(...clearances(DESAL))).toBeGreaterThanOrEqual(0);
  });

  it('the lens on Desalination: all six show, none too close', () => {
    mount(DESAL, six(DESAL));
    expect(ghostEls()).toHaveLength(6);
    expect(Math.min(...clearances(DESAL))).toBeGreaterThanOrEqual(0);
  });

  it('an idea with four children shows at most two of six ghosts (six slots in all)', () => {
    // K191 moved Desalination from Four National Taps to the root; this case puts it back under Taps, the
    // shape the cap was measured on (four children, so two free slots), with every other idea as seeded.
    const fourUnderTaps = edges.map((e) => (e.targetConceptId === DESAL && e.class === 'hierarchy' ? { ...e, sourceConceptId: TAPS } : e));
    expect(fourUnderTaps.filter((e) => e.sourceConceptId === TAPS && e.class === 'hierarchy')).toHaveLength(4);
    mount(TAPS, six(TAPS), fourUnderTaps);
    expect(ghostEls()).toHaveLength(2);
    expect(Math.min(...clearances(TAPS))).toBeGreaterThanOrEqual(0);
  });

  it('shows the same ghosts at the start and the end of a glide (no flicker mid-glide)', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    mount(DESAL, six(DESAL));
    fixture.componentRef.setInput('focusId', TAPS);
    fixture.detectChanges();
    const start = ghostIds();
    now = 1000 + REFOCUS_MS * 0.5;
    frames.splice(0).forEach((cb) => cb(now));
    fixture.detectChanges();
    const middle = ghostIds();
    now = 1000 + REFOCUS_MS;
    frames.splice(0).forEach((cb) => cb(now));
    fixture.detectChanges();
    const end = ghostIds();

    expect(end).toHaveLength(6);
    expect(start).toEqual(end);
    expect(middle).toEqual(end);
  });
});
