import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  CRAYON_BANDS,
  CRAYON_TILE_PX,
  crayonPhase,
} from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { crayonTilePixels } from '../../experiments/native-architecture/src/drawing/crayonGrain.ts';
import { crayonTilePng } from '../../experiments/native-architecture/src/drawing/crayonTilePng.ts';
import { PALETTE_COLORS } from '../../experiments/native-architecture/src/drawing/palette.ts';
import referenceBytes from './native-crayon-grain.test.fixture.json';

const grainSource = readFileSync(
  new URL('../../experiments/native-architecture/src/drawing/crayonGrain.ts', import.meta.url),
  'utf8'
);
const digest = (pixels) => createHash('sha256').update(pixels).digest('hex');

function mutant(before, after) {
  expect(grainSource).toContain(before);
  const exports = {};
  runInNewContext(
    ts.transpileModule(grainSource.replace(before, after), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports }
  );
  return exports;
}
const colors = [...PALETTE_COLORS.map((color) => color.hex), '#FFFFFF', '#123456', '#000000'];
describe('canonical Crayon grain bytes', () => {
  it.each(referenceBytes.rows)('pins both unencoded RGBA bands for $hex', ({ hex, bands }) => {
    expect(CRAYON_BANDS.map(({ coverage }) => digest(crayonTilePixels(hex, coverage)))).toEqual(
      bands
    );
  });
  it('covers every palette pigment and the custom boundary colors', () => {
    expect(referenceBytes.rows.map(({ hex }) => hex)).toEqual(colors);
  });
  it.each([
    ['const EDGE_DITHER = 0.045;', 'const EDGE_DITHER = 0;'],
    ['const SHADE_VARIATION = 0.08;', 'const SHADE_VARIATION = 0.04;'],
    ['const FIELD_SEED = 0x5c1a1;', 'const FIELD_SEED = 1;'],
  ])('detects a changed field policy %s', (before, after) => {
    const changed = mutant(before, after);
    const reference = referenceBytes.rows.find(({ hex }) => hex === '#123456');
    expect(digest(changed.crayonTilePixels(reference.hex, CRAYON_BANDS[0].coverage))).not.toBe(
      reference.bands[0]
    );
  });
  it.each(colors)('round trips exact indexed PNG texels for %s', async (hex) => {
    for (const band of CRAYON_BANDS) {
      const pixels = crayonTilePixels(hex, band.coverage);
      const png = Buffer.from(crayonTilePng(pixels).split(',')[1], 'base64');
      const { data, info } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: CRAYON_TILE_PX, height: CRAYON_TILE_PX, channels: 4 });
      expect(data.equals(Buffer.from(pixels))).toBe(true);
      expect(new Set(Array.from(pixels).filter((_, i) => i % 4 === 3))).toEqual(new Set([0, 255]));
    }
  });
  it.each([
    [0, 186, 178],
    [1, 245, 4],
    [20, 126, 18],
    [820, 222, 221],
    [2147483647, 186, 118],
    [4294967295, 186, 234],
  ])('contains the canonical phase for seed %s', (seed, expectedX, expectedY) => {
    const { x, y } = crayonPhase(seed);
    expect({ x, y }).toEqual({ x: expectedX, y: expectedY });
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(CRAYON_TILE_PX);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(CRAYON_TILE_PX);
  });

  it('retains continuous pigment shading beyond the old three-shade approximation', () => {
    const pixels = crayonTilePixels('#123456', CRAYON_BANDS[0].coverage);
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 3]) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    expect(colors.size).toBeGreaterThan(3);
  });
  it('rejects invalid pigment, band coverage, and encoder dimensions', () => {
    expect(() => crayonTilePixels('Red', 0.45)).toThrow();
    expect(() => crayonTilePixels('#123456', NaN)).toThrow();
    expect(() => crayonTilePixels('#123456', 2)).toThrow();
    expect(() => crayonTilePng(new Uint8ClampedArray(4))).toThrow();
  });
});
