/**
 * Concept fisheye-LENS geometry (A+ "My Knowledge", owner-approved 2026-07-03).
 *
 * Pure, framework-free geometry for the graph fisheye lens: the WHOLE map on one
 * bounded canvas, a lens magnifying the focus + its neighbourhood while the
 * periphery shrinks but never vanishes (focus+context / DOI-tree principle:
 * "nodes translate, never disappear"; no pan/zoom). Ported from the owner-walked
 * prototype `nav-option3-themes.html` (Theme 1, "Indigo Monochrome").
 *
 * Fully unit-tested; the presentational `ConceptLensMapComponent` renders whatever
 * this produces and drives the re-focus with `fisheyeDistort` per animation frame.
 */
import type {
  ConceptEdge,
  ConceptNode,
} from '../../discovery-graph/concept-graph.model';
import type { CampaignNodeState } from '../campaign.model';

// ── Fixed scene geometry (the lens draws into a constant viewBox; the SVG
//    scales responsively via preserveAspectRatio, so no pan/zoom is needed) ──
export const LENS_VIEWBOX_W = 1000;
export const LENS_VIEWBOX_H = 585;
export const LENS_CX = 500;
export const LENS_CY = 292;

/**
 * Radial ring step (viewBox px) between hierarchy depths. KIOSK (K202): a FIXED distance per level;
 * the map is no longer shrunk until its furthest idea fits a circle (the old LAYOUT_FIT_RADIUS of
 * 234), which on a map three levels deep left neighbours touching and every link hidden. Ideas past
 * the picked one's ring may now run off the frame (the owner: "It is ok for the edges to overflow").
 */
export const LAYOUT_RING = 154;

/**
 * KIOSK (K202): the shortest link drawn between two linked ideas (viewBox px, hex edge to hex edge, as
 * renderEdges trims it). The owner's floor is about 40 px of line on the 1366 screen; the smallest lens
 * on it is the Companions map (483 of 585 lens px per stage px, the stage drawn at 1366/1600), where 40
 * px is 40 / (1366/1600) / (483/585) = 56.7 lens px. The atlas draws the same 57 at 48.7 px.
 */
export const LINK_MIN = 57;

/**
 * The focus's PARENT renders as a large "landmass" placed a FIXED distance out
 * in the parent's direction: a big, dimmed, easy tap-target the frame
 * deliberately CLIPS at the edge (owner 2026-07-16). PARENT_DIST is that distance
 * (viewBox px from the focus centre); it is tuned so a substantial slice of the
 * PARENT_SCALE-sized hex stays inside the frame (a big click surface) while the
 * rest clips. PARENT_SCALE is its render scale (bigger than the focus: but
 * clipped, so it never competes for focus). The focus + its six children own the
 * fitted, un-clipped frame.
 *
 * DEEPER ancestors (grandparent, …) recede in the SAME direction as a stack:
 * each level is pushed a further `PARENT_DEPTH_STEP` out (so a grandparent sits
 * BELOW/behind the parent, clipped by the frame rather than floating on top of
 * it) and scaled down by `PARENT_DEPTH_DECAY` per level (perspective recede).
 * The frame is free to clip a deep ancestor entirely: we never force it inside
 * (owner 2026-07-16).
 */
export const PARENT_DIST = 340;
export const PARENT_SCALE = 3.0;
export const PARENT_DEPTH_STEP = 260;
export const PARENT_DEPTH_DECAY = 0.85;

/** Rounded flat-top hex: circum-radius + corner radius. */
export const HEX_R = 47;
export const HEX_CORNER = 12;

/** Render scale of the ancestor `d` levels above the focus (1 = parent). */
export function landmassScale(d: number): number {
  return PARENT_SCALE * Math.pow(PARENT_DEPTH_DECAY, d - 1);
}

/**
 * Distance from the lens centre to the ancestor `d` levels up.
 *
 * The tuned `PARENT_DEPTH_STEP` is a MINIMUM, not the answer: two consecutive
 * tiers must also be far enough apart that their RENDERED hexes cannot touch.
 * At d=1/d=2 the tuned 260 is smaller than the clearance those scales need
 * (47 * (3.0 + 2.55) = 260.85), so the receding stack overlapped ITSELF by
 * about a pixel. That is invisible as a gap yet fatal downstream: renderEdges
 * trims each connector to the hex edge, so overlapping centres invert the
 * segment and the connector renders as a stub pointing the wrong way.
 *
 * Deriving the step keeps the owner's tuning wherever it is already sufficient
 * and expands ONLY where geometry demands, so re-tuning PARENT_SCALE or HEX_R
 * can no longer silently reintroduce the overlap.
 */
export function landmassDist(d: number): number {
  let dist = PARENT_DIST;
  for (let tier = 1; tier < d; tier++) {
    // KIOSK (K202): touching is not enough; the tiers' link must show, LINK_MIN of line between them.
    const clearance = HEX_R * (landmassScale(tier) + landmassScale(tier + 1)) + LINK_MIN;
    dist += Math.max(PARENT_DEPTH_STEP, clearance);
  }
  return dist;
}

/** Breathing room on top of bare touching for a rider's first push off its ancestor (relaxOverlaps
 *  then gives the rider's link its LINK_MIN, K202). */
export const LANDMASS_TIER_MARGIN = 1.08;

/** Six flat-top hex-ring slots for fanning fog ghosts around a focal node. */
export const FOG_SLOT_COUNT = 6;
const FOG_SLOT_STEP = Math.PI / 3; // 60° between adjacent slots

/** Angle (radians) of fog hex-ring slot `k`, measured clockwise from straight up. */
export function fogSlotAngle(slot: number): number {
  return -Math.PI / 2 + slot * FOG_SLOT_STEP;
}

/**
 * The hex-ring slots (0..5, ring order) NOT already taken by an occupant's
 * direction: so a face-down fog ghost is never fanned on top of a live sibling.
 * Each occupant (a CLAIMED CHILD of the focal: the caller passes children only,
 * never the parent) is snapped to its nearest of the six 60° slots and excluded.
 * (SVG y grows downward, so a child ABOVE the focal: it radiates away from the
 * parent: maps to the top slot 0, exactly where the old fixed top-start fan drew
 * its first ghost, landing it under the claimed child.)
 */
export function freeFogSlots(
  focal: { readonly x: number; readonly y: number },
  occupants: readonly { readonly x: number; readonly y: number }[],
): number[] {
  const occupied = new Set<number>();
  for (const n of occupants) {
    const a = Math.atan2(n.y - focal.y, n.x - focal.x);
    const raw = Math.round((a + Math.PI / 2) / FOG_SLOT_STEP);
    occupied.add(((raw % FOG_SLOT_COUNT) + FOG_SLOT_COUNT) % FOG_SLOT_COUNT);
  }
  const free: number[] = [];
  for (let k = 0; k < FOG_SLOT_COUNT; k++) {
    if (!occupied.has(k)) free.push(k);
  }
  return free;
}

/** d3-fisheye circular distortion: lens reach + magnification strength. */
export const LENS_RADIUS = 310;
export const LENS_DISTORT = 3.2;

/**
 * Fisheye scale clamps: the focus is as BIG as possible, the periphery small
 * (partially clipped is fine, owner 2026-07-03). Z spans MAX→MIN across the lens
 * radius so distant nodes shrink markedly while the focus dominates.
 */
export const LENS_Z_MIN = 0.5;
export const LENS_Z_MAX = 1.9;

/** Re-focus ease duration (ms): matches the owner's reveal easing. */
export const REFOCUS_MS = 560;

/** Label wrap width (chars) before spilling to a 2nd line. */
export const LABEL_MAX = 12;

/**
 * Fit-to-hex label sizing (2026-07-05). A line up to LABEL_MAX chars renders at
 * full size; a longer line shrinks (down to LABEL_MIN_SCALE) so it still fits
 * the hex instead of spilling: the full title stays available on hover
 * (`<title>`) + in the drawer. LABEL_HARD_CAP is the longest a line may be after
 * ellipsis, chosen so the shrink never drops below the floor
 * (LABEL_MAX / LABEL_MIN_SCALE): past it we ellipsize rather than shrink more.
 */
export const LABEL_MIN_SCALE = 0.7;
export const LABEL_HARD_CAP = Math.floor(LABEL_MAX / LABEL_MIN_SCALE);

/** Neutral slate-grey for node shadows: NEVER indigo (owner's refinement). */
export const SHADOW_GREY = '44,47,58';

/**
 * Neighbourhood-fit padding (owner 2026-07-04: "the selected node AND the whole
 * immediate ring must be visible"). `FIT_EDGE_PAD` is the viewBox gap kept clear
 * at the frame edge; `FIT_NODE_MARGIN` is the extra clearance around each node
 * (its label + shadow can spill past the hex).
 */
export const FIT_EDGE_PAD = 8;
export const FIT_NODE_MARGIN = 12;

/** One concept's base (pre-distortion) position in the fixed viewBox. */
export interface LensNodeBase {
  readonly conceptId: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

/** The base radial layout of a whole map + its resolved root. */
export interface LensLayout {
  readonly rootId: string | null;
  readonly nodes: readonly LensNodeBase[];
}

/** A point after the fisheye distortion: screen position + scale `z`. */
export interface FisheyePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Lay out EVERY concept on the fixed viewBox as a radial hierarchy tree rooted at
 * the map root: the root sits at centre, hierarchy children radiate outward by
 * depth, `LAYOUT_RING` apart per level (KIOSK K202: never rescaled to fit the
 * frame). Disconnected / non-hierarchy-reachable concepts are placed
 * on an outer ring so they are NEVER hidden (fail-loud: no node is ever dropped).
 * Cycle-safe (visited set). Returns an empty layout for no concepts.
 *
 * `explicitRootId` (the map's `Goal.RootConceptID`) wins when present; else the
 * root is the single hierarchy-parentless concept; else the first concept.
 */
export function buildLensLayout(
  concepts: readonly ConceptNode[],
  edges: readonly ConceptEdge[],
  explicitRootId?: string,
): LensLayout {
  if (concepts.length === 0) {
    return { rootId: null, nodes: [] };
  }
  const byId = new Map(concepts.map((c) => [c.conceptId, c]));

  // Hierarchy adjacency (source parent → target child); dedupe + guard the
  // dangling / self-loop cases (referential integrity).
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (e.class !== 'hierarchy') continue;
    const p = e.sourceConceptId;
    const c = e.targetConceptId;
    if (p === c) continue; // self-loop
    if (!byId.has(p) || !byId.has(c)) continue; // dangling edge
    const kids = children.get(p) ?? [];
    if (!kids.includes(c)) {
      kids.push(c);
      children.set(p, kids);
    }
    hasParent.add(c);
  }

  // Resolve the root: explicit → single parentless → first concept.
  let rootId: string;
  if (explicitRootId && byId.has(explicitRootId)) {
    rootId = explicitRootId;
  } else {
    const parentless = concepts.filter((c) => !hasParent.has(c.conceptId));
    rootId =
      parentless.length === 1 ? parentless[0].conceptId : concepts[0].conceptId;
  }

  const pos = new Map<string, { x: number; y: number; depth: number }>();
  const visited = new Set<string>();

  const assign = (id: string, ang: number, d: number): void => {
    if (visited.has(id)) return; // cycle-safe
    visited.add(id);
    pos.set(
      id,
      d === 0
        ? { x: LENS_CX, y: LENS_CY, depth: 0 }
        : {
            x: LENS_CX + d * LAYOUT_RING * Math.cos(ang),
            y: LENS_CY + d * LAYOUT_RING * Math.sin(ang),
            depth: d,
          },
    );
    const kids = (children.get(id) ?? []).filter((k) => !visited.has(k));
    if (kids.length === 0) return;
    // Root fans a full circle; deeper nodes fan a widening wedge centred on `ang`.
    const span =
      d === 0 ? Math.PI * 2 : Math.min(Math.PI * 1.2, 0.6 + kids.length * 0.4);
    kids.forEach((c, i) => {
      const ca =
        d === 0
          ? -Math.PI / 2 + i * ((Math.PI * 2) / kids.length)
          : ang - span / 2 + (span * (i + 0.5)) / kids.length;
      assign(c, ca, d + 1);
    });
  };
  assign(rootId, 0, 0);

  // Any concept not reachable via hierarchy from the root (disconnected island,
  // lateral-only, or an orphaned sub-tree) is placed on a ring one past the tree
  // so it is always on screen: never silently hidden.
  const maxDepth = Math.max(0, ...[...pos.values()].map((p) => p.depth));
  const orphans = concepts.filter((c) => !visited.has(c.conceptId));
  orphans.forEach((c, i) => {
    const ang =
      orphans.length === 1
        ? -Math.PI / 2
        : -Math.PI / 2 + i * ((Math.PI * 2) / orphans.length);
    const d = maxDepth + 1;
    pos.set(c.conceptId, {
      x: LENS_CX + d * LAYOUT_RING * Math.cos(ang),
      y: LENS_CY + d * LAYOUT_RING * Math.sin(ang),
      depth: d,
    });
    visited.add(c.conceptId);
  });

  const nodes: LensNodeBase[] = concepts.map((c) => {
    const p = pos.get(c.conceptId)!; // every concept was assigned above
    return { conceptId: c.conceptId, title: c.title, x: p.x, y: p.y, depth: p.depth };
  });

  return { rootId, nodes };
}

// d3-fisheye circular distortion constants (precomputed from LENS_RADIUS/DISTORT).
const K0 =
  (Math.exp(LENS_DISTORT) / (Math.exp(LENS_DISTORT) - 1)) * LENS_RADIUS;
const K1 = LENS_DISTORT / LENS_RADIUS;

/**
 * Distort a base point `(px,py)` around the lens centre `(fx,fy)`: magnifies +
 * spreads near the focus, compresses toward the edge, and returns the point plus
 * a scale `z` (focus big, periphery small-but-legible). Points at/over the lens
 * edge pass through unchanged. Pure.
 */
export function fisheyeDistort(
  px: number,
  py: number,
  fx: number,
  fy: number,
): FisheyePoint {
  const dx = px - fx;
  const dy = py - fy;
  const dd = Math.hypot(dx, dy);
  // Scale spans MAX→MIN linearly over the lens radius (focus big, edge small).
  const z = Math.max(
    LENS_Z_MIN,
    Math.min(
      LENS_Z_MAX,
      LENS_Z_MAX - (LENS_Z_MAX - LENS_Z_MIN) * (dd / LENS_RADIUS),
    ),
  );
  if (dd < 0.001 || dd >= LENS_RADIUS) {
    return { x: px, y: py, z };
  }
  const k = ((K0 * (1 - Math.exp(-dd * K1))) / dd) * 0.72 + 0.28;
  return { x: fx + dx * k, y: fy + dy * k, z };
}

/**
 * KIOSK (K202): the zoom (<= 1) applied to node offsets-from-centre AND to their sizes, so the focus and
 * its immediate ring (its hierarchy children) fit the available half-extents of the frame, each ring link
 * keeping LINK_MIN of line. It used to shrink the offsets alone, which shortened the links it was meant to
 * show (owner 2026-07-04 kept: "the selected node at the centre AND the whole immediate ring must be
 * visible"; owner 2026-10-22: "The distance between nodes is too short to see the line-links"); a zoom
 * shrinks the hexes with their gaps, and the link floor is counted in. `base` are the pre-distortion
 * positions of the focus and its ring; each is distorted around `focus`. For each ring child at rendered
 * distance D, size rc (the focus's rf), along an axis taking the share u of the direction, at zoom s:
 * its extent is u * max(s * D, s * (rf + rc) + LINK_MIN) + s * rc + FIT_NODE_MARGIN, which must not pass
 * the axis's half-extent; both arms of the max must fit, which gives s directly. Returns 1 when the ring
 * already fits: it never ENLARGES. The periphery beyond the ring may run off the frame. Pure.
 */
export function neighbourhoodZoom(
  base: readonly { readonly x: number; readonly y: number }[],
  focus: { readonly x: number; readonly y: number },
  availHalfX: number,
  availHalfY: number,
): number {
  const rf = HEX_R * fisheyeDistort(focus.x, focus.y, focus.x, focus.y).z;
  let s = Math.min(1, (availHalfX - FIT_NODE_MARGIN) / rf, (availHalfY - FIT_NODE_MARGIN) / rf);
  for (const b of base) {
    const p = fisheyeDistort(b.x, b.y, focus.x, focus.y);
    const d = Math.hypot(p.x - focus.x, p.y - focus.y);
    if (d < 0.001) continue; // the focus itself, counted above
    const rc = HEX_R * p.z;
    for (const [u, avail] of [
      [Math.abs(p.x - focus.x) / d, availHalfX],
      [Math.abs(p.y - focus.y) / d, availHalfY],
    ] as const) {
      const room = avail - FIT_NODE_MARGIN;
      s = Math.min(s, room / (u * d + rc), (room - u * LINK_MIN) / (u * (rf + rc) + rc));
    }
  }
  return Math.max(0, s);
}

/** KIOSK (K204): a rectangle in lens units, relative to the focus's centre as drawn. */
export interface LensRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * KIOSK (K204): the largest zoom, no more than `zoom`, at which no ring child's hex overlaps `card`, a fixed
 * card over the frame (the atlas's lens caption). Each ring child is placed as neighbourhoodZoom places it
 * (its rendered offset scaled, its link kept at LINK_MIN at least); a smaller zoom draws it nearer the
 * focus, out from under a card at the frame's edge. Found by bisection to 1/1000; a ring that cannot clear
 * even at half the zoom keeps the half (the floor, so a misplaced card can never shrink the map to nothing).
 * Pure.
 */
export function chromeClearZoom(
  base: readonly { readonly x: number; readonly y: number }[],
  focus: { readonly x: number; readonly y: number },
  zoom: number,
  card: LensRect,
): number {
  const zf = fisheyeDistort(focus.x, focus.y, focus.x, focus.y).z;
  const ring = base
    .map((b) => fisheyeDistort(b.x, b.y, focus.x, focus.y))
    .map((p) => ({ dx: p.x - focus.x, dy: p.y - focus.y, z: p.z }))
    .filter((p) => Math.hypot(p.dx, p.dy) >= 0.001);
  const clear = (s: number): boolean =>
    ring.every((p) => {
      const d = Math.hypot(p.dx, p.dy);
      const dist = Math.max(s * d, s * HEX_R * (zf + p.z) + LINK_MIN);
      const x = (p.dx / d) * dist;
      const y = (p.dy / d) * dist;
      const hw = s * HEX_R * p.z;
      const hh = 0.9 * s * HEX_R * p.z;
      return x - hw >= card.x1 || x + hw <= card.x0 || y - hh >= card.y1 || y + hh <= card.y0;
    });
  if (clear(zoom)) return zoom;
  let lo = zoom / 2;
  if (!clear(lo)) return lo;
  let hi = zoom;
  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Wrap a label to at most two lines that fit `max` chars (greedy). A single
 * over-long word cannot be split and returns whole.
 *
 * Line 1 ALWAYS takes the first word: even when that word alone exceeds `max`.
 * (The old greedy left l1 empty in that case and dumped the whole title onto
 * one line → the 2026-07-05 "Light-Dependent Photosynthesis Stages" full-width
 * spill.) Over-length lines are contained by `layoutLabel` (shrink + ellipsis).
 */
export function wrapLabel(text: string, max: number = LABEL_MAX): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  const words = t.split(/\s+/);
  if (words.length === 1) return [t];
  let l1 = words[0];
  let i = 1;
  while (i < words.length && l1.length + 1 + words[i].length <= max) {
    l1 += ' ' + words[i];
    i += 1;
  }
  const l2 = words.slice(i).join(' ');
  return l2 ? [l1, l2] : [l1];
}

/** Truncate `s` to at most `cap` chars, marking any cut with an ellipsis. */
function ellipsize(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return s.slice(0, Math.max(1, cap - 1)).trimEnd() + '…';
}

/**
 * Lay a title out for a hex: ≤2 word-wrapped lines, each hard-capped +
 * ellipsized so it can never be wider than the hex, PLUS a font `scale` that
 * keeps short labels full-size and shrinks long ones toward a floor. Applied to
 * EVERY node (focus + periphery): the fisheye scales the node, this scales the
 * label WITHIN it so nothing spills, focused or not. The full title stays
 * available via the node's hover `<title>` + the detail drawer.
 */
export function layoutLabel(
  title: string,
  max: number = LABEL_MAX,
  cap: number = LABEL_HARD_CAP,
  minScale: number = LABEL_MIN_SCALE,
): { lines: string[]; scale: number } {
  const lines = wrapLabel(title, max).map((ln) => ellipsize(ln, cap));
  const longest = lines.reduce((m, ln) => Math.max(m, ln.length), 0);
  const scale =
    longest <= max
      ? 1
      : Math.max(minScale, Number((max / longest).toFixed(3)));
  return { lines, scale };
}

/**
 * Province "fortified wall" inset ratio: the inner ring (`fortHexPath`) sits at
 * this fraction of `HEX_R`. A won hex draws that second, inset border ON TOP of
 * the fill; ONE constant feeds both the wall path and the label-fit below so the
 * two can never drift.
 */
export const FORT_INSET = 0.82;

/**
 * Province wall stroke width (node-local px; mirrors `.lens-hex-fort`
 * `stroke-width`). The ring is centred on `FORT_INSET·HEX_R`, so it juts a full
 * stroke inward of that radius: the clearance the label must keep.
 */
export const FORT_STROKE = 1.7;

/**
 * Uniform label-fit for a won PROVINCE hex (bug #20). `layoutLabel` sizes every
 * label to the OUTER hex (a `LABEL_MAX`-char line ≈ the hex width). A province
 * hex then draws the fortified wall at `FORT_INSET·HEX_R`, so a label that fills
 * the outer hex OVERRUNS that ring and the deep-indigo wall stroke cuts through
 * the text. Because the whole node (hex + wall + label) shares ONE `scale(z)`,
 * that overrun is z-INDEPENDENT: identical at the selected radius and every
 * receded radius; it only becomes VISIBLE once the hex de-selects (paper-white
 * fill + dark ink make the wall high-contrast). This is the outer-hex fraction
 * the wall's inner edge clears: `FORT_INSET` less the wall stroke (as a fraction
 * of `HEX_R`): derived from the wall geometry, not a magic number. ≈ 0.784.
 */
export const PROVINCE_LABEL_FIT = Number(
  (FORT_INSET - FORT_STROKE / HEX_R).toFixed(3),
);

/**
 * The label's effective uniform scale for a hex, given whether it is a won
 * PROVINCE. Non-province: or a province label already inside the wall: returns
 * `baseScale` untouched (no regression: short labels and every non-province node
 * are unchanged). A province label that WOULD overrun the wall is shrunk by just
 * the ratio needed to bring its longest line within the inner-wall char budget
 * (`LABEL_MAX · PROVINCE_LABEL_FIT`): never more. z-independent (the node's
 * `scale(z)` sizes hex + wall + label together), so the label clears the wall at
 * the selected radius and every receded radius alike. Pure.
 */
export function provinceLabelScale(
  lines: readonly string[],
  baseScale: number,
  isProvince: boolean,
): number {
  if (!isProvince) return baseScale;
  const longest = lines.reduce((m, ln) => Math.max(m, ln.length), 0);
  const budget = LABEL_MAX * PROVINCE_LABEL_FIT; // char-widths inside the wall
  const effChars = longest * baseScale; // layoutLabel's fitted longest line
  if (effChars <= budget) return baseScale; // already clears: keep it crisp
  return Number((baseScale * (budget / effChars)).toFixed(3));
}

/**
 * SVG path `d` for a rounded flat-top hexagon of circum-radius `r` with corner
 * radius `cr` (quadratic-bezier corners). No top-line "rim" (owner removed it).
 */
export function roundedHexPath(
  r: number = HEX_R,
  cr: number = HEX_CORNER,
): string {
  const h = r * 0.9;
  const V: readonly [number, number][] = [
    [-r, 0],
    [-r * 0.5, -h],
    [r * 0.5, -h],
    [r, 0],
    [r * 0.5, h],
    [-r * 0.5, h],
  ];
  const n = V.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = V[(i - 1 + n) % n];
    const c = V[i];
    const q = V[(i + 1) % n];
    const v1 = [c[0] - p[0], c[1] - p[1]];
    const v2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    const a = [c[0] - (v1[0] / l1) * cr, c[1] - (v1[1] / l1) * cr];
    const b = [c[0] + (v2[0] / l2) * cr, c[1] + (v2[1] / l2) * cr];
    d +=
      (i === 0
        ? `M ${a[0].toFixed(1)} ${a[1].toFixed(1)}`
        : ` L ${a[0].toFixed(1)} ${a[1].toFixed(1)}`) +
      ` Q ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d + ' Z';
}

/**
 * Per-node CSS `filter` drop-shadow. Neutral GREY (never indigo): subtle + tight
 * for the field, and a softer/larger shadow for the focus alone so it reads as
 * lifted (the node's own `scale(z)` enlarges it further).
 */
export function nodeShadowFilter(z: number, isFocus: boolean): string {
  if (isFocus) {
    return `drop-shadow(0 5px 13px rgba(${SHADOW_GREY},0.20))`;
  }
  const y = (1 + z * 1.8).toFixed(1);
  const bl = (2.4 + z * 3).toFixed(1);
  const a = (0.09 + z * 0.04).toFixed(2);
  return `drop-shadow(0 ${y}px ${bl}px rgba(${SHADOW_GREY},${a}))`;
}

/** Ease-out cubic: `1 − (1 − u)³` (opens at max velocity). */
export function easeOutCubic(u: number): number {
  return 1 - Math.pow(1 - u, 3);
}

/**
 * Fraction of the re-focus tween spent easing IN / easing OUT (each end); the
 * middle `1 − 2·EASE_RAMP` runs at constant velocity. Lower ⇒ more linear /
 * less bell. (owner 2026-07-16: "much more linear, only a hint of bell").
 */
export const EASE_RAMP = 0.2;

/**
 * A trapezoidal (mostly-LINEAR) tween: velocity ramps 0→plateau over the first
 * `EASE_RAMP`, holds constant through the middle, ramps plateau→0 over the last
 * `EASE_RAMP`. Zero velocity at both ends (no lurch) but a nearly constant glide
 * in between: peak ≈ 1/(1−2·RAMP·½) ≈ 1.25× avg, a mere hint of a bell vs the
 * ease-in-out curves' 2-3× (owner 2026-07-16). Plateau `v` chosen so ∫=1.
 */
export function easeMostlyLinear(u: number): number {
  const p = EASE_RAMP;
  const v = 1 / (1 - p); // plateau velocity so total distance = 1
  if (u < p) return (v * u * u) / (2 * p); // ease in (quadratic ramp from 0)
  if (u > 1 - p) return 1 - (v * (1 - u) * (1 - u)) / (2 * p); // ease out
  return v * (u - p / 2); // linear middle
}

/** The active map lens (mirrors map-canvas `MapLens`; only 3 paint the map). */
export type PaintLens = 'explore' | 'growth' | 'mastery' | 'familiar';

/** How one hex paints under the active lens (`null` = neutral structure hex). */
export type NodePaint = 'shaky' | 'mastered' | null;

/**
 * Whether a concept reads as "shaky" (a growth edge to shore up), independent of
 * the lens: an evidenced weakness (`growthEdge`) OR a `remediate` learning-edge
 * intent (the model folds that into the Shaky paint; it needs no evidenced edge).
 * Drives the FAINT always-on cue (map-canvas §5: "shaky/due cues stay faintly
 * always-on in every lens": a weakness is never invisible); the Growth lens then
 * intensifies it to the bold `nodePaint` fill. Pure + fail-soft.
 */
export function isShakyNode(
  node: Pick<ConceptNode, 'growthEdge' | 'intent'> | undefined,
): boolean {
  return !!node && (node.growthEdge != null || node.intent === 'remediate');
}

/**
 * Whether a concept is DUE for review (Ebbinghaus): the growth edge's
 * orthogonal due-⏰. A due node is always shaky (it carries a `growthEdge`), but
 * a shaky node need not be due, so due earns a distinct, more-urgent amber cue.
 * Pure + fail-soft.
 */
export function isDueNode(
  node: Pick<ConceptNode, 'growthEdge'> | undefined,
): boolean {
  return node?.growthEdge?.isDue === true;
}

/**
 * How a concept node paints under the active lens: realising the WS-D lens
 * spec (map-canvas §5: "Explore = all · Growth = shaky · Mastery = mastered";
 * "the lens colours the map hexes"). The fisheye was previously colour-blind to
 * growth state, so the Growth lens promised "highlights where you can grow next"
 * but highlighted nothing. Growth warms any `isShakyNode`; Mastery greens a
 * `mastered` node. Explore / Familiar paint nothing bold (pure Indigo-Monochrome
 * structure view: shaky nodes still carry the faint `isShakyNode` cue). Pure +
 * fail-soft (a missing node → neutral).
 */
export function nodePaint(
  lens: PaintLens,
  node: Pick<ConceptNode, 'growthEdge' | 'mastered' | 'intent'> | undefined,
): NodePaint {
  if (!node) return null;
  if (lens === 'growth') {
    return isShakyNode(node) ? 'shaky' : null;
  }
  if (lens === 'mastery') {
    return node.mastered === true ? 'mastered' : null;
  }
  return null;
}

/**
 * The always-on campaign overlay state a hex carries (WS-C7, ADR-227 D15):
 * ORTHOGONAL to `NodePaint`: campaign owns the hex chrome (border/pips/flag/
 * badge), the lens paint owns the fill (shaky/mastered), and they compose. A
 * `null` state means the map has no campaign (or a rootless goal) so NO campaign
 * chrome renders at all: the base lens is untouched.
 *
 * - `frontier`         : claimed territory, no rungs yet (or an absent per-node row)
 * - `frontier-climbing`: rungs cleared, unwon: the rung-pip ladder shows progress
 * - `frontier-cooling` : climbing but retention has gone cold (D8 refresh-gate)
 * - `province`         : won, permanent: fortified chrome + held-count badge
 */
export type CampaignHexState =
  | 'frontier'
  | 'frontier-climbing'
  | 'frontier-cooling'
  | 'province'
  | null;

/**
 * Classify one hex for the always-on campaign overlay from its per-node ladder
 * state (`campaign.nodes[conceptId]`, ABSENT = unstarted frontier) and whether
 * the map carries a campaign block at all. `wonAt` wins over everything (a won
 * node is a permanent province even mid-refresh); otherwise a cleared-rung count
 * distinguishes climbing/cooling from an untouched frontier. Pure + fail-soft.
 */
export function campaignHexState(
  state: CampaignNodeState | undefined,
  inCampaign: boolean,
): CampaignHexState {
  if (!inCampaign) return null;
  if (state?.wonAt) return 'province';
  if (state && state.rungsCleared > 0) {
    return state.cooling ? 'frontier-cooling' : 'frontier-climbing';
  }
  return 'frontier';
}

/**
 * Count the WON hierarchy-descendants beneath `conceptId`: the province
 * held-count badge feed ("N held"). Descends `hierarchy` edges only (source
 * parent → target child), never counts the node itself, and is cycle-safe (a
 * visited set seeded with the root so a back-edge terminates without a
 * double-count). A descendant with no campaign row (or an unwon one) does not
 * count. Pure.
 */
export function wonDescendantCount(
  conceptId: string,
  edges: readonly ConceptEdge[],
  campaignNodes: Readonly<Record<string, CampaignNodeState>>,
): number {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (e.class !== 'hierarchy') continue;
    const kids = children.get(e.sourceConceptId) ?? [];
    kids.push(e.targetConceptId);
    children.set(e.sourceConceptId, kids);
  }
  const visited = new Set<string>([conceptId]); // seed: never revisit / count self
  let count = 0;
  const walk = (id: string): void => {
    for (const child of children.get(id) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      if (campaignNodes[child]?.wonAt) count += 1;
      walk(child);
    }
  };
  walk(conceptId);
  return count;
}

/** Overlap-relaxation budget: passes over the node set, and the clearance
 *  multiplier a separated pair must reach. Bounded so layout always terminates.
 *  KIOSK (K202): a link's floor pushes its outer end out, which can cascade one
 *  level per pass; the world's maps settle in 8, so 24 leaves room for the ideas
 *  a visitor adds (a pass over 20 ideas is 190 pair checks). */
export const RELAX_PASSES = 24;
export const RELAX_MARGIN = 1.04;
