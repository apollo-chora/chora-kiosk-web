import { LENS_VIEWBOX_H, LENS_VIEWBOX_W } from '../aplus/my-knowledge/concept-lens-map/concept-lens';

/**
 * Where an exhibit frames production's lens on the 1600 stage, in the lens's own units. The lens draws
 * its viewBox into the box (xMidYMid meet), so a box wider than the viewBox shows more than its 1000
 * units across, and the drawer, when an idea is open, covers the box's right side from its edge.
 */
export interface LensFrame {
  /** Stage px per lens unit. */
  readonly scale: number;
  /** Half the box's width in lens units: the room either side of the focus with the drawer shut. */
  readonly halfX: number;
  /** Half the box's height in lens units. */
  readonly halfY: number;
  /** The lens's shiftX with the drawer open: its focus moves to the middle of the strip left visible. */
  readonly drawerShift: number;
}

export function lensFrame(box: { readonly x: number; readonly w: number; readonly h: number }, drawerEdge: number): LensFrame {
  const scale = Math.min(box.w / LENS_VIEWBOX_W, box.h / LENS_VIEWBOX_H);
  return { scale, halfX: box.w / (2 * scale), halfY: box.h / (2 * scale), drawerShift: (drawerEdge - box.x - box.w) / (2 * scale) };
}

/** A region of the atlas: the mockup's MAP_BOX (x 36, y 160, 1528 by 585) and MAP_DRAWER_EDGE (1036). */
export const MAP_LENS_FRAME = lensFrame({ x: 36, w: 1528, h: 585 }, 1036);

/** The picked Companion's map: the mockup's COMP_BOX (x 560, y 262, 1004 by 483) and COMP_DRAWER_EDGE (1084). */
export const COMP_LENS_FRAME = lensFrame({ x: 560, w: 1004, h: 483 }, 1084);

/** Story step 2's hook: right of the caption on the 1600 by 757 scene (CAPTION_EDGE 560), drawer edge 1036. */
export const HOOK_LENS_FRAME = lensFrame({ x: 560, w: 1040, h: 757 }, 1036);

/**
 * K204: the atlas's caption card under its lens tabs covers the map box's top-left corner (the card's own
 * 542 by 59 stage px from the box's corner, at the atlas's scale of 1, with 8 to spare); the picked idea
 * and its ring keep clear of it. e2e/map-fit.spec.ts checks the card on screen stays inside this.
 */
export const MAP_LENS_CHROME = { w: 550, h: 70 } as const;
