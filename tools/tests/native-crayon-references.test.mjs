import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  CRAYON_BANDS,
  CRAYON_TILE_PX,
  crayonPasses,
  crayonPhase,
  crayonTexture,
  waxColor,
} from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { BRUSHES } from '../../experiments/native-architecture/src/drawing/brushes.ts';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', async () => {
  const web = await import('react-native-svg/lib/module/elements.web.js');
  return {
    ...web,
    Pattern({ children, ...props }) {
      return createElement(web.Pattern, { ...props, overflow: 'hidden' }, children);
    },
  };
});
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);

const { Svg, Rect } = await import('react-native-svg');
const { Ink } = await import('../../experiments/native-architecture/src/drawing/Ink.tsx');
const PAPER_WIDTH = 1024;
const PAPER_HEIGHT = 768;
const CORE_HALF_HEIGHT = 7;
const SAMPLE_WIDTH = 96;
const MIN_COVERAGE = 0.3;
const WRAPPED_COPIES = 4;
const TEXTURES = CRAYON_BANDS.map((band) => crayonTexture(band.coverage));

function line(color = 'Red', seed = 20, y = 550) {
  return {
    brush: 'crayon',
    color,
    seed,
    points: [
      { x: 100, y },
      { x: 950, y },
    ],
  };
}

function scene(strokes) {
  return createElement(
    Svg,
    { width: PAPER_WIDTH, height: PAPER_HEIGHT, viewBox: `0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}` },
    createElement(Rect, { width: PAPER_WIDTH, height: PAPER_HEIGHT, fill: '#ffffff' }),
    ...strokes.map((stroke, index) => createElement(Ink, { key: index, stroke }))
  );
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => match.slice(1))
  );
}

function tags(svg, name) {
  return [...svg.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) =>
    attributes(match[0])
  );
}

function definitions(svg) {
  return tags(svg, 'path').filter((path) => path.id);
}

function patterns(svg) {
  return [...svg.matchAll(/<pattern\b([^>]*)>([\s\S]*?)<\/pattern>/g)].map((match) => ({
    props: attributes(match[1]),
    content: match[2],
  }));
}

function inlineReferences(svg) {
  const paths = new Map(definitions(svg).map((path) => [path.id, path]));
  return svg.replace(/<use\b[^>]*(?:\/>|><\/use>)/g, (tag) => {
    const path = paths.get(attributes(tag).href.slice(1));
    return `<path d="${path.d}" fill="${path.fill}"></path>`;
  });
}

function raster(svg) {
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function coverage(output, x, y) {
  let colored = 0;
  for (let dy = -CORE_HALF_HEIGHT; dy < CORE_HALF_HEIGHT; dy++) {
    for (let dx = 0; dx < SAMPLE_WIDTH; dx++) {
      const offset = ((y + dy) * output.info.width + x + dx) * 4;
      colored += output.data.subarray(offset, offset + 3).some((channel) => channel < 240);
    }
  }
  return colored / (SAMPLE_WIDTH * CORE_HALF_HEIGHT * 2);
}

function withoutQuadrant(svg, transform) {
  return svg.replace(/<g\b([^>]*)>((?:<use\b[^>]*(?:\/>|><\/use>))*)<\/g>/g, (tag, props) =>
    attributes(props).transform === transform ? '' : tag
  );
}

describe('production Crayon texture references', () => {
  it('defines each band/shade once outside Patterns with its own explicit pigment', () => {
    const svg = renderToStaticMarkup(scene([line('Blue')]));
    expect(definitions(svg).map(({ d, fill }) => ({ d, fill }))).toEqual(
      TEXTURES.flatMap((paths) =>
        paths.map((d, shade) => ({ d, fill: waxColor(paletteHex('Blue'), shade) }))
      )
    );
    expect(patterns(svg).flatMap(({ content }) => tags(content, 'path'))).toEqual([]);
    expect(patterns(svg).flatMap(({ content }) => tags(content, 'defs'))).toEqual([]);
  });

  it('resolves four copies of each local shade at the unchanged seeded translations', () => {
    const stroke = line();
    const svg = renderToStaticMarkup(scene([stroke]));
    const paths = new Map(definitions(svg).map((path) => [path.id, path]));
    const pass = crayonPasses(stroke, BRUSHES.crayon.width)[0];
    const phase = crayonPhase(pass.seed);
    const expectedTransforms = [0, -CRAYON_TILE_PX].flatMap((x) =>
      [0, -CRAYON_TILE_PX].map((y) => `translate(${phase.x + x} ${phase.y + y})`)
    );
    for (const [bandIndex, { props, content }] of patterns(svg).entries()) {
      expect(props).toMatchObject({
        width: String(CRAYON_TILE_PX),
        height: String(CRAYON_TILE_PX),
        patternUnits: 'userSpaceOnUse',
        patternContentUnits: 'userSpaceOnUse',
      });
      expect(tags(content, 'g').map((group) => group.transform)).toEqual(expectedTransforms);
      const references = tags(content, 'use');
      expect(references).toHaveLength(TEXTURES[0].length * WRAPPED_COPIES);
      expect(references.every((reference) => paths.has(reference.href.slice(1)))).toBe(true);
      expect(
        references.map((reference) => {
          const path = paths.get(reference.href.slice(1));
          return { d: path.d, fill: path.fill };
        })
      ).toEqual(
        Array.from({ length: WRAPPED_COPIES }, () =>
          TEXTURES[bandIndex].map((d, shade) => ({
            d,
            fill: waxColor(paletteHex(stroke.color), shade),
          }))
        ).flat()
      );
      const counts = new Map();
      for (const reference of references)
        counts.set(reference.href, (counts.get(reference.href) ?? 0) + 1);
      expect([...counts.values()]).toEqual(TEXTURES[0].map(() => WRAPPED_COPIES));
    }
    expect(patterns(svg)).toHaveLength(CRAYON_BANDS.length);
  });

  it('keeps definition IDs and explicit colors distinct across strokes and SVG roots', () => {
    const strokes = [line('Red'), line('Blue', 21, 650)];
    const svg = renderToStaticMarkup(createElement(Fragment, null, scene(strokes), scene(strokes)));
    const paths = definitions(svg);
    const ids = [...svg.matchAll(/\bid="([^"]*)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(paths.map((path) => path.fill)).toEqual(
      [strokes, strokes]
        .flat()
        .flatMap((stroke) =>
          TEXTURES.flatMap((band) =>
            band.map((_, shade) => waxColor(paletteHex(stroke.color), shade))
          )
        )
    );
  });

  it('stores texture geometry once while real wrapped references replace inline copies', () => {
    const svg = renderToStaticMarkup(scene([line()]));
    const inline = inlineReferences(svg);
    const geometryCharacters = definitions(svg).reduce((total, path) => total + path.d.length, 0);
    expect(definitions(svg)).toHaveLength(TEXTURES.flat().length);
    expect(tags(svg, 'use')).toHaveLength(TEXTURES.flat().length * WRAPPED_COPIES);
    expect(inline.length - svg.length).toBeGreaterThan(geometryCharacters * (WRAPPED_COPIES - 1));
  });

  it.each(['forward', 'backtracking and mixed colors'])(
    'matches inline geometry pixels for %s under fixed-tile clipping',
    async (kind) => {
      const stroke = line();
      const strokes =
        kind === 'forward'
          ? [stroke]
          : [{ ...stroke, points: [...stroke.points, { x: 100, y: 550 }] }, line('Blue', 21, 550)];
      const svg = renderToStaticMarkup(scene(strokes));
      const referenced = await raster(svg);
      const inline = await raster(inlineReferences(svg));
      expect(referenced.info).toEqual(inline.info);
      expect(referenced.data.equals(inline.data)).toBe(true);
    }
  );

  it('exposes an unresolved template instead of treating a missing reference as preserved output', async () => {
    const svg = renderToStaticMarkup(scene([line()]));
    const broken = svg.replace(/href="[^"]*"/g, 'href="#missing-wax"');
    const output = await raster(svg);
    expect(coverage(output, 330, 550)).toBeGreaterThan(MIN_COVERAGE);
    expect(coverage(await raster(broken), 330, 550)).toBe(0);
  });

  it('exposes a changed definition pigment in the rendered artwork', async () => {
    const svg = renderToStaticMarkup(scene([line()]));
    const changed = svg.replace(/<path\b[^>]*>/g, (tag) =>
      attributes(tag).id ? tag.replace(/fill="[^"]*"/, 'fill="#0000ff"') : tag
    );
    expect(changed).not.toBe(svg);
    const original = await raster(svg);
    expect((await raster(changed)).data.equals(original.data)).toBe(false);
  });

  it('rejects removal of the negative-x/negative-y seed20 quadrant at the native failure height', async () => {
    const stroke = line();
    const phase = crayonPhase(crayonPasses(stroke, BRUSHES.crayon.width)[0].seed);
    const svg = renderToStaticMarkup(scene([stroke]));
    const removed = withoutQuadrant(
      svg,
      `translate(${phase.x - CRAYON_TILE_PX} ${phase.y - CRAYON_TILE_PX})`
    );
    expect(removed).not.toBe(svg);
    expect(coverage(await raster(svg), 330, 550)).toBeGreaterThan(MIN_COVERAGE);
    expect(coverage(await raster(removed), 330, 550)).toBe(0);
  });
});
