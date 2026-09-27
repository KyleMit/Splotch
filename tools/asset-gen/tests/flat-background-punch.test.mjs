import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { keyStickerBackground, punchFlatBackground } from '../lib/flat-background-punch.mjs';

const SIZE = 64;
const BACKDROP = { r: 128, g: 128, b: 132 };

// A flat backdrop with a solid subject painted into the middle, optionally
// carrying a pocket of backdrop-colored pixels enclosed by the subject.
async function scene({ enclosedPocket = false, noise = 0 } = {}) {
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      const inSubject = x >= 16 && x < 48 && y >= 16 && y < 48;
      const inPocket = enclosedPocket && x >= 28 && x < 36 && y >= 28 && y < 36;
      if (inSubject && !inPocket) {
        raw[i] = 250;
        raw[i + 1] = 250;
        raw[i + 2] = 250;
      } else {
        const jitter = noise ? ((x * 7 + y * 13) % (2 * noise)) - noise : 0;
        raw[i] = BACKDROP.r + jitter;
        raw[i + 1] = BACKDROP.g + jitter;
        raw[i + 2] = BACKDROP.b + jitter;
      }
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer();
}

async function alphaAt(buffer, x, y) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
}

describe('punchFlatBackground', () => {
  it('emits real alpha rather than a silently flattened extra channel', async () => {
    const { buffer } = await punchFlatBackground(await scene());
    const metadata = await sharp(buffer).metadata();

    expect(metadata.channels).toBe(4);
    expect(metadata.hasAlpha).toBe(true);
  });

  it('clears the backdrop and keeps the subject opaque', async () => {
    const { buffer } = await punchFlatBackground(await scene());

    expect(await alphaAt(buffer, 2, 2)).toBe(0);
    expect(await alphaAt(buffer, 32, 32)).toBe(255);
  });

  it('leaves backdrop-colored pixels enclosed by the subject alone', async () => {
    const { buffer } = await punchFlatBackground(await scene({ enclosedPocket: true }));

    expect(await alphaAt(buffer, 2, 2)).toBe(0);
    expect(await alphaAt(buffer, 32, 32)).toBe(255);
  });

  it('tolerates codec noise in the backdrop', async () => {
    const clean = await punchFlatBackground(await scene());
    const noisy = await punchFlatBackground(await scene({ noise: 12 }));

    expect(noisy.punchedFraction).toBe(clean.punchedFraction);
    expect(await alphaAt(noisy.buffer, 2, 2)).toBe(0);
    expect(await alphaAt(noisy.buffer, 32, 32)).toBe(255);
  });

  it('reports how much it cut so a caller can reject a failed key', async () => {
    const solid = await sharp({
      create: { width: SIZE, height: SIZE, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    const { punchedFraction } = await punchFlatBackground(solid);

    expect(punchedFraction).toBe(1);
  });
});

describe('keyStickerBackground', () => {
  it('clears magenta enclosed by the sticker silhouette', async () => {
    const raw = Buffer.alloc(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 3;
        const inSticker = x >= 12 && x < 52 && y >= 12 && y < 52;
        const inGap = x >= 28 && x < 36 && y >= 28 && y < 36;
        const color = inSticker && !inGap ? [255, 255, 255] : [246, 4, 249];
        raw[i] = color[0];
        raw[i + 1] = color[1];
        raw[i + 2] = color[2];
      }
    }
    const input = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .png()
      .toBuffer();

    const { buffer } = await keyStickerBackground(input);

    expect(await alphaAt(buffer, 32, 32)).toBe(0);
    expect(await alphaAt(buffer, 20, 20)).toBe(255);
  });

  it('removes the magenta fringe from a soft sticker edge', async () => {
    const sticker = await sharp({
      create: { width: 36, height: 36, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const input = await sharp({
      create: { width: SIZE, height: SIZE, channels: 3, background: '#f604f9' },
    })
      .composite([{ input: sticker, left: 14, top: 14 }])
      .blur(2)
      .png()
      .toBuffer();

    const { buffer } = await keyStickerBackground(input);
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    let opaquePinkPixels = 0;
    for (let p = 0; p < info.width * info.height; p++) {
      const i = p * info.channels;
      if (data[i + 3] === 255 && data[i + 1] < 235 && data[i] > data[i + 1] + 8) {
        opaquePinkPixels++;
      }
    }

    expect(opaquePinkPixels).toBe(0);
  });

  it('rejects a flat magenta result and a non-magenta field', async () => {
    const flat = await sharp({
      create: { width: SIZE, height: SIZE, channels: 3, background: '#f604f9' },
    })
      .png()
      .toBuffer();

    await expect(keyStickerBackground(flat)).rejects.toThrow('keyed 100.0%');
    await expect(keyStickerBackground(await scene())).rejects.toThrow('backdrop rgb(128');
  });
});
