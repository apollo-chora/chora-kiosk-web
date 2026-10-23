import { fitStage, STAGE } from './stage-fit';

describe('fitStage (the mockup fit(): the 1600x757 grid scaled and centred, the frame edge to edge)', () => {
  it('at exactly 1600x900 the scale is 1 and nothing is offset', () => {
    expect(fitStage(1600, 900)).toEqual({ scale: 1, stageWidth: 1600, stageHeight: 900, sceneLeft: 0, sceneTop: 67 });
  });

  it('at the showroom 1366x768 the content scales down and the frame still fills the window', () => {
    const f = fitStage(1366, 768);
    expect(f.scale).toBeCloseTo(Math.min(1366 / 1600, 768 / 900), 10);
    expect(f.stageWidth * f.scale).toBeCloseTo(1366, 6);
    expect(f.stageHeight * f.scale).toBeCloseTo(768, 6);
  });

  it('a wide window centres the scene horizontally', () => {
    const f = fitStage(2400, 900);
    expect(f.scale).toBe(1);
    expect(f.stageWidth).toBe(2400);
    expect(f.sceneLeft).toBe(400);
    expect(f.sceneTop).toBe(67);
  });

  it('a tall window centres the scene vertically below the header', () => {
    const f = fitStage(1600, 1100);
    expect(f.scale).toBe(1);
    expect(f.stageHeight).toBe(1100);
    expect(f.sceneTop).toBe(67 + 100);
    expect(f.sceneLeft).toBe(0);
  });

  it('names the design grid it fits', () => {
    expect(STAGE).toEqual({ width: 1600, height: 900, header: 67, footer: 76, sceneHeight: 757 });
  });

  it('refuses a window with no size instead of dividing by zero', () => {
    expect(() => fitStage(0, 768)).toThrow(/window size/);
    expect(() => fitStage(1366, -1)).toThrow(/window size/);
  });
});
