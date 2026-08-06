import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { punchFlatBackground } from '../lib/flat-background-punch.mjs';

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
