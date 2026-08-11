import sharp from 'sharp';

// A screenshot that half rendered comes back mostly flat, so every channel's
// standard deviation collapses toward zero 8-bit levels. The floor is placed
// between the two measured populations: across the 720 committed captures the
// quietest legitimate surface scores 13.42 levels (p5 18.5, median 36.0), while
// partial renders synthesized from a real capture score 1.81 with 1% of the page
// painted, 2.89 with 4%, and 5.22 with 8%. At 6 levels a page under roughly a
// tenth painted fails and the quietest legitimate capture still clears the floor
// by 2.2×; a floor of 1.5 caught only a perfectly flat frame. Past about 15%
// painted (14.30) the populations overlap and no floor separates them. File size
// is not a usable proxy here: WebP encodes a plain page into a few hundred bytes
// too.
const NEAR_UNIFORM_CHANNEL_STDDEV_LEVELS = 6;

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
