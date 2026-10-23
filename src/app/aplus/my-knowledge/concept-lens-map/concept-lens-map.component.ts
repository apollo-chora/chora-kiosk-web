/**
 * ConceptLensMapComponent: the A+ "My Knowledge" graph fisheye LENS
 * (owner-approved 2026-07-03; supersedes the 6-neighbour hex on this surface).
 *
 * Presentational: it renders the WHOLE map's concepts on one bounded SVG canvas
 * and emits interaction intents; the parent page owns all data + service calls.
 * A lens magnifies the focus + its neighbourhood while the periphery shrinks but
 * never vanishes: local realistic context AND the grand picture in fixed bounds,
 * NO pan/zoom (focus+context / DOI-tree principle: "nodes translate, never
 * disappear"). Theme = "Indigo Monochrome": paper-white rounded hexes, one indigo
 * for the focus, a pale-indigo root tint, neutral-grey shadows (softer under the
 * focus so it lifts), wrapped labels, no rim.
 *
 * - tap / Enter / Space on any node → `select(conceptId)` (parent focuses + opens
 *   its detail); the lens eases onto it (rAF; honours prefers-reduced-motion).
 * - "make this my root" → `makeRoot` (operates on the current focus).
 * - `settled` fires when the re-focus resolves (parent redraws the connector).
 *
 * The geometry is the pure, unit-tested `./concept-lens` module. Per chora-web
 * CLAUDE.md §3: standalone, signal state, OnPush.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { TranslateService } from '@ngx-translate/core';
import type {
  ConceptEdge,
  ConceptNode,
} from '../../discovery-graph/concept-graph.model';
import type {
  CampaignNodeState,
  FogGhost,
  MapCampaign,
} from '../campaign.model';
import { CAMPAIGN_TOTAL_RUNGS } from '../campaign.model';
import {
  buildLensLayout,
  freeFogSlots,
  fogSlotAngle,
  landmassDist,
  landmassScale,
  LANDMASS_TIER_MARGIN,
  LINK_MIN,
  RELAX_PASSES,
  RELAX_MARGIN,
  campaignHexState,
  easeMostlyLinear,
  fisheyeDistort,
  neighbourhoodZoom,
  chromeClearZoom,
  nodeShadowFilter,
  nodePaint,
  isShakyNode,
  isDueNode,
  roundedHexPath,
  layoutLabel,
  provinceLabelScale,
  wonDescendantCount,
  FIT_EDGE_PAD,
  FORT_INSET,
  HEX_CORNER,
  HEX_R,
  LENS_CX,
  LENS_CY,
  LENS_VIEWBOX_H,
  LENS_VIEWBOX_W,
  REFOCUS_MS,
  type CampaignHexState,
  type LensLayout,
  type NodePaint,
  type PaintLens,
} from './concept-lens';

/** Fixed fog-ring geometry: up to 6 face-down ghosts fanned around a focal node. */
const FOG_MAX_PER_FOCAL = 6;
/** Fan radius (viewBox units, pre-z) from the focal centre to a ghost centre. */
const FOG_FAN_R = HEX_R * 1.5;
/** A ghost's size as a fraction of a tile's (KIOSK, K174: its clearance test reads it too). */
const FOG_HEX_K = 0.45;
/** Rung-pip ladder geometry (node-local coords; the node's own scale(z) sizes it). */
const PIP_GAP = 7.2;
const PIP_Y = 27;

/** One wrapped label line + its baseline `y` in node-local coords. */
interface LensLabelLine {
  readonly text: string;
  readonly y: number;
}

/** A node ready to render: distorted transform + shadow + label + role flags. */
interface LensRenderNode {
  readonly conceptId: string;
  readonly transform: string;
  readonly filter: string;
  readonly isFocus: boolean;
  /** KIOSK (K202): a hierarchy child of the focus, its ring, which must stay inside the frame. */
  readonly isRing: boolean;
  readonly isRoot: boolean;
  /** An ANCESTOR of the focus: dimmed (the landmass path back up). */
  readonly dimmed: boolean;
  /** OFF-SPINE (not the focus, a descendant, or an ancestor): faded to faint
   * background so the parent's siblings / cousins don't clutter the focal view. */
  readonly faded: boolean;
  readonly tabindex: number;
  /** The bare concept title: the hover `<title>` (full name, campaign-free). */
  readonly title: string;
  /** Title + campaign state as text: the a11y `aria-label` (never colour alone). */
  readonly ariaLabel: string;
  readonly labelLines: readonly LensLabelLine[];
  /** Font shrink-to-fit (≤1) so a long label fits the hex instead of spilling. */
  readonly labelScale: number;
  /** Growth-lens hex overlay (`null` = neutral); focus/root win via SCSS order. */
  readonly paint: NodePaint;
  /** Faint always-on shaky cue (every lens); the bold `paint` overrides it. */
  readonly cue: boolean;
  /** Distinct always-on amber cue when the concept is due for review. */
  readonly dueCue: boolean;
  /** Always-on campaign overlay state (`null` = no campaign: no chrome). */
  readonly campaignState: CampaignHexState;
  /** Rung-pip ladder (6 dots): only on a climbing/cooling frontier node. */
  readonly pips: readonly LensPip[];
  /** Won hierarchy-descendants below a province (0 hides the held badge). */
  readonly heldCount: number;
  /** This node is the campaign march focus: plants the march standard. */
  readonly marchFocus: boolean;
}

/** One rung dot on the ladder: its x (node-local) + whether it is cleared. */
interface LensPip {
  readonly cx: number;
  readonly filled: boolean;
}

/** A face-down fog hex ready to render: fanned transform + a11y flags. */
interface LensFogGhost {
  readonly suggestionId: string;
  readonly focalConceptId: string;
  readonly transform: string;
  readonly tabindex: number;
  readonly ariaLabel: string;
}

/** A distorted edge curve between two node centres. */
interface LensRenderEdge {
  readonly key: string;
  readonly d: string;
  readonly width: number;
  readonly lateral: boolean;
}

type Point = { readonly x: number; readonly y: number };

/** A node's resolved lens placement: centre + render scale. */
interface LensPlacement {
  readonly id: string;
  readonly title: string;
  readonly p: { readonly x: number; readonly y: number; readonly z: number };
}

@Component({
  selector: 'chora-aplus-concept-lens-map',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './concept-lens-map.component.html',
  styleUrl: './concept-lens-map.component.scss',
})
export class ConceptLensMapComponent {
  /** The whole map's concepts (id + title drive the lens; overlays live in the drawer). */
  readonly concepts = input.required<readonly ConceptNode[]>();
  /** Learner-authored edges (hierarchy shapes the radial tree; lateral draws too). */
  readonly edges = input.required<readonly ConceptEdge[]>();
  /** The focused concept: the lens centres (eases) onto it. */
  readonly focusId = input.required<string>();
  /** The map's explicit root (ADR-214): drives the pale-indigo root tint + make-root. */
  readonly rootId = input<string | undefined>(undefined);
  /** Dims the scene + disables interaction during a graph mutation. */
  readonly loading = input<boolean>(false);
  /**
   * Horizontal shift (viewBox units) applied to the whole map so the focus
   * re-centres on the VISIBLE canvas: the parent sets this negative while the
   * detail drawer overlays the right, so the focus (normally dead-centre) sits
   * in the middle of the uncovered left region at the same size. 0 = full-canvas
   * centre. CSS-eased, so opening/closing the drawer glides the map across.
   */
  readonly shiftX = input<number>(0);
  /**
   * KIOSK (K202): half the lens box's width in viewBox units. The neighbourhood fit took the box to be
   * exactly the viewBox wide (LENS_CX either side), but the kiosk frames the lens in wider boxes (the
   * atlas is 1528 lens px wide, so 764 either side), and with the drawer open the old guess left 228 of
   * the real 492: the fit then shrank the whole map whenever an idea was picked.
   */
  readonly frameHalfX = input<number>(LENS_CX);
  /** KIOSK (K204): half the lens box's height in viewBox units (the box's top edge sits this far above the centre). */
  readonly frameHalfY = input<number>(LENS_VIEWBOX_H / 2);
  /**
   * KIOSK (K204): a card fixed over the box's top-left corner, its width and height in viewBox units (the
   * atlas's lens caption); the focus's ring is zoomed in from under it. Null: nothing covers the frame.
   */
  readonly chrome = input<{ readonly w: number; readonly h: number } | null>(null);
  /**
   * The active map LENS (WS-D). Growth warms the hexes you can grow next (an
   * evidenced `growthEdge` / `remediate` intent); Mastery greens the settled
   * ones; Explore / Familiar leave the map neutral. Data already rides on
   * `concepts`: this only decides what the hexes render (see `nodePaint`).
   */
  readonly lens = input<PaintLens>('explore');

  /**
   * The always-on Familiar-campaign overlay (WS-C7, ADR-227 D15). `null` = the
   * map has no campaign (rootless goal / fail-soft read) → NO campaign chrome
   * renders and the base lens is untouched. Present ⇒ every hex derives a
   * fog/frontier/province state and paints border/pips/flag/badge chrome that
   * COMPOSES with the lens paint (chrome = border, lens = fill).
   */
  readonly campaign = input<MapCampaign | null>(null);
  /**
   * Face-down fog ghosts to fan around their focal node: PENDING concept-kind
   * suggestions the parent has already filtered to this map's nodes. Each is a
   * small unrevealed hex; tapping one asks the parent to focus the focal + open
   * the Suggestions drawer.
   */
  readonly fogGhosts = input<readonly FogGhost[]>([]);
  /** KIOSK (K37): the ideas to click next, ringed with the gold glow; never the focus. */
  readonly glowIds = input<readonly string[]>([]);
  /** KIOSK (K37): the ringed ids as a set, for the template. */
  protected readonly glowSet = computed(() => new Set(this.glowIds()));

  /** A node was tapped: the parent should focus it + open its detail. */
  readonly select = output<string>();
  /** "Make this my root" pressed for the current focus. */
  readonly makeRoot = output<void>();
  /** The re-focus animation resolved (or snapped): redraw dependent overlays. */
  readonly settled = output<void>();
  /** A fog ghost was tapped: emits the FOCAL conceptId (focus it + open drawer). */
  readonly fogTap = output<string>();

  private readonly translate = inject(TranslateService);

  readonly viewBox = `0 0 ${LENS_VIEWBOX_W} ${LENS_VIEWBOX_H}`;
  /** The rounded flat-top hex path is constant: compute once. */
  readonly hexPath = roundedHexPath();
  /** Inset hex ring for the province "fortified wall" (a second stroked hex). */
  readonly fortHexPath = roundedHexPath(HEX_R * FORT_INSET, HEX_CORNER * FORT_INSET);
  /** The small face-down fog-ghost hex (~0.45·HEX_R). */
  readonly fogHexPath = roundedHexPath(HEX_R * FOG_HEX_K, HEX_CORNER * 0.5);
  /** KIOSK (K37): the glow's hex, 1.16 times the tile (the approved mockup's GLOW_PATH). */
  readonly glowHexPath = roundedHexPath(HEX_R * 1.16, HEX_CORNER * 1.16);
  /** A crenellated rook/standard (march focus marker; distinct from the crown). */
  readonly marchPath =
    'M-6 0 L-6 -9 L-3.6 -9 L-3.6 -6 L-1.2 -6 L-1.2 -9 ' +
    'L1.2 -9 L1.2 -6 L3.6 -6 L3.6 -9 L6 -9 L6 0 Z';
  /** Ladder pip baseline `y` in node-local coords (below the label). */
  readonly pipY = PIP_Y;
  /**
   * `clip-path` ref for every node label. One shared `<clipPath>` (the same hex
   * geometry, `userSpaceOnUse`) referenced from each node's transform-less label
   * group clips that label to ITS OWN hex: a hard geometric guarantee that no
   * glyph can ever paint past the hexagon, belt-and-suspenders past the
   * char-estimate shrink in `layoutLabel` (a pathological all-wide-glyph title
   * could otherwise still touch the edge).
   */
  readonly labelClip = 'url(#lens-hex-clip)';

  /**
   * CSS transform on the whole-map group: a horizontal glide (viewBox units) so
   * the focus re-centres on the visible canvas as the drawer opens/closes. It is
   * CSS-transitioned (drawer glide) and does NOT touch the per-node transforms,
   * so it composes cleanly with the rAF re-focus without fighting it.
   */
  readonly shiftTransform = computed<string>(
    () => `translate(${this.shiftX()}px, 0)`,
  );

  private readonly layout = computed<LensLayout>(() =>
    buildLensLayout(this.concepts(), this.edges(), this.rootId()),
  );
  private readonly effectiveRootId = computed<string | null>(
    () => this.rootId() ?? this.layout().rootId,
  );

  /** The focus is the map root ⇒ make-root disabled (already rooted here). */
  readonly isRoot = computed<boolean>(
    () => this.focusId() === this.effectiveRootId(),
  );
  /** A single-concept map ⇒ the "add more / connect" hint. */
  readonly isLonely = computed<boolean>(() => this.concepts().length <= 1);

  /** The base (pre-distortion) position the lens rests on for the current focus. */
  private readonly focusBase = computed<Point>(() =>
    this.baseFor(this.focusId(), this.layout()),
  );
  /**
   * The lens centre that drives the render: a PLAIN signal moved only by the
   * re-focus tween (or a snap). It must NOT be `anim ?? focusBase()`: that made
   * it jump to the new focus the instant `focusId` changed, so the tween started
   * already-at-target and the map SNAPPED with no motion (the owner's "no
   * transition at all"). Holding the OLD position here until the rAF eases it is
   * what makes the transition read: the prototype's `sx,sy` start.
   */
  private readonly renderCenter = signal<Point>({ x: LENS_CX, y: LENS_CY });

  /**
   * The focus's hierarchy CHILDREN: they + the focus own the fitted frame (the
   * parent is excluded so the focus + its six children can be big, owner
   * 2026-07-16).
   */
  private readonly childIds = computed<ReadonlySet<string>>(() => {
    const f = this.focusId();
    const kids = new Set<string>();
    for (const e of this.edges()) {
      if (e.sourceConceptId === f && e.class === 'hierarchy') {
        kids.add(e.targetConceptId);
      }
    }
    return kids;
  });

  /**
   * Every DESCENDANT of the focus (its whole hierarchy subtree). With the
   * ancestors, this is the focus's "spine"; nodes off it (the parent's siblings,
   * cousins) are faded to faint context so they don't clutter the focal view or
   * the ancestor landmass they may overlap (owner 2026-07-16).
   */
  private readonly focusDescendants = computed<ReadonlySet<string>>(() => {
    const edges = this.edges();
    const out = new Set<string>();
    let frontier: string[] = [this.focusId()];
    while (frontier.length) {
      const next: string[] = [];
      for (const p of frontier) {
        for (const e of edges) {
          if (
            e.class === 'hierarchy' &&
            e.sourceConceptId === p &&
            !out.has(e.targetConceptId)
          ) {
            out.add(e.targetConceptId);
            next.push(e.targetConceptId);
          }
        }
      }
      frontier = next;
    }
    return out;
  });

  /**
   * Every ANCESTOR of the focus (focus → root), ranked root=0 … parent=highest:
   * drives back-to-front paint order so an ancestor stack (parent below the focus,
   * grandparent below the parent) reads front-to-back when the hexes overlap.
   */
  private readonly ancestorRank = computed<ReadonlyMap<string, number>>(() => {
    const edges = this.edges();
    const parentOf = (id: string): string | undefined =>
      edges.find((e) => e.targetConceptId === id && e.class === 'hierarchy')
        ?.sourceConceptId;
    const chain: string[] = []; // [parent, grandparent, …, root]
    const seen = new Set<string>();
    let cur = parentOf(this.focusId());
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      chain.push(cur);
      cur = parentOf(cur);
    }
    const rank = new Map<string, number>();
    chain.forEach((id, i) => rank.set(id, chain.length - 1 - i)); // root=0 … parent=max
    return rank;
  });

  /**
   * Ancestor DEPTH from a given focus: direct parent = 1, grandparent = 2, …:
   * drives the receding landmass stack in `distorted` (each deeper level pushed a
   * further `PARENT_DEPTH_STEP` out + scaled by `PARENT_DEPTH_DECAY`). Kept as a
   * plain method (not a computed) so the re-focus effect can also compute it for
   * the OUTGOING focus and ease the stack between the two.
   */
  private depthChain(focusId: string | null | undefined): ReadonlyMap<string, number> {
    const depth = new Map<string, number>();
    if (!focusId) return depth;
    const edges = this.edges();
    const parentOf = (id: string): string | undefined =>
      edges.find((e) => e.targetConceptId === id && e.class === 'hierarchy')
        ?.sourceConceptId;
    const seen = new Set<string>();
    let cur = parentOf(focusId);
    let d = 1;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      depth.set(cur, d);
      d += 1;
      cur = parentOf(cur);
    }
    return depth;
  }

  /** Depth of each ancestor of the CURRENT focus (parent = 1, grandparent = 2, …). */
  private readonly ancestorDepth = computed<ReadonlyMap<string, number>>(() =>
    this.depthChain(this.focusId()),
  );

  /**
   * Uniform ≤ 1 zoom applied to every node's offset-from-centre and size so the
   * focus + its WHOLE immediate ring stay on screen (owner 2026-07-04: a lone
   * root+child clipped the child off the top; the ring must always be fully
   * visible), each ring link keeping LINK_MIN of line (KIOSK K202: a zoom, never a
   * squeeze of the gaps). Computed from the SETTLED neighbourhood (`focusBase`,
   * NOT the animating `renderCenter`) so it holds steady through the re-focus
   * tween. The available half-width is the frame's (`frameHalfX`) less the
   * drawer's leftward `shiftX`, so the ring fits the UNCOVERED region while the
   * drawer is open; the half-height is the full frame (the drawer never covers
   * vertically). 1 ⇒ the ring already fits (no zoom).
   */
  private readonly zoom = computed<number>(() => {
    const layout = this.layout();
    const focus = this.focusBase();
    const fid = this.focusId();
    const kids = this.childIds();
    const base = layout.nodes
      .filter((n) => n.conceptId === fid || kids.has(n.conceptId))
      .map((n) => ({ x: n.x, y: n.y }));
    if (base.length === 0) return 1;
    const availHalfX = Math.max(120, this.frameHalfX() + this.shiftX() - FIT_EDGE_PAD);
    const availHalfY = LENS_CY - FIT_EDGE_PAD;
    const zoom = neighbourhoodZoom(base, focus, availHalfX, availHalfY);
    const chrome = this.chrome();
    if (!chrome) return zoom;
    // The card stays put on screen while the map glides by shiftX: relative to the focus as drawn, the box's
    // corner sits frameHalfX + shiftX to the left and frameHalfY up (less the centre's half-unit offset).
    const x0 = -this.frameHalfX() - this.shiftX();
    const y0 = LENS_VIEWBOX_H / 2 - this.frameHalfY() - LENS_CY;
    return chromeClearZoom(base, focus, zoom, { x0, y0, x1: x0 + chrome.w, y1: y0 + chrome.h });
  });

  /**
   * Every node's distorted, CENTRED position for the current lens centre. The
   * whole cloud is translated so the lens centre (where the focus sits,
   * undistorted at max scale) lands at the viewBox centre: the focus is thus
   * always centred + as big as possible, and the "fly-to-centre" translation
   * makes the re-focus ease read clearly (owner 2026-07-03). Offsets-from-centre
   * and sizes are then zoomed by `zoom` so the focus + its immediate ring always
   * fit the frame (owner 2026-07-04), their links kept (K202).
   */
  private readonly distorted = computed(() => {
    const c = this.renderCenter();
    const zoom = this.zoom();
    const ox = LENS_CX - c.x;
    const oy = LENS_CY - c.y;
    // The SETTLED layout for the current lens centre: the glide's END state.
    // Each ancestor sits at its "landmass": pushed out in its own direction:
    // parent nearest + biggest, grandparent further + smaller (a receding stack
    // the frame may clip). The re-focus GLIDE between two such layouts is a
    // straight lerp (`positions` / `animateTo`), so this needs no per-frame ease.
    const depth = this.ancestorDepth();
    // Landmass target (position + scale) for an ancestor `d` levels deep
    // (1 = parent): pushed out along its own ray from centre, scaled down/level.
    const landmass = (bx: number, by: number, d: number) => {
      const dx = bx - LENS_CX;
      const dy = by - LENS_CY;
      const nd = Math.hypot(dx, dy) || 1;
      // landmassDist enforces per-tier hex clearance; a flat
      // PARENT_DIST + (d-1)*PARENT_DEPTH_STEP overlapped the stack at d=1/d=2.
      const dist = landmassDist(d);
      return {
        x: LENS_CX + (dx / nd) * dist,
        y: LENS_CY + (dy / nd) * dist,
        z: landmassScale(d),
      };
    };
    const edges = this.edges();
    const parentOf = (id: string): string | undefined =>
      edges.find((e) => e.targetConceptId === id && e.class === 'hierarchy')
        ?.sourceConceptId;
    // Pass 1: every node's fisheye + zoom BASE position.
    const base = this.layout().nodes.map((n) => {
      const p = fisheyeDistort(n.x, n.y, c.x, c.y);
      return {
        id: n.conceptId,
        title: n.title,
        bx: LENS_CX + (p.x + ox - LENS_CX) * zoom,
        by: LENS_CY + (p.y + oy - LENS_CY) * zoom,
        bz: p.z * zoom,
      };
    });
    const baseById = new Map(base.map((b) => [b.id, b]));
    const focusId = this.focusId();
    // Displacement of the NEAREST displaced ancestor above `id`, walking the
    // hierarchy up until it finds one. The walk stops at the focus (whose subtree
    // stays with the centred focus) and at an orphan (no displacement).
    //
    // This MUST cascade. The previous version tested only the IMMEDIATE parent
    // (`depth.get(parentOf(id))`), and `depth` holds only the focus→root spine,
    // so the ride died after exactly one level: a grandchild of a displaced
    // ancestor kept its raw fisheye position while its whole parent chain moved
    // to a landmass, stranding it (owner-reported at tier 3, "Cross Multiply").
    // An ancestor's landmass is BOTH a translation and an enlargement, so a
    // rider must follow both. Translating alone keeps the child's original
    // offset while the ancestor grows to HEX_R * PARENT_SCALE (47 * 3 = 141px),
    // which parks the child INSIDE it: the owner-reported overlap, and the
    // source of the "cut" connectors (renderEdges trims to the hex edge, so
    // centres closer than the summed radii invert the segment).
    //
    // Anchoring instead expands the offset by the ancestor's own scale, so the
    // whole cluster grows with its landmass and keeps clear of it.
    type Anchor = { readonly id: string; readonly bx: number; readonly by: number; readonly x: number; readonly y: number; readonly s: number };
    const NO_ANCHOR: Anchor | null = null;
    const anchorCache = new Map<string, Anchor | null>();
    const anchorOf = (id: string): Anchor | null => {
      const chain: string[] = [];
      const seen = new Set<string>();
      let cur: string | undefined = id;
      let anchor: Anchor | null = NO_ANCHOR;
      while (cur && !seen.has(cur)) {
        seen.add(cur); // cycle-safe, mirroring depthChain/buildLensLayout
        if (anchorCache.has(cur)) {
          anchor = anchorCache.get(cur) ?? null;
          break;
        }
        // The focus stays centred, so nothing at or below it rides.
        if (cur === focusId) break;
        const d = depth.get(cur);
        if (d !== undefined) {
          const cb = baseById.get(cur);
          if (cb) {
            const lm = landmass(cb.bx, cb.by, d);
            anchor = { id: cur, bx: cb.bx, by: cb.by, x: lm.x, y: lm.y, s: lm.z };
          }
          break;
        }
        chain.push(cur);
        cur = parentOf(cur);
      }
      // Memoise the whole walked chain: every node on it resolves to the same
      // nearest displaced ancestor, so a deep subtree costs one walk, not N.
      for (const n of chain) anchorCache.set(n, anchor);
      return anchor;
    };
    // Pass 2: an ANCESTOR rides its own landmass; every OFF-SPINE node rides the
    // displacement of its nearest displaced ancestor (own size kept), so a whole
    // branch travels as one cluster instead of tearing apart at tier 3.
    const placed: LensPlacement[] = base.map((b) => {
      const d = depth.get(b.id);
      if (d !== undefined) {
        return { id: b.id, title: b.title, p: landmass(b.bx, b.by, d) };
      }
      if (b.id !== focusId) {
        const a = anchorOf(b.id);
        if (a) {
          // Push out only as far as this rider needs to clear the ancestor's
          // hex. A UNIFORM per-ancestor factor keeps the cluster's shape but is
          // set by the CLOSEST rider, which drags every other rider off a
          // 1000x584 canvas. Keep the push minimal here; residual rider-rider
          // collisions are resolved by relaxOverlaps below, which displaces only
          // the nodes that actually collide.
          const ox0 = b.bx - a.bx;
          const oy0 = b.by - a.by;
          const len0 = Math.hypot(ox0, oy0) || 1;
          const k = Math.max(1, (HEX_R * (a.s + b.bz) * LANDMASS_TIER_MARGIN) / len0);
          return {
            id: b.id,
            title: b.title,
            p: { x: a.x + (b.bx - a.bx) * k, y: a.y + (b.by - a.by) * k, z: b.bz },
          };
        }
      }
      return { id: b.id, title: b.title, p: { x: b.bx, y: b.by, z: b.bz } };
    });
    // The focus is centred by contract and the ancestors' landmasses are
    // deliberate, so both are PINNED; riders absorb any residual separation.
    const pinned = new Set<string>([focusId, ...depth.keys()]);
    const linked = new Set(edges.flatMap((e) => [`${e.sourceConceptId}|${e.targetConceptId}`, `${e.targetConceptId}|${e.sourceConceptId}`]));
    return this.relaxOverlaps(placed, pinned, linked);
  });

  /**
   * Separate any pair of nodes whose rendered hexes still overlap, by pushing
   * them apart along their centre line over a few passes.
   *
   * Needed because clearing each rider from its ancestor says nothing about
   * riders colliding with EACH OTHER, and the two global alternatives both fail:
   * a per-rider factor deforms the cluster (Cross Multiply and Equivalence Test
   * landed 21px apart), while a uniform per-ancestor factor is set by the
   * closest rider and pushed four nodes off-canvas. Relaxation displaces ONLY
   * what actually collides, so the map stays compact and nothing disappears.
   *
   * Pinned nodes (focus, ancestors) never move; a pinned/free pair puts the
   * whole correction on the free node. Bounded passes, so it always terminates.
   */
  private relaxOverlaps(
    nodes: readonly LensPlacement[],
    pinned: ReadonlySet<string>,
    linked: ReadonlySet<string>,
  ): LensPlacement[] {
    const out = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      p: { x: n.p.x, y: n.p.y, z: n.p.z },
    }));
    for (let pass = 0; pass < RELAX_PASSES; pass++) {
      let moved = false;
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i];
          const b = out[j];
          const aPin = pinned.has(a.id);
          const bPin = pinned.has(b.id);
          if (aPin && bPin) continue; // both deliberate: leave them be
          const dx = b.p.x - a.p.x;
          const dy = b.p.y - a.p.y;
          const d = Math.hypot(dx, dy) || 0.001;
          // KIOSK (K202): two linked ideas keep LINK_MIN of line between their hex edges (renderEdges
          // trims each end by HEX_R * z), so every link shows; any other pair only must not touch.
          const link = linked.has(`${a.id}|${b.id}`);
          const need = link ? HEX_R * (a.p.z + b.p.z) + LINK_MIN : HEX_R * (a.p.z + b.p.z) * RELAX_MARGIN;
          if (d >= need) continue;
          const push = need - d;
          const ux = dx / d;
          const uy = dy / d;
          // A pinned partner takes none of the push; two free nodes split it, except a link's, which
          // its outer end takes whole (pushed away from the centre), so a link never pulls the inner
          // end, already spaced from its own parent, back in.
          const outerB = Math.hypot(b.p.x - LENS_CX, b.p.y - LENS_CY) >= Math.hypot(a.p.x - LENS_CX, a.p.y - LENS_CY);
          const free = link ? (outerB ? 1 : 0) : 0.5;
          const aShare = aPin ? 0 : bPin ? 1 : 1 - free;
          const bShare = bPin ? 0 : aPin ? 1 : free;
          a.p.x -= ux * push * aShare;
          a.p.y -= uy * push * aShare;
          b.p.x += ux * push * bShare;
          b.p.y += uy * push * bShare;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return out;
  }

  /**
   * The RENDERED positions: the settled `distorted()` layout, OR: during a
   * re-focus glide: a straight linear interpolation from the snapshot the glide
   * started at (`tweenFrom`) to that settled layout, by `tweenProgress`. Lerping
   * between two settled layouts (not re-running the fisheye every frame) makes the
   * on-screen glide move at the timing curve's speed: constant through the middle
   *: rather than front-loading on the fisheye gradient (owner 2026-07-16). A node
   * with no start snapshot appears at its settled spot.
   */
  private readonly positions = computed(() => {
    const settled = this.distorted();
    const from = this.tweenFrom();
    if (!from) return settled;
    const t = this.tweenProgress();
    return settled.map((n) => {
      const f = from.get(n.id);
      if (!f) return n;
      return {
        id: n.id,
        title: n.title,
        p: {
          x: f.x + (n.p.x - f.x) * t,
          y: f.y + (n.p.y - f.y) * t,
          z: f.z + (n.p.z - f.z) * t,
        },
      };
    });
  });

  readonly renderNodes = computed<readonly LensRenderNode[]>(() => {
    const focus = this.focusId();
    const root = this.effectiveRootId();
    const disabled = this.loading();
    const lens = this.lens();
    // The always-on campaign overlay (WS-C7): `null` ⇒ no chrome anywhere.
    const campaign = this.campaign();
    const inCampaign = campaign !== null;
    const campaignNodes = campaign?.nodes ?? {};
    const marchId = campaign?.focusConceptId;
    const edges = this.edges();
    // The focus's ANCESTORS (parent, grandparent, …): dimmed so they recede
    // behind the focus + its children (the direct parent is also the big landmass
    // in `distorted`), and painted back-to-front below (root furthest back).
    const ancestors = this.ancestorRank();
    // The focus's DESCENDANTS: with the ancestors + focus they are the "spine";
    // any node off it (the parent's siblings, cousins) fades to faint context.
    const descendants = this.focusDescendants();
    const ring = this.childIds();
    // The geometry layout carries only id/title/xy: re-join the source concept
    // to read its growth overlay (growthEdge / mastered / intent) for the lens.
    const byId = new Map(this.concepts().map((c) => [c.conceptId, c]));
    const nodes = this.positions().map(({ id, title, p }) => {
      const isFocus = id === focus;
      const src = byId.get(id);
      const { lines, scale } = layoutLabel(title);
      const labelLines: LensLabelLine[] =
        lines.length === 1
          ? [{ text: lines[0], y: 4 }]
          : lines.map((t, i) => ({ text: t, y: i === 0 ? -3.5 : 11 }));
      const st = campaignNodes[id];
      const campaignState = campaignHexState(st, inCampaign);
      const heldCount =
        campaignState === 'province'
          ? wonDescendantCount(id, edges, campaignNodes)
          : 0;
      const marchFocus = !!marchId && id === marchId;
      return {
        conceptId: id,
        transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.z.toFixed(3)})`,
        filter: nodeShadowFilter(p.z, isFocus),
        isFocus,
        isRing: ring.has(id),
        isRoot: id === root,
        dimmed: !isFocus && ancestors.has(id),
        faded: !isFocus && !ancestors.has(id) && !descendants.has(id),
        tabindex: disabled ? -1 : 0,
        title,
        ariaLabel: this.composeAria(title, campaignState, st, heldCount, marchFocus),
        labelLines,
        labelScale: provinceLabelScale(lines, scale, campaignState === 'province'),
        paint: nodePaint(lens, src),
        cue: isShakyNode(src),
        dueCue: isDueNode(src),
        campaignState,
        pips: this.ladderPips(campaignState, st),
        heldCount,
        marchFocus,
      };
    });
    // Paint the focus's ANCESTORS behind everything (root-most furthest back) so a
    // downward overlap reads focus → parent → grandparent, front-to-back (owner
    // 2026-07-16). Non-ancestors keep their order; ancestors sort ahead, root-first.
    const rank = ancestors;
    if (rank.size === 0) return nodes;
    return [...nodes].sort((a, b) => {
      const ra = rank.get(a.conceptId);
      const rb = rank.get(b.conceptId);
      if (ra === undefined && rb === undefined) return 0;
      if (ra === undefined) return 1; // non-ancestor → painted in front of ancestor
      if (rb === undefined) return -1; // ancestor → painted behind non-ancestor
      return ra - rb; // both ancestors: lower rank (root) painted further back
    });
  });

  readonly renderEdges = computed<readonly LensRenderEdge[]>(() => {
    const pos = new Map(this.positions().map((d) => [d.id, d.p]));
    const out: LensRenderEdge[] = [];
    for (const e of this.edges()) {
      const a = pos.get(e.sourceConceptId);
      const b = pos.get(e.targetConceptId);
      if (!a || !b) continue; // dangling-edge guard
      // Trim both endpoints to the hex EDGE (not the centre) so a connector
      // never cuts through a node: notably the long line to the pushed-out,
      // enlarged parent "landmass" (owner 2026-07-16).
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const elen = Math.hypot(ex, ey) || 1;
      const ux = ex / elen;
      const uy = ey / elen;
      // Two hexes closer than their summed rendered radii OVERLAP. Trimming to
      // each hex edge then pushes the start past the end and the segment
      // reverses, drawing a stub that shoots the wrong way (the owner-reported
      // "line-cutting"). A connector between overlapping nodes has no honest
      // path to draw, so draw none rather than a misleading one. Layout should
      // prevent this; the guard keeps a layout regression from rendering as a
      // baffling artifact.
      if (HEX_R * a.z + HEX_R * b.z >= elen) continue;
      const ax = a.x + ux * HEX_R * a.z;
      const ay = a.y + uy * HEX_R * a.z;
      const bx = b.x - ux * HEX_R * b.z;
      const by = b.y - uy * HEX_R * b.z;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      out.push({
        key: e.edgeId,
        d: `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`,
        width: +(1.25 * Math.max(a.z, b.z)).toFixed(2),
        lateral: e.class === 'lateral',
      });
    }
    return out;
  });

  /**
   * Fog ghosts: for each pending suggestion whose focal node is on the map, fan
   * up to 6 small face-down hexes around that focal node's distorted centre
   * (offset scaled by the focal's `z`, so they track the lens). A focal has six
   * child slots; the claimed children + fog ghosts share them, so ghosts fill
   * only the hex-ring slots NOT already taken by a CLAIMED CHILD: a face-down
   * ghost must never render under a sibling child (CHO: the old fixed top-start
   * fan drew a ghost under the claimed child above). The parent is NOT a child
   * slot: it is a separate upward linkage, so its direction still gets a fog
   * child and the parent hex is dimmed instead (renderNodes `dimmed`). A focal
   * not on this map is dropped; overflow past the free slots stays in the
   * Suggestions list only (never overlapping). Per-focal cap stays 6.
   *
   * KIOSK (K174): a ghost that would touch an idea is left out too (it stays in
   * the drawer's list): a slot is kept only when its ghost clears every other
   * idea by relaxOverlaps' circle test, HEX_R x (0.45 z_focal + z_node) x
   * RELAX_MARGIN, and a focal shows at most 6 minus its own children (the owner's
   * six-children rule; two children can share one 60° slot). The slots are read
   * on the SETTLED layout, so a glide never changes which ghosts show; the ghosts
   * still ride the glide's positions. Positions and data are unchanged.
   */
  readonly renderFog = computed<readonly LensFogGhost[]>(() => {
    const ghosts = this.fogGhosts();
    if (ghosts.length === 0) return [];
    const disabled = this.loading();
    const ariaLabel = this.t('campaign_state_fog');
    const pos = new Map(this.positions().map((d) => [d.id, d.p]));
    const settled = new Map(this.distorted().map((d) => [d.id, d.p]));
    const edges = this.edges();
    // Free hex-ring slots per focal: computed lazily on first sighting, then
    // filled in ring order so ghosts avoid the claimed-children directions.
    const freeByFocal = new Map<string, readonly number[]>();
    const capByFocal = new Map<string, number>();
    const placedByFocal = new Map<string, number>();
    const out: LensFogGhost[] = [];
    for (const g of ghosts) {
      const c = pos.get(g.focalConceptId);
      const s = settled.get(g.focalConceptId);
      if (!c || !s) continue; // focal not on this map: drop it (fail-soft)
      let free = freeByFocal.get(g.focalConceptId);
      if (free === undefined) {
        // Only the focal's CHILDREN (focal → child edges) share the child-fan;
        // the parent (child → focal) is an upward linkage and keeps no slot.
        const children: { x: number; y: number }[] = [];
        let own = 0;
        for (const e of edges) {
          if (e.sourceConceptId !== g.focalConceptId) continue;
          if (e.class === 'hierarchy') own++;
          const p = settled.get(e.targetConceptId);
          if (p) children.push({ x: p.x, y: p.y });
        }
        free = freeFogSlots({ x: s.x, y: s.y }, children).filter((slot) => this.fogSlotClear(g.focalConceptId, s, slot, settled));
        freeByFocal.set(g.focalConceptId, free);
        capByFocal.set(g.focalConceptId, Math.max(0, FOG_MAX_PER_FOCAL - own));
        placedByFocal.set(g.focalConceptId, 0);
      }
      const placed = placedByFocal.get(g.focalConceptId) ?? 0;
      // ring full (every free slot used, ≤ FOG_MAX_PER_FOCAL): overflow ghost
      // stays in the Suggestions list rather than overlapping a live node.
      if (placed >= Math.min(free.length, capByFocal.get(g.focalConceptId) ?? 0)) continue;
      placedByFocal.set(g.focalConceptId, placed + 1);
      const ang = fogSlotAngle(free[placed]);
      const gx = c.x + Math.cos(ang) * FOG_FAN_R * c.z;
      const gy = c.y + Math.sin(ang) * FOG_FAN_R * c.z;
      out.push({
        suggestionId: g.suggestionId,
        focalConceptId: g.focalConceptId,
        transform: `translate(${gx.toFixed(1)} ${gy.toFixed(1)}) scale(${c.z.toFixed(3)})`,
        tabindex: disabled ? -1 : 0,
        ariaLabel,
      });
    }
    return out;
  });

  /** KIOSK (K174): whether a ghost in this slot of the settled focal clears every other idea on the settled layout. */
  private fogSlotClear(focalId: string, focal: { x: number; y: number; z: number }, slot: number, settled: ReadonlyMap<string, { x: number; y: number; z: number }>): boolean {
    const ang = fogSlotAngle(slot);
    const gx = focal.x + Math.cos(ang) * FOG_FAN_R * focal.z;
    const gy = focal.y + Math.sin(ang) * FOG_FAN_R * focal.z;
    for (const [id, p] of settled) {
      if (id === focalId) continue;
      if (Math.hypot(gx - p.x, gy - p.y) < HEX_R * (FOG_HEX_K * focal.z + p.z) * RELAX_MARGIN) return false;
    }
    return true;
  }

  /** Resolve an `aplus.knowledge.*` campaign key (reactive to language switch). */
  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(`aplus.knowledge.${key}`, params);
  }

  /** The 6-dot rung ladder for a climbing/cooling node (empty otherwise). */
  private ladderPips(
    campaignState: CampaignHexState,
    st: CampaignNodeState | undefined,
  ): LensPip[] {
    if (
      campaignState !== 'frontier-climbing' &&
      campaignState !== 'frontier-cooling'
    ) {
      return [];
    }
    const cleared = st?.rungsCleared ?? 0;
    const mid = (CAMPAIGN_TOTAL_RUNGS - 1) / 2;
    return Array.from({ length: CAMPAIGN_TOTAL_RUNGS }, (_, i) => ({
      cx: +((i - mid) * PIP_GAP).toFixed(2),
      filled: i < cleared,
    }));
  }

  /**
   * Extend the node's title with campaign state as TEXT (never colour alone):
   * province (+ held count), climbing (+ rungs, + cooling), or frontier; plus an
   * advanced-today / march-focus tail. Returns the bare title when the map has no
   * campaign: the no-campaign path stays translation-free (base lens untouched).
   */
  private composeAria(
    title: string,
    campaignState: CampaignHexState,
    st: CampaignNodeState | undefined,
    heldCount: number,
    marchFocus: boolean,
  ): string {
    if (campaignState === null) return title;
    const parts: string[] = [title];
    if (campaignState === 'province') {
      parts.push(this.t('campaign_state_province'));
      if (heldCount > 0) {
        parts.push(this.t('campaign_held_count', { count: heldCount }));
      }
    } else if (
      campaignState === 'frontier-climbing' ||
      campaignState === 'frontier-cooling'
    ) {
      parts.push(
        this.t('campaign_state_climbing', {
          cleared: st?.rungsCleared ?? 0,
          total: CAMPAIGN_TOTAL_RUNGS,
        }),
      );
      if (campaignState === 'frontier-cooling') {
        parts.push(this.t('campaign_cooling'));
      }
    } else {
      parts.push(this.t('campaign_state_frontier'));
    }
    if (st?.advancedToday) parts.push(this.t('campaign_advanced_today'));
    if (marchFocus) parts.push(this.t('campaign_focus_marker'));
    return parts.join(', ');
  }

  private prevFocus: string | null = null;
  private raf: number | null = null;
  /** During a re-focus GLIDE: the on-screen positions the glide started from
   * (`null` = settled, no glide). Rendered `positions` lerp from this to the
   * settled layout by `tweenProgress`. */
  private readonly tweenFrom = signal<ReadonlyMap<
    string,
    { x: number; y: number; z: number }
  > | null>(null);
  /** Glide progress 0→1 (1 = settled), eased by `easeMostlyLinear`. */
  private readonly tweenProgress = signal<number>(1);
  /** The ACTUAL last-rendered on-screen positions, cached every frame + on
   * settle/snap. A glide starts from THIS (where nodes visually are) rather than
   * a fresh distort: which, since `focusId` has already flipped to the click
   * target, would mis-scale that node (e.g. a clicked parent snapping from its
   * 3.0 landmass to focus size instead of gliding). */
  private lastPositions: ReadonlyMap<
    string,
    { x: number; y: number; z: number }
  > = new Map();

  /** Cache the currently-rendered `positions` as the glide-start reference. */
  private cachePositions(): void {
    this.lastPositions = new Map(
      untracked(() => this.positions()).map((n) => [
        n.id,
        { x: n.p.x, y: n.p.y, z: n.p.z },
      ]),
    );
  }

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Re-focus driver: on a focus change, ease the lens centre from where it is to
    // the new focus base (rAF, easeMostlyLinear: near-constant glide, soft ends). On the initial mount,
    // a reduced-motion preference, or a non-focus graph edit, snap. Depends on
    // focusId + focusBase ALONE; the tween body is untracked so writing the anim
    // signal can't re-trigger this effect (the map-familiar untracked-trap lesson).
    effect(() => {
      const fid = this.focusId();
      const target = this.focusBase();
      untracked(() => {
        const first = this.prevFocus === null;
        const sameFocus = this.prevFocus === fid;
        this.prevFocus = fid;
        // Snap on first render, reduced motion, or a graph edit that kept the
        // same focus (the node may have moved as the layout re-solved); otherwise
        // GLIDE from where the lens currently is to the new focus.
        if (first || sameFocus || this.prefersReducedMotion()) {
          this.cancelAnim();
          this.tweenFrom.set(null);
          this.renderCenter.set(target);
          this.cachePositions();
          this.settled.emit();
        } else {
          this.animateTo(target);
        }
      });
    });
    destroyRef.onDestroy(() => this.cancelAnim());
  }

  private baseFor(fid: string, layout: LensLayout): Point {
    const n = layout.nodes.find((nn) => nn.conceptId === fid);
    return n ? { x: n.x, y: n.y } : { x: LENS_CX, y: LENS_CY };
  }

  private animateTo(target: Point): void {
    this.cancelAnim();
    // Glide from the ACTUAL last-rendered positions (`lastPositions`, cached every
    // frame): where nodes VISUALLY are, e.g. the clicked parent as its 3.0
    // landmass: NOT a fresh distort, which (focusId already = the click target)
    // would treat that node as the new focus and jump its size (owner 2026-07-16).
    // Then jump the lens to the SETTLED layout so `distorted()` is the glide END;
    // `positions` lerps between the two at the timing rate → a straight,
    // constant-speed glide in every direction (down, up, sideways).
    const fromMap = this.lastPositions;
    this.renderCenter.set(target);
    this.tweenFrom.set(fromMap);
    this.tweenProgress.set(0);
    const t0 = performance.now();
    const step = (now: number): void => {
      const u = Math.min(1, (now - t0) / REFOCUS_MS);
      this.tweenProgress.set(easeMostlyLinear(u));
      this.cachePositions();
      if (u < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.raf = null;
        this.tweenFrom.set(null);
        this.cachePositions();
        this.settled.emit();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  private cancelAnim(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  onSelect(id: string): void {
    if (this.loading()) return;
    this.select.emit(id);
  }

  onNodeKeydown(ev: KeyboardEvent, id: string): void {
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      this.onSelect(id);
    }
  }

  onMakeRoot(): void {
    if (this.loading() || this.isRoot()) return;
    this.makeRoot.emit();
  }

  onFogTap(focalConceptId: string): void {
    if (this.loading()) return;
    this.fogTap.emit(focalConceptId);
  }

  onFogKeydown(ev: KeyboardEvent, focalConceptId: string): void {
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      this.onFogTap(focalConceptId);
    }
  }
}
