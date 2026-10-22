import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { InkScene } from '../../src/drawing/InkScene.tsx';
import { InkPaperScope } from '../../src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import {
  adoptPaper,
  LEGACY_PAPER,
  semanticWidth,
  textureScale,
} from '../../src/drawing/paperSpace.ts';
import { CRAYON_BANDS, CRAYON_TILE_PX } from '../../src/drawing/crayon.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock('../../src/drawing/CrayonGlaze.tsx', () => import('../../src/drawing/CrayonGlaze.web.tsx'));
const { Svg } = await import('react-native-svg');
const pen = {
  brush: 'pen',
  color: 'Red',
  width: 22,
  points: [
    { x: 200, y: 384 },
    { x: 824, y: 384 },
  ],
};
const crayon = { ...pen, brush: 'crayon', seed: 1 };
const eraser = {
  brush: 'eraser',
  width: 44,
  points: [
    { x: 512, y: 100 },
    { x: 512, y: 668 },
  ],
};

async function output(strokes, paper, width = 342, height = 256.5) {
  const svg = renderToStaticMarkup(
    createElement(
      Svg,
      { width, height, viewBox: '0 0 1024 768' },
      createElement(
        InkPaperScope.Provider,
        { value: paper },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: 'blank', theme: 'light' } },
          createElement(InkScene, { checkpoint: null, strokes, onImageLoad() {} })
        )
      )
    )
  );
  const pixels = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { svg, ...pixels };
}
function alphaAt(render, x, y) {
  return render.data[(y * render.info.width + x) * 4 + 3];
}
function columnInk(render, x) {
  return Array.from({ length: render.info.height }, (_, y) => alphaAt(render, x, y)).filter(
    (alpha) => alpha > 0
  ).length;
}

describe('physical paper renderer controls using the real SVG owners', () => {
  it.each([
    [342, 256.5],
    [760, 570],
  ])('keeps selected Pen width at initial %s/%s viewport', async (w, h) => {
    const adopted = adoptPaper(w, h, 1);
    const current = await output([pen], adopted, w, h);
    const legacy = await output([pen], LEGACY_PAPER, w, h);
    const column = Math.floor(w / 2);
    // Antialiasing can add the two boundary pixels to an otherwise exact CSS width.
    expect(columnInk(current, column)).toBeGreaterThanOrEqual(22);
    expect(columnInk(current, column)).toBeLessThanOrEqual(24);
    expect(columnInk(legacy, column)).toBeLessThan(columnInk(current, column));
    expect(current.svg).toContain(`stroke-width="${semanticWidth(22, adopted)}"`);
    expect(alphaAt(current, 0, 0)).toBe(0);
  });

  it('uses the same width transform for a dot and Magic without changing the page coordinate space', async () => {
    const paper = adoptPaper(342, 256.5, 1);
    const dot = await output([{ ...pen, points: [{ x: 512, y: 384 }] }], paper);
    const magic = await output(
      [{ brush: 'magic', rainbow: 0, width: 22, points: pen.points }],
      paper
    );
    expect(columnInk(dot, 171)).toBeGreaterThanOrEqual(22);
    expect(columnInk(dot, 171)).toBeLessThanOrEqual(24);
    expect(columnInk(magic, 171)).toBeGreaterThanOrEqual(22);
    expect(columnInk(magic, 171)).toBeLessThanOrEqual(24);
    expect(magic.svg).toContain('gradientUnits="userSpaceOnUse"');
  });

  it('scales both Crayon bands and the contained phase, without regenerating pigment images', async () => {
    const paper = adoptPaper(342, 256.5, 2);
    const adopted = await output([crayon], paper);
    const legacy = await output([crayon], LEGACY_PAPER);
    const texel = textureScale(paper);
    expect(adopted.svg).toContain(`scale(${texel})`);
    expect(adopted.svg).toContain(`width="${CRAYON_TILE_PX * texel}"`);
    for (const band of CRAYON_BANDS)
      expect(adopted.svg).toContain(`stroke-width="${semanticWidth(22, paper) * band.widthScale}"`);
    const pngs = (svg) =>
      [...svg.matchAll(/data:image\/png;base64,([^" ]+)/g)].map((match) => match[1]);
    expect(pngs(adopted.svg)).toEqual(pngs(legacy.svg));
    expect(pngs(adopted.svg)).toHaveLength(CRAYON_BANDS.length);
    expect(alphaAt(adopted, 0, 0)).toBe(0);
  });

  it('uses the shared width transform for eraser masks and catches a legacy-scale negative', async () => {
    const paper = adoptPaper(342, 256.5, 1);
    const adopted = await output([pen, eraser], paper);
    const legacy = await output([pen, eraser], LEGACY_PAPER);
    expect(adopted.svg).toContain(`stroke-width="${semanticWidth(44, paper)}"`);
    expect(alphaAt(adopted, 171, 128)).toBe(0);
    expect(alphaAt(adopted, 150, 128)).toBe(0);
    expect(alphaAt(legacy, 150, 128)).toBeGreaterThan(0);
    expect(alphaAt(adopted, 100, 128)).toBeGreaterThan(0);
  });

  it('keeps export geometry canonical while retaining the drawing reference', async () => {
    const paper = adoptPaper(342, 256.5, 1);
    const canonical = await output([pen, crayon], paper, 1024, 768);
    expect(canonical.info.width).toBe(1024);
    expect(canonical.info.height).toBe(768);
    expect(canonical.svg).toContain(`stroke-width="${semanticWidth(22, paper)}"`);
    const repeat = await output([pen, crayon], paper, 1024, 768);
    expect(repeat.data.equals(canonical.data)).toBe(true);
    const wrongReference = await output([pen, crayon], LEGACY_PAPER, 1024, 768);
    expect(wrongReference.data.equals(canonical.data)).toBe(false);
  });

  it('distinguishes real tooth and phase from a solid replacement at identical width', async () => {
    const paper = adoptPaper(342, 256.5, 1);
    const grain = await output([crayon], paper);
    const solid = await output([pen], paper);
    const shifted = await output([{ ...crayon, seed: 2 }], paper);
    expect(grain.data.equals(solid.data)).toBe(false);
    expect(grain.data.equals(shifted.data)).toBe(false);
    const core = [];
    for (let y = 125; y <= 131; y += 1)
      for (let x = 110; x <= 230; x += 1) core.push(alphaAt(grain, x, y));
    expect(core.some((alpha) => alpha === 0)).toBe(true);
    expect(core.some((alpha) => alpha > 0)).toBe(true);
  });
  it('adds same-hue coverage in already visited pixels before lift, with unchanged committed output', async () => {
    const paper = adoptPaper(342, 256.5, 1);
    const forward = {
      ...crayon,
      points: [
        { x: 100, y: 400 },
        { x: 600, y: 400 },
      ],
    };
    const reverse = { ...forward, points: [...forward.points, { x: 350, y: 400 }] };
    const back = { ...forward, points: [...reverse.points, { x: 100, y: 400 }] };
    const images = await Promise.all(
      [forward, reverse, back].map((stroke) => output([stroke], paper))
    );
    const coverage = (image) => {
      let covered = 0;
      for (let y = 131; y <= 137; y += 1)
        for (let x = 120; x <= 190; x += 1) if (alphaAt(image, x, y) > 0) covered += 1;
      return covered;
    };
    expect(coverage(images[1])).toBeGreaterThan(coverage(images[0]));
    expect(coverage(images[2])).toBeGreaterThanOrEqual(coverage(images[1]));
    const committed = await output([JSON.parse(JSON.stringify(back))], paper);
    expect(committed.data.equals(images[2].data)).toBe(true);
    const frozenNegative = await output([forward], paper);
    expect(coverage(frozenNegative)).toBe(coverage(images[0]));
    expect(coverage(frozenNegative)).toBeLessThan(coverage(images[1]));
    for (const image of images) expect(alphaAt(image, 5, 5)).toBe(0);
  });

  it('retains different crossing orders and records both color distributions without a forward-only hue predicate', async () => {
    const paper = adoptPaper(342, 256.5, 1);
    const horizontal = {
      ...crayon,
      color: 'Yellow',
      points: [
        { x: 100, y: 400 },
        { x: 900, y: 400 },
      ],
    };
    const vertical = {
      ...crayon,
      color: 'Blue',
      seed: 2,
      points: [
        { x: 512, y: 100 },
        { x: 512, y: 700 },
      ],
    };
    const first = await output([horizontal, vertical], paper);
    const second = await output([vertical, horizontal], paper);
    const distribution = (image) => {
      const colors = new Map();
      for (let y = 131; y <= 137; y += 1)
        for (let x = 168; x <= 174; x += 1) {
          const offset = (y * image.info.width + x) * 4;
          const color = [...image.data.subarray(offset, offset + 4)].join(',');
          colors.set(color, (colors.get(color) ?? 0) + 1);
        }
      return [...colors].sort(([left], [right]) => left.localeCompare(right));
    };
    expect(distribution(first)).not.toEqual(distribution(second));
    expect(first.data.equals((await output([horizontal, vertical], paper)).data)).toBe(true);
    expect(second.data.equals((await output([vertical, horizontal], paper)).data)).toBe(true);
    expect(alphaAt(first, 0, 0)).toBe(0);
    expect(alphaAt(second, 0, 0)).toBe(0);
  });
});
