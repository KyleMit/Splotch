import sharp from 'sharp';

// Native raster replay rounds edge colors when Undo redraws transformed ink.
export const RASTER_REPLAY_CHANNEL_TOLERANCE = 4;
export async function paperDifference(before, after, roi) {
  const [a, b] = await Promise.all(
    [before, after].map((path) => sharp(path).extract(roi).removeAlpha().raw().toBuffer())
  );
  let changedChannels = 0,
    maxChannelDelta = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta) changedChannels++;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  return { changedChannels, maxChannelDelta, allowedChannelDelta: RASTER_REPLAY_CHANNEL_TOLERANCE };
}
