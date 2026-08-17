import { describe, expect, it } from 'vitest';
import { frameGeometry } from './geometry.ts';
import { storeTarget } from './targets.ts';

// Pins frameGeometry's exact output for every store slot to the values the
// committed 2026-08 store screenshot sets were rendered with (captured from
// the tools/marketing-assets/lib/store-frames.mjs implementation this module
// was ported from). A drift here means captures and frames stop lining up
// pixel-for-pixel — change these numbers only alongside a deliberate frame
// redesign and a full gen:store-assets rerun.

describe('frameGeometry', () => {
  it('phone (Google Play 1080×1920 portrait)', () => {
    expect(frameGeometry(storeTarget('phone'))).toEqual({
      k: 1,
      orientation: 'portrait',
      frame: { x: 71, y: 536, width: 938, height: 1321 },
      copy: { x: 75, top: 0, width: 930, height: 536 },
      capture: { width: 576, height: 811, deviceScaleFactor: 938 / 576 },
    });
  });

  it('tablet10 (Google Play 1920×1080 landscape)', () => {
    expect(frameGeometry(storeTarget('tablet10'))).toEqual({
      k: 1,
      orientation: 'landscape',
      frame: { x: 600, y: 57, width: 1360, height: 966 },
      copy: { x: 96, width: 470 },
      capture: { width: 907, height: 644, deviceScaleFactor: 1360 / 907 },
    });
  });

  it('iphone69 (App Store 1290×2796 portrait)', () => {
    expect(frameGeometry(storeTarget('iphone69'))).toEqual({
      k: 1290 / 1080,
      orientation: 'portrait',
      frame: { x: 85, y: 640, width: 1120, height: 2081 },
      copy: { x: 90, top: 0, width: 1110, height: 640 },
      capture: { width: 576, height: 1070, deviceScaleFactor: 1120 / 576 },
    });
  });

  it('ipad13 (App Store 2732×2048 landscape)', () => {
    expect(frameGeometry(storeTarget('ipad13'))).toEqual({
      k: 2732 / 1920,
      orientation: 'landscape',
      frame: { x: 854, y: 81, width: 1935, height: 1886 },
      copy: { x: 137, width: 669 },
      capture: { width: 907, height: 884, deviceScaleFactor: 1935 / 907 },
    });
  });
});
