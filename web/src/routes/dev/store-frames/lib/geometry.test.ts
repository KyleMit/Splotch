import { describe, expect, it } from 'vitest';
import { TABLET_MIN_SIDE_PX } from '../../../../lib/breakpoints.ts';
import { frameGeometry } from './geometry.ts';
import { STORE_TARGETS, storeTarget } from './targets.ts';

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
      frame: { x: 600, y: 92, width: 1263, height: 897 },
      copy: { x: 96, width: 470 },
      capture: { width: 907, height: 644, deviceScaleFactor: 1263 / 907 },
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
      frame: { x: 854, y: 131, width: 1797, height: 1787 },
      copy: { x: 137, width: 669 },
      capture: { width: 907, height: 902, deviceScaleFactor: 1797 / 907 },
    });
  });

  // Every frame sits fully inside its slot: a frame wider than the space left
  // of the right edge crops whatever the app draws in that corner (the trash
  // button, sliced in half by the pre-2026-08-17 landscape frame).
  it.each(STORE_TARGETS)('$name keeps the frame inside the slot', (target) => {
    const { frame } = frameGeometry(target);
    expect(frame.x + frame.width).toBeLessThanOrEqual(target.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(target.height);
  });

  // The capture viewport decides which device class the app lays itself out for
  // (actionButtonSizeClass), so it is a design input, not a rounding artifact:
  // landscape captures the tablet layout, portrait the phone one.
  it.each(STORE_TARGETS)('$name captures its intended device class', (target) => {
    const { capture } = frameGeometry(target);
    const shorterSide = Math.min(capture.width, capture.height);
    expect(shorterSide >= TABLET_MIN_SIDE_PX).toBe(target.orientation === 'landscape');
  });
});
