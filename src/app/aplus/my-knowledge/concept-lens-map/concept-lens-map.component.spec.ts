import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { ConceptLensMapComponent } from './concept-lens-map.component';
import { HEX_R, REFOCUS_MS, LABEL_HARD_CAP, PARENT_SCALE, PARENT_DIST } from './concept-lens';
import type { ConceptEdge, ConceptNode } from '../../discovery-graph/concept-graph.model';
import type { CampaignNodeState, FogGhost, MapCampaign } from '../campaign.model';

function concept(conceptId: string, title: string, over: Partial<ConceptNode> = {}): ConceptNode {
  return { conceptId, title, atomRefs: [], ...over };
}

function edge(
  edgeId: string,
  source: string,
  target: string,
  cls: 'hierarchy' | 'lateral' = 'hierarchy',
): ConceptEdge {
  return {
    edgeId,
    sourceConceptId: source,
    targetConceptId: target,
    class: cls,
    provenance: 'learner_authored',
  };
}

function campaignState(over: Partial<CampaignNodeState> = {}): CampaignNodeState {
  return {
    rungsCleared: 0,
    currentRungCorrect: 0,
    cooling: false,
    advancedToday: false,
    ...over,
  };
}

function mapCampaign(over: Partial<MapCampaign> = {}): MapCampaign {
  return { frontierTotal: 4, frontierWon: 0, canSeal: false, nodes: {}, ...over };
}

function fogGhost(suggestionId: string, focalConceptId: string, title = 'Mystery'): FogGhost {
  return { suggestionId, focalConceptId, title };
}

/** Root "Fractions" → three children (a small, real-shaped map). */
const CONCEPTS: ConceptNode[] = [
  concept('root', 'Fractions'),
  concept('num', 'Numerator'),
  concept('den', 'Common Denominator'),
  concept('ratio', 'Ratio'),
];
const EDGES: ConceptEdge[] = [
  edge('e1', 'root', 'num'),
  edge('e2', 'root', 'den'),
  edge('e3', 'root', 'ratio'),
];

/** Scale factor parsed out of an SVG `translate(x y) scale(z)` transform. */
function scaleOf(el: Element | null): number {
  const t = el?.getAttribute('transform') ?? '';
  const m = /scale\(([\d.]+)\)/.exec(t);
  return m ? parseFloat(m[1]) : NaN;
}

/** [x, y] translate parsed out of an SVG `translate(x y) scale(z)` transform. */
function translateOf(el: Element | null): [number, number] {
  const t = el?.getAttribute('transform') ?? '';
  const m = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(t);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [NaN, NaN];
}

describe('ConceptLensMapComponent', () => {
  let fixture: ComponentFixture<ConceptLensMapComponent>;
  let component: ConceptLensMapComponent;
  let element: HTMLElement;

  function mount(
    concepts: ConceptNode[] = CONCEPTS,
    edges: ConceptEdge[] = EDGES,
    focusId = 'root',
    rootId: string | undefined = 'root',
  ): void {
    fixture.componentRef.setInput('concepts', concepts);
    fixture.componentRef.setInput('edges', edges);
    fixture.componentRef.setInput('focusId', focusId);
    fixture.componentRef.setInput('rootId', rootId);
    fixture.detectChanges();
  }

  function node(id: string): SVGGElement | null {
    return element.querySelector<SVGGElement>(`[data-testid="concept-lens-node-${id}"]`);
  }

  /** SVG elements have no HTMLElement.click() in jsdom: dispatch a real event. */
  function clickNode(id: string): void {
    node(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConceptLensMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(ConceptLensMapComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates and exposes the root test id', () => {
    mount();
    expect(component).toBeTruthy();
    expect(element.querySelector('[data-testid="concept-lens-map"]')).toBeTruthy();
  });

  it('renders EVERY concept as a node (the whole map, not just 6 neighbours)', () => {
    mount();
    for (const c of CONCEPTS) {
      expect(node(c.conceptId)).toBeTruthy();
    }
    expect(element.querySelectorAll('[data-testid^="concept-lens-node-"]').length).toBe(
      CONCEPTS.length,
    );
  });

  it('renders one edge path per edge', () => {
    mount();
    expect(element.querySelectorAll('.lens-edge').length).toBe(EDGES.length);
  });

  it('wraps a long label onto two lines (no truncation)', () => {
    mount();
    const tspans = node('den')?.querySelectorAll('tspan');
    expect(tspans?.length).toBe(2); // "Common" / "Denominator"
    expect(node('den')?.textContent).toContain('Common');
    expect(node('den')?.textContent).toContain('Denominator');
  });

  it('fits an over-long label to the hex (shrinks + caps) and reveals the full title on hover', () => {
    const long = 'Light-Dependent Photosynthesis Stages';
    mount([concept('root', 'Fractions'), concept('lp', long)], [edge('e1', 'root', 'lp')]);
    const g = node('lp');
    // Full title stays available via the hover <title> (+ the drawer).
    expect(g?.querySelector('title')?.textContent).toBe(long);
    // The label shrinks (<1) so it fits the hex instead of spilling.
    const label = g?.querySelector<SVGTextElement>('.lens-label');
    const m = /scale\(([\d.]+)\)/.exec(label?.getAttribute('transform') ?? '');
    expect(m).toBeTruthy();
    expect(parseFloat(m![1])).toBeLessThan(1);
    // No rendered line exceeds the hard cap: nothing spills.
    for (const ts of Array.from(g?.querySelectorAll('tspan') ?? [])) {
      expect((ts.textContent ?? '').length).toBeLessThanOrEqual(LABEL_HARD_CAP);
    }
  });

  it('hard-clips every node label to the hex (belt-and-suspenders past the char-shrink)', () => {
    // The char-estimate shrink (layoutLabel) fits the *typical* case; a
    // pathological all-wide-glyph label could still TOUCH the hex edge. A single
    // shared hex clipPath, referenced by each node's label group, geometrically
    // guarantees no glyph can ever paint outside the hex: for every node.
    mount();
    // Defined once…
    const clip = element.querySelector('#lens-hex-clip');
    expect(clip).toBeTruthy();
    expect(clip?.tagName.toLowerCase()).toBe('clippath');
    // …with the SAME geometry as the visible hex (so it clips to the hex edge).
    expect(clip?.querySelector('path')?.getAttribute('d')).toBe(component.hexPath);

    for (const c of CONCEPTS) {
      const g = node(c.conceptId);
      const label = g?.querySelector<SVGTextElement>('.lens-label');
      expect(label).toBeTruthy();
      // The label lives inside a group bound to the shared hex clip…
      const clipped = label?.closest('[clip-path]') as SVGElement | null;
      expect(clipped).toBeTruthy();
      expect(clipped?.getAttribute('clip-path')).toBe('url(#lens-hex-clip)');
      // …and that clip group carries NO scale transform: otherwise the clip
      // would shrink WITH the label and stop guaranteeing hex containment.
      expect(clipped?.getAttribute('transform') ?? '').not.toContain('scale');
    }
  });

  it('paints growth state on the hexes only under the matching lens (Growth=shaky, Mastery=mastered)', () => {
    // Realises the WS-D lens spec (map-canvas §5): the Growth lens must actually
    // HIGHLIGHT the map (subtitle: "highlights where you can grow next"), not
    // just the drawer chips. Data (growthEdge/mastered/intent) already flows in
    // via [concepts]; the fisheye must render it under the right lens.
    const shaky = concept('sh', 'Photosynthesis', {
      growthEdge: { edgeId: 'g1', conceptKey: 'photosynthesis', strength: 0.8 },
    });
    const mastered = concept('ma', 'Addition', { mastered: true });
    const remediate = concept('re', 'Ratios', { intent: 'remediate' });
    const plain = concept('pl', 'Nouns');
    const nodes = [concept('root', 'Fractions'), shaky, mastered, remediate, plain];
    const edges = [
      edge('e1', 'root', 'sh'),
      edge('e2', 'root', 'ma'),
      edge('e3', 'root', 're'),
      edge('e4', 'root', 'pl'),
    ];

    // Explore (default lens) → NO growth paint anywhere (pure structure view).
    mount(nodes, edges, 'root', 'root');
    expect(node('sh')?.classList.contains('lens-node--shaky')).toBe(false);
    expect(node('ma')?.classList.contains('lens-node--mastered')).toBe(false);

    // Growth lens → evidenced-weakness AND remediate-intent read shaky; others don't.
    fixture.componentRef.setInput('lens', 'growth');
    fixture.detectChanges();
    expect(node('sh')?.classList.contains('lens-node--shaky')).toBe(true);
    expect(node('re')?.classList.contains('lens-node--shaky')).toBe(true);
    expect(node('ma')?.classList.contains('lens-node--shaky')).toBe(false);
    expect(node('pl')?.classList.contains('lens-node--shaky')).toBe(false);
    expect(node('ma')?.classList.contains('lens-node--mastered')).toBe(false);

    // Mastery lens → mastered reads mastered; the shaky node does not.
    fixture.componentRef.setInput('lens', 'mastery');
    fixture.detectChanges();
    expect(node('ma')?.classList.contains('lens-node--mastered')).toBe(true);
    expect(node('sh')?.classList.contains('lens-node--mastered')).toBe(false);
    expect(node('sh')?.classList.contains('lens-node--shaky')).toBe(false);
  });

  it('shows a faint always-on shaky cue in every lens (Growth adds the bold paint on top)', () => {
    // map-canvas §5: shaky/due cues stay faintly on in EVERY lens so a weakness
    // is never invisible; the Growth lens then intensifies to the bold fill.
    const shaky = concept('sh', 'Photosynthesis', {
      growthEdge: { edgeId: 'g1', conceptKey: 'photosynthesis', strength: 0.8 },
    });
    const plain = concept('pl', 'Nouns');
    const nodes = [concept('root', 'Fractions'), shaky, plain];
    const edges = [edge('e1', 'root', 'sh'), edge('e2', 'root', 'pl')];

    // Explore → faint cue on the shaky node, NO bold paint; nothing on the plain node.
    mount(nodes, edges, 'root', 'root');
    expect(node('sh')?.classList.contains('lens-node--cue-shaky')).toBe(true);
    expect(node('sh')?.classList.contains('lens-node--shaky')).toBe(false);
    expect(node('pl')?.classList.contains('lens-node--cue-shaky')).toBe(false);

    // Growth → the faint cue stays AND the bold paint is added on top.
    fixture.componentRef.setInput('lens', 'growth');
    fixture.detectChanges();
    expect(node('sh')?.classList.contains('lens-node--cue-shaky')).toBe(true);
    expect(node('sh')?.classList.contains('lens-node--shaky')).toBe(true);
  });

  it('marks a due concept with the distinct amber due cue (shaky nodes stay rose)', () => {
    // Ebbinghaus "due for review" is a distinct, more-urgent tell than plain
    // shaky: it gets its own amber cue. A due node is also shaky (it carries a
    // growthEdge), so it keeps the shaky cue class too; a not-due shaky node does
    // NOT get the due cue.
    const due = concept('du', 'Photosynthesis', {
      growthEdge: { edgeId: 'g1', conceptKey: 'photosynthesis', strength: 0.8, isDue: true },
    });
    const shakyNotDue = concept('sh', 'Ratios', {
      growthEdge: { edgeId: 'g2', conceptKey: 'ratios', strength: 0.5 },
    });
    const nodes = [concept('root', 'Fractions'), due, shakyNotDue];
    const edges = [edge('e1', 'root', 'du'), edge('e2', 'root', 'sh')];

    mount(nodes, edges, 'root', 'root'); // explore: cues are always-on
    expect(node('du')?.classList.contains('lens-node--cue-due')).toBe(true);
    expect(node('du')?.classList.contains('lens-node--cue-shaky')).toBe(true);
    expect(node('sh')?.classList.contains('lens-node--cue-due')).toBe(false);
    expect(node('sh')?.classList.contains('lens-node--cue-shaky')).toBe(true);
  });

  it('magnifies the focus above every non-parent node (the lens)', () => {
    mount(CONCEPTS, EDGES, 'num'); // focus a child; 'root' is its parent landmass
    const focusScale = scaleOf(node('num'));
    // Siblings / periphery shrink under the focus. The PARENT ('root') is a
    // deliberate large clipped landmass (asserted separately), so it's excluded.
    for (const id of ['den', 'ratio']) {
      expect(focusScale).toBeGreaterThan(scaleOf(node(id)));
    }
  });

  it('renders the focus PARENT as an enlarged, pushed-out landmass (a clipped tap-target)', () => {
    mount(CONCEPTS, EDGES, 'num'); // focus num; its hierarchy parent is 'root'
    const focusScale = scaleOf(node('num'));
    const parentScale = scaleOf(node('root'));
    // The parent is a big landmass: larger than the focus…
    expect(parentScale).toBeCloseTo(PARENT_SCALE, 2);
    expect(parentScale).toBeGreaterThan(focusScale);
    // …pushed further from the viewBox centre than any sibling, out past the
    // fitted ring so the frame clips it.
    const distFromCentre = (id: string): number => {
      const [x, y] = translateOf(node(id));
      return Math.hypot(x - 500, y - 292);
    };
    // …pushed well past the centred focus, out toward the frame edge so the
    // container clips it (a fixed, substantial distance from centre).
    expect(distFromCentre('root')).toBeGreaterThan(distFromCentre('num'));
    expect(distFromCentre('root')).toBeGreaterThan(150);
  });

  it('paints the focus ancestors behind it: deepest (root) furthest back', () => {
    // root → mid → leaf; focus the leaf. Paint (document) order must be root
    // before mid before leaf, so a downward overlap reads leaf > mid (parent) >
    // root (grandparent) front-to-back (owner 2026-07-16).
    const nodes = [concept('root', 'R'), concept('mid', 'M'), concept('leaf', 'L')];
    const edges = [edge('e1', 'root', 'mid'), edge('e2', 'mid', 'leaf')];
    mount(nodes, edges, 'leaf', 'root'); // focus the leaf (depth 2)
    const order = Array.from(element.querySelectorAll('[data-testid^="concept-lens-node-"]')).map(
      (g) => g.getAttribute('data-id'),
    );
    expect(order.indexOf('root')).toBeLessThan(order.indexOf('mid'));
    expect(order.indexOf('mid')).toBeLessThan(order.indexOf('leaf'));
  });

  it('recedes a deeper ancestor further out + smaller (grandparent past the parent)', () => {
    // root → mid → leaf; focus the leaf (depth 2). The direct parent 'mid' is the
    // near landmass (PARENT_DIST out); the grandparent 'root' recedes FURTHER out
    // and smaller so it sits below/behind the parent: clipped by the frame, never
    // floating on top of it (owner 2026-07-16).
    const nodes = [concept('root', 'R'), concept('mid', 'M'), concept('leaf', 'L')];
    const edges = [edge('e1', 'root', 'mid'), edge('e2', 'mid', 'leaf')];
    mount(nodes, edges, 'leaf', 'root');
    const distFromCentre = (id: string): number => {
      const [x, y] = translateOf(node(id));
      return Math.hypot(x - 500, y - 292);
    };
    // parent 'mid' is the near landmass at PARENT_DIST; grandparent 'root' further.
    expect(distFromCentre('mid')).toBeCloseTo(PARENT_DIST, 0);
    expect(distFromCentre('root')).toBeGreaterThan(distFromCentre('mid'));
    // …and it recedes: smaller than the near parent landmass.
    expect(scaleOf(node('root'))).toBeLessThan(scaleOf(node('mid')));
  });

  it('fades OFF-SPINE nodes (the parent’s siblings) but not ancestors/descendants', () => {
    // root → {mid, aunt}; mid → leaf. Focus the leaf: its spine is leaf + ancestors
    // (mid, root). 'aunt' (mid's sibling, off-spine) must fade to faint context so it
    // doesn't clutter the focal view / the mid landmass it may overlap (owner 2026-07-16).
    const nodes = [
      concept('root', 'R'),
      concept('mid', 'M'),
      concept('aunt', 'A'),
      concept('leaf', 'L'),
    ];
    const edges = [
      edge('e1', 'root', 'mid'),
      edge('e2', 'root', 'aunt'),
      edge('e3', 'mid', 'leaf'),
    ];
    mount(nodes, edges, 'leaf', 'root');
    // Off-spine aunt fades; it is not an ancestor (not dimmed).
    expect(node('aunt')?.classList.contains('lens-node--faded')).toBe(true);
    expect(node('aunt')?.classList.contains('lens-node--dimmed')).toBe(false);
    // Ancestors dim (landmass path) but never fade; the focus does neither.
    expect(node('mid')?.classList.contains('lens-node--faded')).toBe(false);
    expect(node('mid')?.classList.contains('lens-node--dimmed')).toBe(true);
    expect(node('leaf')?.classList.contains('lens-node--faded')).toBe(false);
  });

  it('rides an off-spine node with its real parent (aunt clusters by root, not its sibling)', () => {
    // root → {mid, aunt}; mid → leaf. Focus the leaf: 'aunt' (root's other child)
    // is off-spine. Its parent root is a displaced ancestor, so the aunt rides
    // root's displacement and stays clustered by root: never stranded next to
    // its sibling 'mid' (pushed to the near landmass) (owner 2026-07-16).
    const nodes = [
      concept('root', 'R'),
      concept('mid', 'M'),
      concept('aunt', 'A'),
      concept('leaf', 'L'),
    ];
    const edges = [
      edge('e1', 'root', 'mid'),
      edge('e2', 'root', 'aunt'),
      edge('e3', 'mid', 'leaf'),
    ];
    mount(nodes, edges, 'leaf', 'root');
    const pos = (id: string): { x: number; y: number } => {
      const [x, y] = translateOf(node(id));
      return { x, y };
    };
    const d = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const aunt = pos('aunt');
    // The aunt hugs its PARENT (root), not its sibling (mid).
    expect(d(aunt, pos('root'))).toBeLessThan(d(aunt, pos('mid')));
  });

  it('rides a GRANDCHILD of a displaced ancestor too (the ride must cascade)', () => {
    // root → {mid, aunt}; mid → leaf; aunt → cousin. Focus the leaf.
    // 'aunt' is off-spine and rides root (covered by the test above). 'cousin' is
    // aunt's CHILD: its parent is not itself an ancestor of the focus, so the
    // one-level test left it at its raw fisheye position while its whole parent
    // chain moved away. Owner-reported at tier 3 ("Cross Multiply" detached).
    // The cluster must travel together: aunt→cousin separation is PRESERVED.
    const nodes = [
      concept('root', 'R'),
      concept('mid', 'M'),
      concept('aunt', 'A'),
      concept('leaf', 'L'),
      concept('cousin', 'C'),
    ];
    const edges = [
      edge('e1', 'root', 'mid'),
      edge('e2', 'root', 'aunt'),
      edge('e3', 'mid', 'leaf'),
      edge('e4', 'aunt', 'cousin'),
    ];
    const pos = (id: string): { x: number; y: number } => {
      const [x, y] = translateOf(node(id));
      return { x, y };
    };
    const d = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.hypot(a.x - b.x, a.y - b.y);

    // Focus the leaf: root becomes a displaced ancestor, so aunt rides it, and
    // cousin (aunt's child) must ride it too.
    //
    // Assertions are SCALE-FREE on purpose. Comparing against a root-focused
    // mount would be invalid: `fitScale` is computed from the focus + its direct
    // children, so it differs per focus and rescales every base offset. A raw
    // cross-mount distance comparison measures the fit change, not the ride.
    mount(nodes, edges, 'leaf', 'root');
    const cousin = pos('cousin');

    // Clusters with its REAL parent, not with the focus or the spine sibling.
    expect(d(cousin, pos('aunt'))).toBeLessThan(d(cousin, pos('mid')));
    expect(d(cousin, pos('aunt'))).toBeLessThan(d(cousin, pos('leaf')));
    // The pair is tighter than the gap between the aunt and the spine: proof the
    // cousin TRAVELLED with the aunt rather than being stranded mid-frame.
    expect(d(cousin, pos('aunt'))).toBeLessThan(d(pos('aunt'), pos('mid')));
  });

  it('does NOT displace the focus subtree (a focus child must not ride an ancestor)', () => {
    // Walking up from a focus CHILD reaches the focus before any ancestor. The
    // walk must stop there: the focus stays centred, so its children stay with it.
    const nodes = [
      concept('root', 'R'),
      concept('mid', 'M'),
      concept('kid', 'K'),
    ];
    const edges = [edge('e1', 'root', 'mid'), edge('e2', 'mid', 'kid')];
    mount(nodes, edges, 'mid', 'root');
    const pos = (id: string): { x: number; y: number } => {
      const [x, y] = translateOf(node(id));
      return { x, y };
    };
    const d = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.hypot(a.x - b.x, a.y - b.y);
    // The kid hugs its focused parent, not the pushed-out root.
    expect(d(pos('kid'), pos('mid'))).toBeLessThan(d(pos('kid'), pos('root')));
  });

  it('a ridden node CLEARS the enlarged ancestor it rides (no hex overlap)', () => {
    // Owner-reported: with a node focused, the root landmass overlapped the
    // smaller nodes clustered around it. The ride translated a child by its
    // ancestor's displacement but kept the child's ORIGINAL offset, while the
    // ancestor renders at PARENT_SCALE. HEX_R 47 x 3.0 = a 141px radius, and the
    // children sit ~80-120px out, so they land INSIDE it. The offset must scale
    // with the ancestor, so the cluster expands as the ancestor grows.
    const nodes = [concept('root', 'R'), concept('mid', 'M'), concept('aunt', 'A'), concept('leaf', 'L')];
    const edges = [edge('e1', 'root', 'mid'), edge('e2', 'root', 'aunt'), edge('e3', 'mid', 'leaf')];
    mount(nodes, edges, 'leaf', 'root');

    const scaleOf = (id: string): number => {
      const t = node(id)?.getAttribute('transform') ?? '';
      const m = t.match(/scale\(([-\d.]+)\)/);
      return m ? +m[1] : 1;
    };
    const p = (id: string) => {
      const [x, y] = translateOf(node(id));
      return { x, y };
    };
    const rootP = p('root');
    const auntP = p('aunt');
    const centreDist = Math.hypot(rootP.x - auntP.x, rootP.y - auntP.y);
    const minClear = HEX_R * scaleOf('root') + HEX_R * scaleOf('aunt');

    // root is the GRANDparent here (focus=leaf → mid → root), so it renders at
    // PARENT_SCALE * PARENT_DEPTH_DECAY, not PARENT_SCALE. Assert it is enlarged
    // rather than pinning the exact tier.
    expect(scaleOf('root')).toBeGreaterThan(1);
    expect(scaleOf('root')).toBeLessThanOrEqual(PARENT_SCALE);
    expect(centreDist).toBeGreaterThan(minClear); // …and the aunt clears it
    // Clearing it is not enough: the push must be MINIMAL. Expanding the offset
    // by the ancestor's full scale also clears, but flings riders off the
    // 1000x584 canvas, breaking this lens's founding rule that nodes translate
    // and never disappear. Just past touching, not launched.
    expect(centreDist).toBeLessThan(minClear * 1.6);
  });

  it('riders of one ancestor never collide with EACH OTHER', () => {
    // Two riders at DIFFERENT distances from the same ancestor. A per-rider push
    // gives each its own factor, which deforms the cluster and can drive two
    // riders together: on the live map Cross Multiply and Equivalence Test ended
    // up 21px apart that way. One uniform factor per ancestor is a similarity
    // transform, so relative spacing survives.
    const nodes = [
      concept('root', 'R'),
      concept('mid', 'M'),
      concept('aunt', 'A'),
      concept('cousin', 'C'),
      concept('second', 'S'),
      concept('leaf', 'L'),
    ];
    const edges = [
      edge('e1', 'root', 'mid'),
      edge('e2', 'root', 'aunt'),
      edge('e3', 'mid', 'leaf'),
      edge('e4', 'aunt', 'cousin'),
      edge('e5', 'root', 'second'),
    ];
    mount(nodes, edges, 'leaf', 'root');

    const all = ['root', 'mid', 'aunt', 'cousin', 'second', 'leaf'].map((id) => {
      const [x, y] = translateOf(node(id));
      const t = node(id)?.getAttribute('transform') ?? '';
      const m = t.match(/scale\(([-\d.]+)\)/);
      return { id, x, y, z: m ? +m[1] : 1 };
    });
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const need = HEX_R * a.z + HEX_R * b.z;
        expect({ pair: `${a.id}/${b.id}`, overlap: dist < need }).toEqual({
          pair: `${a.id}/${b.id}`,
          overlap: false,
        });
      }
    }
  });

  it('never emits an INVERTED edge segment (the line-cutting artifact)', () => {
    // Edges are trimmed to the hex EDGE (a.x + ux*HEX_R*a.z). When two centres
    // are closer than the sum of their rendered radii, the trimmed start passes
    // the trimmed end and the segment reverses, which renders as a line stub
    // shooting the wrong way. Assert every drawn segment still points from
    // source toward target.
    const nodes = [concept('root', 'R'), concept('mid', 'M'), concept('aunt', 'A'), concept('leaf', 'L')];
    const edges = [edge('e1', 'root', 'mid'), edge('e2', 'root', 'aunt'), edge('e3', 'mid', 'leaf')];
    mount(nodes, edges, 'leaf', 'root');

    const p = (id: string) => {
      const [x, y] = translateOf(node(id));
      return { x, y };
    };
    const paths = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('path.lens-edge'),
    );
    // Every edge must still be drawn. The overlap guard SUPPRESSES a connector
    // between overlapping hexes, so a short count is itself an overlap report,
    // and it would silently shift the index-to-pair mapping below.
    expect(paths.length).toBe(edges.length);

    const pairs: Array<[string, string]> = [['root', 'mid'], ['root', 'aunt'], ['mid', 'leaf']];
    paths.forEach((el, i) => {
      const d = el.getAttribute('d') ?? '';
      const m = d.match(/M ([-\d.]+) ([-\d.]+) Q [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/);
      expect(m).not.toBeNull();
      if (!m) return;
      const seg = { x: +m[3] - +m[1], y: +m[4] - +m[2] };
      const [srcId, tgtId] = pairs[i];
      const src = p(srcId);
      const tgt = p(tgtId);
      const centre = { x: tgt.x - src.x, y: tgt.y - src.y };
      const dot = seg.x * centre.x + seg.y * centre.y;
      expect(dot).toBeGreaterThan(0); // same direction ⇒ not inverted
    });
  });

  it('marks the focus node with the focus class', () => {
    mount(CONCEPTS, EDGES, 'num');
    expect(node('num')?.classList.contains('lens-node--focus')).toBe(true);
    expect(node('root')?.classList.contains('lens-node--focus')).toBe(false);
  });

  it('centres the focus node at the viewBox centre (as big + prominent as possible)', () => {
    // The lens translates the whole cloud so the focus lands dead-centre: big,
    // stable, and the target of the fly-to-centre ease. (500, 292) = viewBox mid.
    mount(CONCEPTS, EDGES, 'num');
    const [x, y] = translateOf(node('num'));
    expect(x).toBeCloseTo(500, 0);
    expect(y).toBeCloseTo(292, 0);
  });

  it('fits the WHOLE frame (meet) so the focus + immediate ring never clip', () => {
    mount();
    const svg = element.querySelector('[data-testid="concept-lens-scene"]');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('keeps a lone root + child fully on screen (fit shrinks the ring, no top clip)', () => {
    // Regression (owner 2026-07-04): a root with ONE child clipped the child off
    // the top of the frame. The neighbourhood-fit must pull the ring back inside
    // the viewBox so the whole child hexagon is visible.
    const two = [concept('root', 'Solar System'), concept('kid', 'Inner Planets')];
    const edges = [edge('e1', 'root', 'kid')];
    mount(two, edges, 'root', 'root');
    const [, ky] = translateOf(node('kid'));
    const kz = scaleOf(node('kid'));
    // The child hexagon's TOP (centre − scaled radius) stays within the viewBox…
    expect(ky - HEX_R * kz).toBeGreaterThanOrEqual(0);
    // …and it is a real node drawn below the top edge (not collapsed to 0).
    expect(ky).toBeGreaterThan(0);
  });

  it('glides the whole map by shiftX (drawer-aware re-centring)', () => {
    mount();
    // Default: no shift (drawer closed) → centred on the full canvas.
    const shift = element.querySelector<SVGGElement>('[data-testid="concept-lens-shift"]');
    expect(shift?.getAttribute('style') ?? '').toContain('translate(0px, 0)');

    // Drawer open → parent passes a negative shift; the map glides left so the
    // focus re-centres on the visible region (same size: this is translate-only).
    fixture.componentRef.setInput('shiftX', -140);
    fixture.detectChanges();
    expect(shift?.getAttribute('style') ?? '').toContain('translate(-140px, 0)');
  });

  it('marks the root node (when it is not the focus) with the root class', () => {
    mount(CONCEPTS, EDGES, 'num', 'root');
    expect(node('root')?.classList.contains('lens-node--root')).toBe(true);
  });

  it('emits select with the tapped concept id', () => {
    mount();
    let picked: string | undefined;
    component.select.subscribe((id) => (picked = id));
    clickNode('num');
    expect(picked).toBe('num');
  });

  it('selects on Enter/Space (keyboard a11y)', () => {
    mount();
    let picked: string | undefined;
    component.select.subscribe((id) => (picked = id));
    node('den')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(picked).toBe('den');
  });

  it('does not select while loading (disabled)', () => {
    mount();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    let picked = false;
    component.select.subscribe(() => (picked = true));
    component.onSelect('num');
    expect(picked).toBe(false);
    expect(
      element.querySelector('[data-testid="concept-lens-scene"]')?.classList.contains('is-loading'),
    ).toBe(true);
  });

  it('EASES on re-focus: starts at the old position, never snaps to the target', () => {
    // The regression guard for the "no transition at all" bug: with motion ON,
    // capture the rAF frames so we control time. Right after the focus changes
    // and BEFORE any frame runs, the lens must still be centred on the OLD focus
    // (root): if it snapped, the new focus would already be the centred/biggest.
    // jsdom has no matchMedia → stub it so reduced-motion reads false (animate).
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    mount(CONCEPTS, EDGES, 'root', 'root'); // focus root (viewBox centre)
    fixture.componentRef.setInput('focusId', 'num'); // re-focus a child
    fixture.detectChanges();

    // No frame has run yet → the lens still sits on root, so root is the biggest,
    // NOT 'num'. (The old snap bug would have 'num' already centred + magnified.)
    expect(scaleOf(node('root'))).toBeGreaterThan(scaleOf(node('num')));

    // Run the tween to completion → 'num' is now the centred, magnified focus.
    now = 1000 + REFOCUS_MS;
    frames.splice(0).forEach((cb) => cb(now));
    fixture.detectChanges();
    // num is now the CENTRED focus (root: its parent: is the pushed-out
    // landmass, so it is no longer the centred node; size is asserted elsewhere).
    const [nx, ny] = translateOf(node('num'));
    expect(nx).toBeCloseTo(500, 0);
    expect(ny).toBeCloseTo(292, 0);
  });

  it('GLIDES linearly: the timing-midpoint frame is the geometric midpoint (constant speed)', () => {
    // The glide lerps directly between two settled layouts, so at the timing
    // midpoint (easeMostlyLinear(0.5) = 0.5) a moving node sits at the exact
    // geometric midpoint of its start → settled: a straight, constant-speed
    // path, NOT the fisheye-curved, front-loaded motion of a per-frame re-distort
    // (owner 2026-07-16: "truly flat glide").
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    mount(CONCEPTS, EDGES, 'root', 'root');
    fixture.componentRef.setInput('focusId', 'num');
    fixture.detectChanges();
    const [sx, sy] = translateOf(node('num')); // glide START (progress 0)

    // Advance to the TIMING midpoint of the glide.
    now = 1000 + REFOCUS_MS * 0.5;
    frames.splice(0).forEach((cb) => cb(now));
    fixture.detectChanges();
    const [mx, my] = translateOf(node('num')); // settled = the viewBox centre
    expect(mx).toBeCloseTo((sx + 500) / 2, 0);
    expect(my).toBeCloseTo((sy + 292) / 2, 0);
  });

  it('GLIDES a clicked parent FROM its landmass size (scale transitions, no jump)', () => {
    // root → mid → leaf; focus leaf so 'mid' is the PARENT_SCALE landmass. Click
    // mid: the glide must START from mid's on-screen landmass size, then lerp to
    // the focus size: it does NOT jump (owner 2026-07-16: `lastPositions` starts
    // the glide from where mid VISUALLY is, not a fresh distort that already
    // treats mid as the new focus and mis-scales frame 0).
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const nodes = [concept('root', 'R'), concept('mid', 'M'), concept('leaf', 'L')];
    const edges = [edge('e1', 'root', 'mid'), edge('e2', 'mid', 'leaf')];
    mount(nodes, edges, 'leaf', 'root'); // leaf focal → mid is the landmass (cached)
    expect(scaleOf(node('mid'))).toBeCloseTo(PARENT_SCALE, 1);

    fixture.componentRef.setInput('focusId', 'mid'); // click the parent
    fixture.detectChanges();
    // Glide START (no frame yet): mid is STILL its landmass size, not focus size.
    expect(scaleOf(node('mid'))).toBeCloseTo(PARENT_SCALE, 1);

    // Run to completion: mid is now the focus: strictly SMALLER than the landmass
    // (it shrank across the glide instead of snapping there at frame 0).
    now = 1000 + REFOCUS_MS;
    frames.splice(0).forEach((cb) => cb(now));
    fixture.detectChanges();
    expect(scaleOf(node('mid'))).toBeLessThan(PARENT_SCALE);
  });

  it('emits settled after the lens re-focus resolves (snap under reduced motion)', () => {
    // jsdom has no matchMedia → reduced-motion → the lens snaps and settles
    // synchronously, so this is deterministic.
    let settled = 0;
    fixture.componentRef.setInput('concepts', CONCEPTS);
    fixture.componentRef.setInput('edges', EDGES);
    fixture.componentRef.setInput('focusId', 'root');
    fixture.componentRef.setInput('rootId', 'root');
    component.settled.subscribe(() => (settled += 1));
    fixture.detectChanges(); // initial → snap + settle
    expect(settled).toBeGreaterThanOrEqual(1);

    fixture.componentRef.setInput('focusId', 'num'); // move the lens
    fixture.detectChanges();
    expect(settled).toBeGreaterThanOrEqual(2);
  });

  it('emits makeRoot for a non-root focus and disables it for the root', () => {
    mount(CONCEPTS, EDGES, 'num', 'root'); // focus a non-root
    let fired = 0;
    component.makeRoot.subscribe(() => (fired += 1));
    element.querySelector<HTMLButtonElement>('[data-testid="concept-lens-make-root"]')?.click();
    expect(fired).toBe(1);

    // Re-mount focused on the root: the control disables + no emit.
    mount(CONCEPTS, EDGES, 'root', 'root');
    const btn = element.querySelector<HTMLButtonElement>('[data-testid="concept-lens-make-root"]');
    expect(btn?.disabled).toBe(true);
    component.onMakeRoot();
    expect(fired).toBe(1); // unchanged
  });

  it('shows the lonely hint for a single-concept map', () => {
    mount([concept('root', 'Alone')], [], 'root', 'root');
    expect(element.querySelector('[data-testid="concept-lens-lonely"]')).toBeTruthy();
  });

  it('has no critical/serious accessibility violations', async () => {
    mount();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ── Always-on campaign overlay (WS-C7, ADR-227 D15) ─────────────────
  // Campaign chrome (fort ring / rung-pips / cooling frost / march standard /
  // held badge) renders in EVERY lens and COMPOSES with the existing lens paint
  // (campaign = border/chrome, lens = fill). Every state is conveyed icon+text
  // via the node aria-label: never colour alone.
  describe('campaign overlay', () => {
    it('renders NO campaign chrome when the map has no campaign block', () => {
      mount(); // campaign input defaults to null
      expect(element.querySelector('.lens-pips')).toBeNull();
      expect(element.querySelector('.lens-hex-fort')).toBeNull();
      expect(element.querySelector('.lens-banner')).toBeNull();
      expect(element.querySelector('.lens-frost')).toBeNull();
      expect(element.querySelector('.lens-march')).toBeNull();
    });

    it('paints a province: fort ring + banner + held-count badge over won descendants', () => {
      mount();
      // root won, with two won children (num, den) and one unwon (ratio) → 2 held.
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          nodes: {
            root: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
            num: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
            den: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
          },
        }),
      );
      fixture.detectChanges();
      const rootG = node('root');
      expect(rootG?.classList.contains('lens-node--province')).toBe(true);
      expect(rootG?.querySelector('.lens-hex-fort')).toBeTruthy();
      expect(rootG?.querySelector('.lens-banner')).toBeTruthy();
      expect(rootG?.querySelector('.lens-held__num')?.textContent?.trim()).toBe('2');
      const aria = rootG?.getAttribute('aria-label') ?? '';
      expect(aria).toContain('campaign_state_province');
      expect(aria).toContain('campaign_held_count');
    });

    it('omits the held badge for a province with no won descendants', () => {
      mount();
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          nodes: {
            ratio: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
          },
        }),
      );
      fixture.detectChanges();
      expect(node('ratio')?.querySelector('.lens-hex-fort')).toBeTruthy();
      expect(node('ratio')?.querySelector('.lens-held__num')).toBeNull();
    });

    it('shows the rung-pip ladder on a climbing node (rungsCleared filled of 6)', () => {
      mount();
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({ nodes: { num: campaignState({ rungsCleared: 3 }) } }),
      );
      fixture.detectChanges();
      expect(node('num')?.classList.contains('lens-node--climbing')).toBe(true);
      expect(node('num')?.querySelectorAll('.lens-pip').length).toBe(6);
      expect(node('num')?.querySelectorAll('.lens-pip--filled').length).toBe(3);
      expect(node('num')?.getAttribute('aria-label')).toContain('campaign_state_climbing');
    });

    it('flags a cooling node with a frost glyph + cooling text (never colour alone)', () => {
      mount();
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          nodes: { den: campaignState({ rungsCleared: 2, cooling: true }) },
        }),
      );
      fixture.detectChanges();
      expect(node('den')?.classList.contains('lens-node--cooling')).toBe(true);
      expect(node('den')?.querySelector('.lens-frost')).toBeTruthy();
      // Still a climbing ladder underneath the frost.
      expect(node('den')?.querySelectorAll('.lens-pip').length).toBe(6);
      expect(node('den')?.getAttribute('aria-label')).toContain('campaign_cooling');
    });

    it('marks an unstarted frontier node (absent row): frontier class, no pips', () => {
      mount();
      fixture.componentRef.setInput('campaign', mapCampaign({ nodes: {} }));
      fixture.detectChanges();
      expect(node('ratio')?.classList.contains('lens-node--frontier')).toBe(true);
      expect(node('ratio')?.querySelector('.lens-pip')).toBeNull();
      expect(node('ratio')?.getAttribute('aria-label')).toContain('campaign_state_frontier');
    });

    it('plants the march standard on the campaign focus node only', () => {
      mount();
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          focusConceptId: 'num',
          nodes: { num: campaignState({ rungsCleared: 1 }) },
        }),
      );
      fixture.detectChanges();
      expect(node('num')?.classList.contains('lens-node--march')).toBe(true);
      expect(node('num')?.querySelector('.lens-march')).toBeTruthy();
      expect(node('den')?.querySelector('.lens-march')).toBeNull();
      expect(node('num')?.getAttribute('aria-label')).toContain('campaign_focus_marker');
    });

    it('is always-on: campaign chrome composes with the lens paint fill', () => {
      // Province + mastered under the Mastery lens → mastered FILL and province
      // fort ring both render (fill = lens paint, chrome = campaign overlay).
      const nodes = [
        concept('root', 'Fractions'),
        concept('num', 'Numerator', { mastered: true }),
        concept('den', 'Common Denominator'),
        concept('ratio', 'Ratio'),
      ];
      fixture.componentRef.setInput('concepts', nodes);
      fixture.componentRef.setInput('edges', EDGES);
      fixture.componentRef.setInput('focusId', 'root');
      fixture.componentRef.setInput('rootId', 'root');
      fixture.componentRef.setInput('lens', 'mastery');
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          nodes: {
            num: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
          },
        }),
      );
      fixture.detectChanges();
      expect(node('num')?.classList.contains('lens-node--mastered')).toBe(true);
      expect(node('num')?.querySelector('.lens-hex-fort')).toBeTruthy();
    });

    it('shrinks a long province label so it clears the fort wall (bug #20)', () => {
      // 'den' = "Common Denominator" fills the outer hex (base scale). Winning it
      // draws the fortified inner wall; the label must shrink to clear that ring.
      mount();
      const baseScale = scaleOf(node('den')?.querySelector('.lens-label') ?? null);
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          nodes: {
            den: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
          },
        }),
      );
      fixture.detectChanges();
      // It IS a province (the wall renders)…
      expect(node('den')?.querySelector('.lens-hex-fort')).toBeTruthy();
      // …and its label shrank below the outer-hex fit to clear the wall.
      expect(scaleOf(node('den')?.querySelector('.lens-label') ?? null)).toBeLessThan(baseScale);
    });
  });

  // ── Fog ghosts (face-down pending suggestions fanned around their focal) ──
  describe('fog ghosts', () => {
    it('fans face-down ghosts around a focal node (clickable, ? glyph, title hidden)', () => {
      mount();
      fixture.componentRef.setInput('fogGhosts', [fogGhost('s1', 'num'), fogGhost('s2', 'num')]);
      fixture.detectChanges();
      const g1 = element.querySelector('[data-testid="lens-fog-ghost-s1"]');
      expect(g1).toBeTruthy();
      expect(g1?.getAttribute('role')).toBe('button');
      expect(g1?.getAttribute('tabindex')).toBe('0');
      expect(g1?.getAttribute('aria-label')).toContain('campaign_state_fog');
      expect(g1?.querySelector('.lens-fog-ghost__glyph')?.textContent).toContain('?');
      // The suggestion title never leaks: it is fog.
      expect(g1?.textContent).not.toContain('Mystery');
      expect(element.querySelectorAll('[data-testid^="lens-fog-ghost-"]').length).toBe(2);
    });

    it('emits fogTap with the FOCAL conceptId on click and Enter/Space', () => {
      mount();
      fixture.componentRef.setInput('fogGhosts', [fogGhost('s1', 'den')]);
      fixture.detectChanges();
      const taps: string[] = [];
      component.fogTap.subscribe((id) => taps.push(id));
      const g = element.querySelector('[data-testid="lens-fog-ghost-s1"]');
      g?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      g?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      g?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(taps).toEqual(['den', 'den', 'den']);
    });

    it('drops off-map focal ghosts and caps at 6 ghosts per focal node', () => {
      mount();
      const many = Array.from({ length: 9 }, (_, i) => fogGhost('m' + i, 'num'));
      fixture.componentRef.setInput('fogGhosts', [...many, fogGhost('off', 'not-on-this-map')]);
      fixture.detectChanges();
      // 'num' has NO claimed children (only its parent 'root', which keeps no
      // child slot) → all six hex slots are free, so the fan caps at six; the
      // excess + the off-map focal drop.
      expect(element.querySelectorAll('[data-testid^="lens-fog-ghost-m"]').length).toBe(6);
      expect(element.querySelector('[data-testid="lens-fog-ghost-off"]')).toBeNull();
    });

    it('skips the hex slot a claimed child occupies (fog never hides a child)', () => {
      // root → num → kid: focus fog on 'num', which has ONE claimed child (kid).
      const nodes = [
        concept('root', 'Fractions'),
        concept('num', 'Numerator'),
        concept('kid', 'Sub-idea'),
      ];
      const edges = [edge('e1', 'root', 'num'), edge('e2', 'num', 'kid')];
      mount(nodes, edges, 'num'); // focus num
      const many = Array.from({ length: 6 }, (_, i) => fogGhost('g' + i, 'num'));
      fixture.componentRef.setInput('fogGhosts', many);
      fixture.detectChanges();
      // one child slot is taken → at most five ghosts fan around num, none over
      // the claimed child hex (the parent 'root' keeps no slot).
      expect(element.querySelectorAll('[data-testid^="lens-fog-ghost-g"]').length).toBe(5);
    });

    it('dims the focus PARENT so a child fanned in its direction is not blocked', () => {
      mount(CONCEPTS, EDGES, 'num'); // focus num; its hierarchy parent is root
      expect(node('root')?.classList.contains('lens-node--dimmed')).toBe(true);
      // the focus is never dimmed; a sibling (not the parent) is not dimmed.
      expect(node('num')?.classList.contains('lens-node--dimmed')).toBe(false);
      expect(node('den')?.classList.contains('lens-node--dimmed')).toBe(false);
    });

    it('makes fog ghosts non-interactive while loading (tabindex -1)', () => {
      mount();
      fixture.componentRef.setInput('fogGhosts', [fogGhost('s1', 'num')]);
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="lens-fog-ghost-s1"]')?.getAttribute('tabindex'),
      ).toBe('-1');
    });

    it('has no critical/serious a11y violations with campaign chrome + fog ghosts', async () => {
      mount();
      fixture.componentRef.setInput(
        'campaign',
        mapCampaign({
          focusConceptId: 'num',
          nodes: {
            root: campaignState({ rungsCleared: 6, wonAt: '2026-07-10T00:00:00Z' }),
            num: campaignState({ rungsCleared: 3 }),
            den: campaignState({ rungsCleared: 2, cooling: true }),
          },
        }),
      );
      fixture.componentRef.setInput('fogGhosts', [fogGhost('s1', 'num'), fogGhost('s2', 'num')]);
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});
