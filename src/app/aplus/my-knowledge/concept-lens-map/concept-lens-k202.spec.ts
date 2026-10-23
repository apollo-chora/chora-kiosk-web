import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import hawker from '../../../../../dev/fixtures/world/map-hawker-graph.json';
import nature from '../../../../../dev/fixtures/world/map-nature-graph.json';
import water from '../../../../../dev/fixtures/world/map-water-graph.json';
import { COMP_LENS_FRAME, HOOK_LENS_FRAME, MAP_LENS_CHROME, MAP_LENS_FRAME, type LensFrame } from '../../../shared/lens-frames';
import type { ConceptEdge, ConceptNode } from '../../discovery-graph/concept-graph.model';
import { HEX_R, LAYOUT_RING, LENS_CX, LENS_CY, LENS_VIEWBOX_H, buildLensLayout } from './concept-lens';
import { ConceptLensMapComponent } from './concept-lens-map.component';

// K202 (W86, the owner's walk of 22 Oct): "The distance between nodes is too short to see the line-links.
// It is ok for the edges to overflow beyond the screen." So the map keeps a fixed distance between linked
// ideas, every link showing at least about 40 px of line on the 1366 screen, and no longer shrinks to fit;
// only the picked idea and its own ring (its children) must stay inside the frame. Checked on every map the
// walk and the e2e serve (the seeded maps and each map after an accept), with every idea picked in turn,
// in each frame that shows production's lens, with the drawer shut and open.

interface Graph {
  readonly rootConceptId: string;
  readonly concepts: readonly ConceptNode[];
  readonly edges: readonly ConceptEdge[];
}
interface Fixture {
  readonly body: Graph;
  readonly variants?: readonly { readonly body: Graph }[];
}
const FIXTURES = { water, nature, hawker } as unknown as Record<string, Fixture>;
const MAPS = Object.entries(FIXTURES).flatMap(([name, f]) =>
  [f.body, ...(f.variants ?? []).map((v) => v.body)].map((g, i) => ({ name: i === 0 ? name : `${name} variant ${i}`, g })),
);
const FRAMES: Record<string, LensFrame> = { atlas: MAP_LENS_FRAME, companions: COMP_LENS_FRAME, hook: HOOK_LENS_FRAME };

/** The showroom's screen: the 1600 stage drawn at 1366 (K2). */
const AT_1366 = 1366 / 1600;
/** The shortest link the owner can see, in screen px at 1366 (K202). */
const MIN_LINK_PX = 40;

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function placed(el: Element): Placed {
  const m = /translate\(([-\d.]+)\s+([-\d.]+)\)\s+scale\(([\d.]+)\)/.exec(el.getAttribute('transform') ?? '');
  if (!m) throw new Error(`no transform on ${el.getAttribute('data-testid')}`);
  return { x: +m[1], y: +m[2], z: +m[3] };
}

/** The drawn length of a link (lens units): renderEdges draws a straight quadratic between the hex edges. */
function linkLength(d: string): number {
  const m = /M ([-\d.]+) ([-\d.]+) Q [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/.exec(d);
  if (!m) throw new Error(`unreadable link ${d}`);
  return Math.hypot(+m[3] - +m[1], +m[4] - +m[2]);
}

describe('K202: a fixed distance between linked ideas, the picked idea and its ring inside the frame', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConceptLensMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    }).compileComponents();
  });

  function render(g: Graph, focusId: string, frame: LensFrame, shiftX: number, chrome = frame === MAP_LENS_FRAME ? MAP_LENS_CHROME : null): HTMLElement {
    const fixture = TestBed.createComponent(ConceptLensMapComponent);
    fixture.componentRef.setInput('chrome', chrome);
    fixture.componentRef.setInput('frameHalfY', frame.halfY);
    fixture.componentRef.setInput('concepts', g.concepts);
    fixture.componentRef.setInput('edges', g.edges);
    fixture.componentRef.setInput('focusId', focusId);
    fixture.componentRef.setInput('rootId', g.rootConceptId);
    fixture.componentRef.setInput('frameHalfX', frame.halfX);
    fixture.componentRef.setInput('shiftX', shiftX);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lays the map out a fixed ring apart per level, never shrunk to fit (no fit radius)', () => {
    const c = (id: string): ConceptNode => ({ conceptId: id, title: id, atomRefs: [] });
    const h = (s: string, t: string): ConceptEdge => ({ edgeId: `${s}-${t}`, sourceConceptId: s, targetConceptId: t, class: 'hierarchy', provenance: 'learner_authored' });
    const l = buildLensLayout([c('root'), c('a'), c('b'), c('d')], [h('root', 'a'), h('a', 'b'), h('b', 'd')], 'root');
    const r = (id: string) => {
      const n = l.nodes.find((x) => x.conceptId === id)!;
      return Math.hypot(n.x - LENS_CX, n.y - LENS_CY);
    };
    expect(r('a')).toBeCloseTo(LAYOUT_RING, 6);
    expect(r('b')).toBeCloseTo(2 * LAYOUT_RING, 6);
    expect(r('d')).toBeCloseTo(3 * LAYOUT_RING, 6);
  });

  for (const [where, frame] of Object.entries(FRAMES)) {
    it(`${where}: on every map, with each idea picked and the drawer shut or open, every link is drawn at 40 px or more at 1366`, () => {
      const short: string[] = [];
      let links = 0;
      for (const { name, g } of MAPS) {
        for (const pick of g.concepts) {
          for (const shiftX of [0, frame.drawerShift]) {
            const el = render(g, pick.conceptId, frame, shiftX);
            const paths = [...el.querySelectorAll('path.lens-edge')];
            // The overlap guard draws no line between touching hexes, so a missing link is a short one.
            if (paths.length !== g.edges.length) short.push(`${name} @${pick.title} shift ${shiftX}: ${paths.length} of ${g.edges.length} links drawn`);
            for (const p of paths) {
              links += 1;
              const px = linkLength(p.getAttribute('d') ?? '') * frame.scale * AT_1366;
              if (px < MIN_LINK_PX) short.push(`${name} @${pick.title} shift ${shiftX}: a link of ${px.toFixed(1)} px`);
            }
          }
        }
      }
      expect(links).toBeGreaterThan(100);
      expect(short).toEqual([]);
    });

    it(`${where}: the picked idea and its ring stay inside the frame (the strip left of the drawer when it is open), and the ring is marked`, () => {
      const outside: string[] = [];
      for (const { name, g } of MAPS) {
        for (const pick of g.concepts) {
          const ring = new Set(g.edges.filter((e) => e.class === 'hierarchy' && e.sourceConceptId === pick.conceptId).map((e) => e.targetConceptId));
          for (const shiftX of [0, frame.drawerShift]) {
            const el = render(g, pick.conceptId, frame, shiftX);
            const marked = [...el.querySelectorAll('g.lens-node--ring')].map((n) => (n.getAttribute('data-testid') ?? '').replace('concept-lens-node-', ''));
            expect(new Set(marked), `${name} @${pick.title}`).toEqual(ring);
            for (const id of [pick.conceptId, ...ring]) {
              const n = el.querySelector(`[data-testid="concept-lens-node-${id}"]`);
              if (!n) throw new Error(`${name}: ${id} not drawn`);
              const p = placed(n);
              // A flat-top hex: half its width is HEX_R, half its height 0.9 HEX_R (roundedHexPath), times z.
              // The whole map is translated by shiftX, so the strip is the box's half-width less the shift.
              const left = p.x - HEX_R * p.z + shiftX - (LENS_CX - frame.halfX);
              const right = LENS_CX + frame.halfX + Math.min(0, 2 * shiftX) - (p.x + HEX_R * p.z + shiftX);
              const top = p.y - 0.9 * HEX_R * p.z - (LENS_VIEWBOX_H / 2 - frame.halfY);
              const bottom = LENS_VIEWBOX_H / 2 + frame.halfY - (p.y + 0.9 * HEX_R * p.z);
              if (Math.min(left, right, top, bottom) < -0.5) outside.push(`${name} @${pick.title} shift ${shiftX}: ${id} by ${Math.min(left, right, top, bottom).toFixed(1)}`);
            }
          }
        }
      }
      expect(outside).toEqual([]);
    });
  }

  it('the atlas: the picked idea and its ring stay clear of the caption card under the tabs (K204), on every map, drawer shut or open', () => {
    // The card covers the box's top-left corner, MAP_LENS_CHROME lens px across and down; it stays put on
    // screen while the map moves by shiftX.
    const under: string[] = [];
    for (const { name, g } of MAPS) {
      for (const pick of g.concepts) {
        const ring = g.edges.filter((e) => e.class === 'hierarchy' && e.sourceConceptId === pick.conceptId).map((e) => e.targetConceptId);
        for (const shiftX of [0, MAP_LENS_FRAME.drawerShift]) {
          const el = render(g, pick.conceptId, MAP_LENS_FRAME, shiftX);
          for (const id of [pick.conceptId, ...ring]) {
            const p = placed(el.querySelector(`[data-testid="concept-lens-node-${id}"]`)!);
            const x = p.x + shiftX - (LENS_CX - MAP_LENS_FRAME.halfX);
            const y = p.y - (LENS_VIEWBOX_H / 2 - MAP_LENS_FRAME.halfY);
            const clear = x - HEX_R * p.z >= MAP_LENS_CHROME.w || y - 0.9 * HEX_R * p.z >= MAP_LENS_CHROME.h;
            if (!clear) under.push(`${name} @${pick.title} shift ${shiftX}: ${id}`);
          }
        }
      }
    }
    expect(under).toEqual([]);
  });

  it('the atlas: opening the drawer moves the map, and the strip it leaves never shrinks it (wide enough for the ring)', () => {
    // The frame's width alone (no caption card): the card's own zoom is the test above's.
    const g = MAPS[0].g;
    const kid = g.edges.find((e) => e.sourceConceptId === g.rootConceptId)!.targetConceptId;
    const gap = (shiftX: number) => {
      const el = render(g, g.rootConceptId, MAP_LENS_FRAME, shiftX, null);
      const a = placed(el.querySelector(`[data-testid="concept-lens-node-${g.rootConceptId}"]`)!);
      const b = placed(el.querySelector(`[data-testid="concept-lens-node-${kid}"]`)!);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(gap(MAP_LENS_FRAME.drawerShift)).toBeCloseTo(gap(0), 6);
  });
});
