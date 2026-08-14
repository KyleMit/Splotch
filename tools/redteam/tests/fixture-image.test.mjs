import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { flattenOntoPaper, isFullyOpaque } from '../lib/fixture-image.mjs';

// A dark stroke on a fully transparent background — the shape every committed
// red-team fixture has, and the one that silently defeated the whole suite when
// the provider composited it onto black instead of onto paper.
async function strokeOnTransparent() {
  return sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: {
          create: {
            width: 32,
            height: 8,
            channels: 4,
            background: { r: 10, g: 11, b: 16, alpha: 1 },
          },
        },
        left: 16,
        top: 28,
      },
    ])
    .png()
    .toBuffer();
}

describe('flattenOntoPaper', () => {
  it('turns a transparent fixture into one the provider cannot reinterpret', async () => {
    const transparent = await strokeOnTransparent();
    expect(await isFullyOpaque(transparent)).toBe(false);
    expect(await isFullyOpaque(await flattenOntoPaper(transparent))).toBe(true);
  });

  it('composites onto light paper, not onto black', async () => {
    // The whole defect: a dark stroke over a black composite is invisible. The
    // corner pixel must come back as paper, so assert its actual brightness
    // rather than merely that it is opaque.
    const flattened = await flattenOntoPaper(await strokeOnTransparent());
    const { data } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = data;
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  });

  it('keeps the strokes themselves dark', async () => {
    const flattened = await flattenOntoPaper(await strokeOnTransparent());
    const { data, info } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    const centre = (32 * info.width + 32) * info.channels;
    expect(data[centre]).toBeLessThan(60);
  });

  it('leaves an already-opaque fixture alone', async () => {
    const opaque = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const flattened = await flattenOntoPaper(opaque);
    const { data } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0x12, 0x34, 0x56]);
  });
});
