import sharp from 'sharp';

// A screenshot that never rendered comes back as one flat color, so every channel's
// standard deviation collapses toward zero 8-bit levels. Real surfaces carry text or
// chrome an order of magnitude above this floor, and the floor sits far below the
// quietest of them so a legitimately plain page cannot trip it. File size is not a
// usable proxy here: WebP encodes a plain page into a few hundred bytes too.
const NEAR_UNIFORM_CHANNEL_STDDEV_LEVELS = 1.5;

// A capture that fails validation is usually a lost frame — a viewport that had not
// applied, an animation still resolving — so the same surface is prepared and shot
// again before the run is declared broken.
export const CAPTURE_ATTEMPTS = 3;

export async function assertCaptureRendered(path, viewport) {
  const metadata = await sharp(path).metadata();
  if (
    metadata.format !== 'webp' ||
    metadata.width !== viewport.width ||
    metadata.height !== viewport.height
  ) {
    throw new Error(
      `unexpected image ${metadata.format} ${metadata.width}×${metadata.height}; expected WebP ${viewport.width}×${viewport.height}`
    );
  }
  const { channels } = await sharp(path).stats();
  const spread = Math.max(...channels.map((channel) => channel.stdev));
  if (spread < NEAR_UNIFORM_CHANNEL_STDDEV_LEVELS) {
    throw new Error(
      `near-uniform pixels (peak channel stddev ${spread.toFixed(2)} below ${NEAR_UNIFORM_CHANNEL_STDDEV_LEVELS} levels); the surface never rendered`
    );
  }
}
