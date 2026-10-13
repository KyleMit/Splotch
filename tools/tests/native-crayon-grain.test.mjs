import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  CRAYON_BANDS,
  CRAYON_TILE_PX,
  crayonPhase,
} from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { crayonTilePixels } from '../../experiments/native-architecture/src/drawing/crayonGrain.ts';
import { crayonTilePng } from '../../experiments/native-architecture/src/drawing/crayonTilePng.ts';
import { PALETTE_COLORS } from '../../experiments/native-architecture/src/drawing/palette.ts';
import {
  createShippingCrayonOracle as shipping,
  shippingCrayonPixels as oraclePixels,
} from './native-crayon-shipping-oracle.mjs';

const grainSource = readFileSync(
  new URL('../../experiments/native-architecture/src/drawing/crayonGrain.ts', import.meta.url),
  'utf8'
);
function evaluate(source, modules, extra = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      ...extra,
      require(name) {
        if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected oracle import: ${name}`);
        return modules[name];
      },
    }
  );
  return exports;
}
function mutant(before, after) {
  expect(grainSource).toContain(before);
  return evaluate(grainSource.replace(before, after), { './crayon': { CRAYON_TILE_PX } });
}
const colors = [...PALETTE_COLORS.map((color) => color.hex), '#FFFFFF', '#123456', '#000000'];
describe('canonical Crayon grain bytes', () => {
  it.each(colors)(
    'matches the shipping field owner for every RGBA byte in both %s bands',
    (hex) => {
      const owner = shipping();
      for (const [index, band] of CRAYON_BANDS.entries())
        expect(
          Buffer.from(crayonTilePixels(hex, band.coverage)).equals(
            Buffer.from(oraclePixels(owner, hex, index))
          )
        ).toBe(true);
    }
  );
  it.each([0, 1, 20, 820, 0x7fffffff, 0xffffffff])(
    'contains the canonical phase for seed %s',
    (seed) => {
      const owner = shipping();
      const [x, y] = owner.seedPhase(seed, CRAYON_TILE_PX);
      expect(crayonPhase(seed)).toEqual({ x, y });
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(CRAYON_TILE_PX);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(CRAYON_TILE_PX);
    }
  );
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
  it('retains continuous pigment shading beyond the old three-shade approximation', () => {
    const pixels = crayonTilePixels('#123456', CRAYON_BANDS[0].coverage);
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 3]) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    expect(colors.size).toBeGreaterThan(3);
  });
  it.each([
    ['const EDGE_DITHER = 0.045;', 'const EDGE_DITHER = 0;'],
    ['const SHADE_VARIATION = 0.08;', 'const SHADE_VARIATION = 0.04;'],
    ['const FIELD_SEED = 0x5c1a1;', 'const FIELD_SEED = 1;'],
  ])('detects a changed field policy %s', (before, after) => {
    const changed = mutant(before, after);
    const expected = oraclePixels(shipping(), '#123456', 0);
    expect(
      Buffer.from(changed.crayonTilePixels('#123456', CRAYON_BANDS[0].coverage)).equals(
        Buffer.from(expected)
      )
    ).toBe(false);
  });
  it('rejects invalid pigment, band coverage, and encoder dimensions', () => {
    expect(() => crayonTilePixels('Red', 0.45)).toThrow();
    expect(() => crayonTilePixels('#123456', NaN)).toThrow();
    expect(() => crayonTilePixels('#123456', 2)).toThrow();
    expect(() => crayonTilePng(new Uint8ClampedArray(4))).toThrow();
  });
});
