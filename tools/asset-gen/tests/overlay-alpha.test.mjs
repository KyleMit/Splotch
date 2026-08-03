import { describe, expect, it } from 'vitest';
import {
  alphaOverlayRgba,
  maxOverlayAlphaError,
  maxCompositeChannelError,
  OVERLAY_MAX_CHANNEL_ERROR,
  quantizeOverlayRgba,
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

  it('applies the same alpha contract to a resized RGBA overlay', () => {
    const rgba = Buffer.from([0, 0, 0, 123, 255, 255, 255, 252]);
    const quantized = quantizeOverlayRgba(rgba);

    expect([...quantized]).toEqual([0, 0, 0, 120, 255, 255, 255, 255]);
    expect(maxOverlayAlphaError(rgba, quantized)).toBeLessThanOrEqual(OVERLAY_MAX_CHANNEL_ERROR);
  });

  it('rejects unequal buffers instead of failing open with a NaN comparison', () => {
    expect(() => maxOverlayAlphaError(Buffer.alloc(8), Buffer.alloc(4))).toThrow(
      'Overlay buffers must have the same byte length'
    );
  });
});
