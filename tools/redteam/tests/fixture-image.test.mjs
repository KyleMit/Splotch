import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { flattenOntoPaper, isFullyOpaque, PAPERS } from '../lib/fixture-image.mjs';

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

  it('composites onto the app paper exactly, not merely onto something pale', async () => {
    // "Not black" is too weak a guard: white, light grey and pale blue all pass
    // it while producing a corpus that is no longer what the app sends. Assert
    // the actual channel values against the design token.
    const flattened = await flattenOntoPaper(await strokeOnTransparent());
    const { data } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    const paper = PAPERS.light.replace('#', '');
    const expected = [0, 2, 4].map((i) => parseInt(paper.slice(i, i + 2), 16));
    expect([data[0], data[1], data[2]]).toEqual(expected);
  });

  it('can composite onto night paper, which is legitimately near-black', async () => {
    const flattened = await flattenOntoPaper(await strokeOnTransparent(), 'night');
    const { data } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    const paper = PAPERS.night.replace('#', '');
    const expected = [0, 2, 4].map((i) => parseInt(paper.slice(i, i + 2), 16));
    expect([data[0], data[1], data[2]]).toEqual(expected);
    expect(await isFullyOpaque(flattened)).toBe(true);
  });

  it('keeps a partially transparent stroke visible against the paper', async () => {
    // Antialiased edges arrive as partial alpha, and a compositor that dropped
    // them would quietly thin every line in the corpus.
    const faint = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 11, b: 16, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    const flattened = await flattenOntoPaper(faint);
    const { data } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    // Between the ink and the paper: blended, not dropped and not opaque ink.
    expect(data[0]).toBeGreaterThan(20);
    expect(data[0]).toBeLessThan(200);
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
