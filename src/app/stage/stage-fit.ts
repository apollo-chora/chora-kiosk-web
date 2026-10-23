/**
 * The kiosk's design grid (the approved mockup, K2 and K22): a 1600x900 stage whose
 * 1600x757 content grid sits between a 67 px header and a 76 px footer. The page fills
 * the browser window: the stage is scaled to fit, the header, footer and background run
 * edge to edge, and the content grid is centred between them (the mockup's fit()).
 */
export const STAGE = { width: 1600, height: 900, header: 67, footer: 76, sceneHeight: 757 } as const;

export interface StageFit {
  /** The CSS scale applied to the stage. */
  readonly scale: number;
  /** The stage's unscaled size, so that scaled it fills the window exactly. */
  readonly stageWidth: number;
  readonly stageHeight: number;
  /** Where the 1600-wide scene sits inside the stage, in stage pixels. */
  readonly sceneLeft: number;
  readonly sceneTop: number;
}

export function fitStage(windowWidth: number, windowHeight: number): StageFit {
  if (!(windowWidth > 0) || !(windowHeight > 0)) {
    throw new Error(`[kiosk] fitStage: no usable window size (${windowWidth}x${windowHeight})`);
  }
  const scale = Math.min(windowWidth / STAGE.width, windowHeight / STAGE.height);
  const stageWidth = windowWidth / scale;
  const stageHeight = windowHeight / scale;
  return {
    scale,
    stageWidth,
    stageHeight,
    sceneLeft: (stageWidth - STAGE.width) / 2,
    sceneTop: STAGE.header + (stageHeight - STAGE.height) / 2,
  };
}
