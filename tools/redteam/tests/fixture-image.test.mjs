import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { flattenOntoPaper, isFullyOpaque, PAPER } from '../lib/fixture-image.mjs';

// Well above the 1.21:1 the dark-paper composite produced and well below the
// 19:1 the app's own paper gives, so it fails on a swallowed corpus without
// pinning the exact ink or paper either side may legitimately retune.
const MIN_INK_PAPER_CONTRAST = 7;

/** WCAG relative-contrast between two sRGB triples. */
function contrastRatio(a, b) {
  const luminance = ([r, g, b]) => {
    const linear = (v) =>
      v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

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
    const paper = PAPER.replace('#', '');
    const expected = [0, 2, 4].map((i) => parseInt(paper.slice(i, i + 2), 16));
    expect([data[0], data[1], data[2]]).toEqual(expected);
  });

  it('leaves the strokes legible against the paper they land on', async () => {
    // The guard the earlier night-paper option lacked. Compositing this corpus
    // onto the app's dark paper is fully opaque and lands the right channel
    // values in the corners, so both of those assertions pass while the ink sits
    // at 1.21:1 against its background and the model is handed a blank square —
    // the original failure, wearing the fix's clothes. Contrast is the property
    // that was actually load-bearing, so it is the one asserted.
    const flattened = await flattenOntoPaper(await strokeOnTransparent());
    const { data, info } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => [0, 1, 2].map((c) => data[(y * info.width + x) * info.channels + c]);

    expect(contrastRatio(at(32, 32), at(0, 0))).toBeGreaterThan(MIN_INK_PAPER_CONTRAST);
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
