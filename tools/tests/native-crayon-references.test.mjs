import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import {
  CRAYON_BANDS,
  CRAYON_TILE_PX,
  crayonPasses,
  crayonPhase,
} from '../../src/drawing/crayon.ts';
import { crayonTileUri } from '../../src/drawing/crayonTiles.ts';
import { paletteHex } from '../../src/drawing/palette.ts';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', async () => {
  const web = await import('react-native-svg/lib/module/elements.web.js');
  return {
    ...web,
    Pattern: ({ children, ...props }) =>
      createElement(web.Pattern, { ...props, overflow: 'hidden' }, children),
  };
});
vi.mock('../../src/drawing/CrayonGlaze.tsx', () => import('../../src/drawing/CrayonGlaze.web.tsx'));
const { Svg, Rect } = await import('react-native-svg');
const { Ink, InkArtwork } = await import('../../src/drawing/Ink.tsx');
const WIDTH = 1024;
const HEIGHT = 768;
function line(color = 'Red', seed = 20, y = 550) {
  return {
    brush: 'crayon',
    width: 34,
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
    { width: WIDTH, height: HEIGHT },
    createElement(Rect, { width: WIDTH, height: HEIGHT, fill: '#ffffff' }),
    createElement(
      InkAppearanceScope.Provider,
      { value: { pageId: 'blank', theme: 'light' } },
      createElement(
        InkArtwork,
        { strokes },
        ...strokes.map((stroke, index) => createElement(Ink, { key: index, stroke }))
      )
    )
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
function href(tag) {
  return tag.href ?? tag['xlink:href'];
}
function raster(svg) {
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
}
describe('production Crayon PNG tile references (web renderer)', () => {
  it('defines one exact PNG Image per used pigment and band', () => {
    const svg = renderToStaticMarkup(scene([line('Blue'), line('Blue', 21, 650)]));
    const images = tags(svg, 'image');
    expect(images).toHaveLength(CRAYON_BANDS.length);
    expect(images.map(href)).toEqual(
      CRAYON_BANDS.map((_, index) => crayonTileUri(paletteHex('Blue'), index))
    );
    expect(
      images.every(
        (image) => image.width === String(CRAYON_TILE_PX) && image.height === String(CRAYON_TILE_PX)
      )
    ).toBe(true);
  });
  it('wraps every contained seeded phase into four copies per band', () => {
    const stroke = line();
    const svg = renderToStaticMarkup(scene([stroke]));
    const phase = crayonPhase(crayonPasses(stroke, stroke.width)[0].seed);
    const expected = [0, -CRAYON_TILE_PX].flatMap((x) =>
      [0, -CRAYON_TILE_PX].map((y) => `translate(${phase.x + x} ${phase.y + y})`)
    );
    const transforms = tags(svg, 'g')
      .filter((group) => group.transform)
      .map((group) => group.transform);
    expect(transforms).toEqual(CRAYON_BANDS.flatMap(() => ['scale(1)', ...expected]));
    const ids = new Set(tags(svg, 'image').map((image) => image.id));
    expect(tags(svg, 'use')).toHaveLength(CRAYON_BANDS.length * 4);
    expect(tags(svg, 'use').every((use) => ids.has(href(use).slice(1)))).toBe(true);
  });
  it('keeps definition IDs distinct across pigments and SVG roots', () => {
    const strokes = [line('Red'), line('Blue', 21, 650)];
    const svg = renderToStaticMarkup(createElement(Fragment, null, scene(strokes), scene(strokes)));
    const ids = [...svg.matchAll(/\bid="([^"]*)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tags(svg, 'image')).toHaveLength(strokes.length * CRAYON_BANDS.length * 2);
  });
  it('detects missing tile references and changed pigment in rendered output', async () => {
    const original = renderToStaticMarkup(scene([line()]));
    const missing = original.replace(/(?:xlink:)?href="#[^"]*"/g, 'href="#missing-wax"');
    const changed = original.replaceAll(
      crayonTileUri(paletteHex('Red'), 0),
      crayonTileUri(paletteHex('Blue'), 0)
    );
    const bytes = await raster(original);
    expect((await raster(missing)).equals(bytes)).toBe(false);
    expect((await raster(changed)).equals(bytes)).toBe(false);
  });
  it('detects removal of a wrapped tile quadrant', async () => {
    const original = renderToStaticMarkup(scene([line()]));
    const phase = crayonPhase(crayonPasses(line(), 34)[0].seed);
    const transform = `translate(${phase.x - CRAYON_TILE_PX} ${phase.y - CRAYON_TILE_PX})`;
    const removed = original.replace(
      /<g\b[^>]*transform="translate\([^"]*\)"[^>]*>\s*<use\b[^>]*(?:\/>|><\/use>)\s*<\/g>/g,
      (tag) => (tag.includes(`transform="${transform}"`) ? '' : tag)
    );
    expect(removed).not.toBe(original);
    expect((await raster(removed)).equals(await raster(original))).toBe(false);
  });
  it('requires the Artwork-owned definitions for live and committed Crayon', () => {
    expect(() => renderToStaticMarkup(createElement(Ink, { stroke: line() }))).toThrow(
      'InkArtwork definition scope'
    );
  });
});
