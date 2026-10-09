import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { PALETTE_COLORS as shippingPalette } from '../../web/src/lib/palette.ts';
import { scale, themes } from '../../web/src/lib/design/tokens.ts';
import {
  PALETTE_COLORS,
  paletteHex,
} from '../../experiments/native-architecture/src/drawing/palette.ts';
import {
  DRAWING_SCALE,
  DRAWING_SCRIM,
  DRAWING_THEME,
} from '../../experiments/native-architecture/src/drawing/theme.ts';

const sourceDirectory = join(
  import.meta.dirname,
  '../../experiments/native-architecture/src/drawing'
);
const fixtures = [];

async function fixtureModule(name, from, to) {
  const path = mkdtempSync(join(tmpdir(), 'splotch-token-projection-'));
  fixtures.push(path);
  const original = readFileSync(join(sourceDirectory, name), 'utf8');
  expect(original).toContain(from);
  const fixture = join(path, name);
  writeFileSync(fixture, original.replace(from, to));
  const { outputText } = ts.transpileModule(readFileSync(fixture, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

function assertPaletteProjection(palette) {
  assert.deepEqual(palette, shippingPalette);
}

function assertThemeProjection(theme) {
  assert.deepEqual(
    theme,
    Object.fromEntries(Object.keys(DRAWING_THEME).map((key) => [key, themes.light[key]]))
  );
}

function assertScaleProjection(nativeScale) {
  assert.deepEqual(
    nativeScale,
    Object.fromEntries(
      Object.keys(DRAWING_SCALE).map((key) => [
        key,
        key.startsWith('fontWeight') ? scale[key] : Number.parseFloat(scale[key]),
      ])
    )
  );
}

function assertScrimProjection(scrim) {
  const [, red, green, blue, alpha] = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(scale.scrimPill);
  assert.equal(scrim, `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`);
}

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('native drawing token projection', () => {
  it('pins the candidate-owned palette to the shipping palette owner', () => {
    assertPaletteProjection(PALETTE_COLORS);
    for (const color of shippingPalette) expect(paletteHex(color.label)).toBe(color.hex);
    expect(() => paletteHex('unrecognized')).toThrow('No palette color');
  });

  it('pins exactly the light-theme values consumed by drawing controls', () => {
    expect(() => assertThemeProjection(DRAWING_THEME)).not.toThrow();
  });

  it('pins the picker scale and compatible scrim to the design token owner', () => {
    expect(() => assertScaleProjection(DRAWING_SCALE)).not.toThrow();
    expect(() => assertScrimProjection(DRAWING_SCRIM)).not.toThrow();
  });

  it('refuses changed picker scale and scrim after consuming owned source fixtures', async () => {
    const scaleModule = await fixtureModule('theme.ts', "space1: '4px'", "space1: '9px'");
    expect(scaleModule.DRAWING_SCALE.space1).toBe(9);
    expect(() => assertScaleProjection(scaleModule.DRAWING_SCALE)).toThrow();
    const scrimModule = await fixtureModule('theme.ts', '23 23 29 / 72%', '23 23 29 / 50%');
    expect(scrimModule.DRAWING_SCRIM).toBe('rgba(23, 23, 29, 0.5)');
    expect(() => assertScrimProjection(scrimModule.DRAWING_SCRIM)).toThrow();
  });

  it('refuses a changed palette source after consuming the actual owned fixture', async () => {
    const module = await fixtureModule('palette.ts', "hex: '#AB71E1'", "hex: '#ffffff'");
    expect(module.paletteHex('Purple')).toBe('#ffffff');
    expect(() => assertPaletteProjection(module.PALETTE_COLORS)).toThrow();
  });

  it('refuses a changed theme source after consuming the actual owned fixture', async () => {
    const original = readFileSync(join(sourceDirectory, 'theme.ts'), 'utf8');
    const paper = /paper: ('[^']+')/.exec(original)[1];
    const module = await fixtureModule('theme.ts', `paper: ${paper}`, "paper: '#000000'");
    expect(module.DRAWING_THEME.paper).toBe('#000000');
    expect(() => assertThemeProjection(module.DRAWING_THEME)).toThrow();
  });
});
