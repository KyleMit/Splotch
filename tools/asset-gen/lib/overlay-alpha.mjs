const OVERLAY_ALPHA_STEP = 8;
export const OVERLAY_MAX_CHANNEL_ERROR = OVERLAY_ALPHA_STEP / 2;

function quantizeOverlayAlpha(alpha) {
  return Math.min(255, Math.round(alpha / OVERLAY_ALPHA_STEP) * OVERLAY_ALPHA_STEP);
}

export function alphaOverlayRgba(luma, ink) {
  const rgba = Buffer.alloc(luma.length * 4);
  for (let pixel = 0; pixel < luma.length; pixel++) {
    const offset = pixel * 4;
    rgba[offset] = ink;
    rgba[offset + 1] = ink;
    rgba[offset + 2] = ink;
    rgba[offset + 3] = quantizeOverlayAlpha(255 - luma[pixel]);
  }
  return rgba;
}

export function maxCompositeChannelError(luma, rgba) {
  let maxError = 0;
  for (let pixel = 0; pixel < luma.length; pixel++) {
    maxError = Math.max(maxError, Math.abs(rgba[pixel * 4 + 3] - (255 - luma[pixel])));
  }
  return maxError;
}
