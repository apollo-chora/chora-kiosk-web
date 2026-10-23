import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { HEX_R, LENS_CX, LENS_CY, buildLensLayout } from '../../aplus/my-knowledge/concept-lens-map/concept-lens';
import type { MapGraph } from '../../aplus/my-knowledge/maps.model';
import { suggRow, type SuggRow } from '../../shared/sugg/sugg-rows.component';
import type { Decided } from '../../shared/sugg/visit-decisions';

/** The three regions' centres on the atlas's 1600 by 637 drawing (mockup ATLAS cx): equal regions (K36). */
export const ATLAS_CX = [330, 800, 1270] as const;
/** The minis' scale about a region's centre, and the drawing's centre line (mockup atlasHTML). */
const MINI_SCALE = 0.44;
const MINI_CY = 286;
/** No two minis closer than this (mockup LENS.R * 0.26 * 1.85: a mini is the lens's hex at 0.26). */
export const MINI_MIN = HEX_R * 0.26 * 1.85;

export interface MiniPoint {
  readonly id: string;
  x: number;
  y: number;
}

export interface Mini {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** r: the map's root; f: a won hex; '' otherwise (the mockup's mini classes). */
  readonly cls: 'r' | 'f' | '';
}

/** A region's line under its minis (maps.count): the map's concepts and its won hexes. */
export function regionCounts(map: MapGraph): { readonly n: number; readonly won: number } {
  return { n: map.concepts.length, won: Object.values(map.campaign?.nodes ?? {}).filter((s) => !!s.wonAt).length };
}

/**
 * A region's concepts as small hexes (mockup atlasHTML): production's lens layout, scaled about the
 * region's centre, then spread so none overlap. In the read's concept order.
 */
export function regionMinis(map: MapGraph, cx: number): readonly Mini[] {
  const layout = buildLensLayout(map.concepts, map.edges, map.rootConceptId);
  const at = new Map(layout.nodes.map((n) => [n.conceptId, n]));
  const pts: MiniPoint[] = map.concepts.flatMap((c) => {
    const n = at.get(c.conceptId);
    return n ? [{ id: c.conceptId, x: cx + (n.x - LENS_CX) * MINI_SCALE, y: MINI_CY + (n.y - LENS_CY) * MINI_SCALE }] : [];
  });
  const root = layout.rootId;
  return spreadMinis(pts, MINI_MIN).map((p) => ({ id: p.id, x: p.x, y: p.y, cls: p.id === root ? 'r' : map.campaign?.nodes[p.id]?.wonAt ? 'f' : '' }));
}

/** Pushes apart any two points closer than `min` (mockup spreadMinis), in place; returns them. */
export function spreadMinis<T extends MiniPoint>(pts: T[], min: number): T[] {
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min) {
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          moved = true;
        }
      }
    if (!moved) break;
  }
  return pts;
}

/**
 * A prepared batch's rows in its order (mockup suggListHTML, K42): a waiting idea from the pending
 * read ("already on your map" when its title is on the map), a decided one as this visit left it.
 * An idea neither waiting nor decided this visit was decided before the visit and is not shown, and
 * a link is no row (K189 (2): the lists show ideas only).
 */
export function batchRows(ids: readonly string[], pending: readonly ConceptSuggestion[], decided: ReadonlyMap<string, Decided>, map: MapGraph): readonly SuggRow[] {
  const waiting = new Map(pending.map((s) => [s.suggestionId, s]));
  return ids.flatMap((id) => {
    const d = decided.get(id);
    if (d) return suggRow(d.suggestion, d.state, map) ?? [];
    const s = waiting.get(id);
    if (!s) return [];
    return suggRow(s, null, map) ?? [];
  });
}
