import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PAPER_TEXTURES, themes } from '../../web/src/lib/design/tokens.ts';
import { ROOT } from '../lib/proc.mjs';

// Semantic guard on the baked paper tiles (ADR-0100), complementing the
// byte-level `npm run gen:paper-texture:check`. That drift gate regenerates and
// compares, so it can only catch a stale or hand-edited tile — it would happily
// accept a generator that stopped flattening the alpha or baked the wrong
// theme's color, because it compares the tiles against that same broken
// generator. These assertions read the shipped bytes against tokens.ts instead,
// which is the property the optimization actually depends on.

const GRAIN_PATH = join(ROOT, 'scripts/assets/handmade-paper-grain.webp');
const tilePath = (theme) => join(ROOT, 'web/static', PAPER_TEXTURES[theme]);

function toRgb(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

// Compositing the grain's mean over the paper color predicts the tile's mean to
// well under one level (measured: 0.46 worst channel), so a tile baked onto the
// wrong theme — or onto no color at all — misses by far more than this.
const MEAN_TOLERANCE_LEVELS = 1.5;

describe.each(Object.keys(PAPER_TEXTURES))('baked paper tile: %s', (theme) => {
  it('ships with no alpha channel, so the fill costs no per-pixel blend', async () => {
    const { channels, hasAlpha } = await sharp(tilePath(theme)).metadata();
    expect(hasAlpha).toBe(false);
    expect(channels).toBe(3);
  });

  it("is baked onto its own theme's --paper", async () => {
    const grain = await sharp(GRAIN_PATH).stats();
    const tile = await sharp(tilePath(theme)).stats();
    const alpha = grain.channels[3].mean / 255;

    toRgb(themes[theme].paper).forEach((paper, channel) => {
      const predicted = paper * (1 - alpha) + grain.channels[channel].mean * alpha;
      expect(Math.abs(tile.channels[channel].mean - predicted)).toBeLessThan(MEAN_TOLERANCE_LEVELS);
    });
  });
});
