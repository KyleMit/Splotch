import { describe, expect, it } from 'vitest';
import {
  alphaOverlayRgba,
  maxCompositeChannelError,
  OVERLAY_MAX_CHANNEL_ERROR,
} from '../lib/overlay-alpha.mjs';

describe('alpha overlay conversion', () => {
  it('turns ink-on-white luma into transparent black or white ink', () => {
    const luma = Buffer.from([0, 127, 255]);

    expect([...alphaOverlayRgba(luma, 0)]).toEqual([0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0]);
    expect([...alphaOverlayRgba(luma, 255)]).toEqual([
      255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 255, 0,
    ]);
  });

  it('keeps the reconstructed composite within the declared channel error', () => {
    const luma = Buffer.from(Array.from({ length: 256 }, (_, value) => value));
    const rgba = alphaOverlayRgba(luma, 0);

    expect(maxCompositeChannelError(luma, rgba)).toBe(OVERLAY_MAX_CHANNEL_ERROR);
  });
});
