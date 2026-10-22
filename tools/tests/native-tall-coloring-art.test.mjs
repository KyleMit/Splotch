// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { URL, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  adoptPaper,
  artOrientation,
  CANONICAL_PAPER_SIZE,
  paperSize,
  presentedPaperSize,
  UNADOPTED_PAPER,
} from '../../src/drawing/paperSpace.ts';
import { bookFillPlacement } from '../../src/drawing/bookFill.ts';
import { bundledFill, bundledOutline } from '../../src/drawing/bundledBookAssets.ts';
import { BUNDLED_FARM_IMAGES } from '../../src/drawing/bundledFarm/images.ts';
import { FARM_PAGE_IDS } from '../../src/drawing/bundledBooks.ts';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import { InkPaperScope } from '../../src/drawing/InkPaper.tsx';
import { OfflineArtworkScope } from '../../src/offlineLibrary/artworkContext.ts';
import { catalogPack } from '../../src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../src/offlineLibrary/identity.ts';
import { emptyDrawing, strokeStyle } from '../../src/drawing/model.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock(
  'react-native-svg/lib/module/elements',
  () => import('react-native-svg/lib/module/elements.web.js')
);
vi.mock('react-native-svg', async () => ({
  ...(await import('react-native-svg/lib/module/elements.web.js')),
  SvgXml: (await import('react-native-svg/lib/module/xml.js')).SvgXml,
}));
vi.mock('../../src/drawing/CrayonGlaze.tsx', () => import('../../src/drawing/CrayonGlaze.web.tsx'));
const { Svg, Rect } = await import('react-native-svg');
const { PageOutline } = await import('../../src/drawing/PageOutline.tsx');
const { InkScene } = await import('../../src/drawing/InkScene.tsx');
const { BundledMagicFill } = await import('../../src/drawing/BundledBookArtwork.tsx');
const { OfflineMagicFill } = await import('../../src/offlineLibrary/artwork.tsx');
const { loadNativePageOutlines } = await import('./native-bundled-outlines-fixture.mjs');
// The native line art loads on first use; the static renders below draw it once loaded.
const BUNDLED_BOOK_OUTLINES = await loadNativePageOutlines(FARM_PAGE_IDS);

// The paper area beside the swatch bar on a 390x844 phone held upright, and the same phone
// turned on its side.
const PORTRAIT_FRAME = { width: 390, height: 704 };
const LANDSCAPE_FRAME = { width: 844, height: 300 };
const PORTRAIT_PAPER = adoptPaper(PORTRAIT_FRAME.width, PORTRAIT_FRAME.height, 3);
const PORTRAIT_SIZE = paperSize(PORTRAIT_PAPER);
const TALL_FRAME = { width: 1024, height: 1536 };
const WIDE_FRAME = { width: 1536, height: 1024 };
// The flat sky and grass of a lossless fill, compared after SVG resampling.
const COLOR_TOLERANCE = 12;
// A band must lie under the fill's antialiased edge for at least one paper unit, a whole pixel
// at the 1:1 render below; bookFill.ts underlap carries each band to the picture's middle.
const MIN_UNDERLAP_UNITS = 1;
// The tall Cat sheet the seam was measured on, and presentations far smaller than its semantic
// size: a thumbnail, a small window, and one between them.
const SMALL_SHEET_PAPER = { width: 567, height: 1024 };
const SMALL_PRESENTATIONS = [
  { width: 42, height: 75 },
  { width: 100, height: 180 },
  { width: 189, height: 341 },
];

const pack = catalogPack('dinosaur', 'full');
const trex = offlinePageId(pack, 'trex');
const staticRoot = pathToFileURL(`${resolve(process.cwd(), 'assets/static/coloring/dinosaur')}/`);
const sources = new Map();
async function source(name) {
  if (!sources.has(name)) sources.set(name, await readFile(new URL(name, staticRoot)));
  return sources.get(name);
}
async function offlineArtwork() {
  const variant = async (slug) => ({
    outline: (await source(`trex-${slug}.overlay.svg`)).toString('utf8'),
    fill: `data:image/png;base64,${(
      await sharp(await source(`trex-${slug}.light.webp`))
        .png()
        .toBuffer()
    ).toString('base64')}`,
  });
  const light = async (slug) => {
    const art = await variant(slug);
    return { light: art, dark: art };
  };
  return { landscape: await light('wide'), portrait: await light('tall') };
}

function scoped(content, { pageId, paper, artwork = {} }) {
  return createElement(
    OfflineArtworkScope.Provider,
    { value: artwork },
    createElement(
      InkAppearanceScope.Provider,
      { value: { pageId, theme: 'light' } },
      createElement(InkPaperScope.Provider, { value: paper }, content)
    )
  );
}

function picture(size, content, scope, presented = size) {
  return renderToStaticMarkup(
    createElement(
      Svg,
      {
        width: presented.width,
        height: presented.height,
        viewBox: `0 0 ${size.width} ${size.height}`,
      },
      scoped(content, scope)
    )
  );
}

// The device pixels lying wholly on the paper when it is contain-fitted into the presentation.
function sheetPixels(size, presented) {
  const scale = Math.min(presented.width / size.width, presented.height / size.height);
  const span = (outer, extent) => {
    const start = (outer - extent * scale) / 2;
    return [Math.ceil(start), Math.floor(start + extent * scale)];
  };
  return { columns: span(presented.width, size.width), rows: span(presented.height, size.height) };
}

function translucentPixels(sheet, { columns, rows }) {
  const found = [];
  for (let y = rows[0]; y < rows[1]; y += 1)
    for (let x = columns[0]; x < columns[1]; x += 1) {
      const alpha = pixelAt(sheet, x, y)[3];
      if (alpha !== 255 && found.length < 4) found.push({ x, y, alpha });
    }
  return found;
}

async function pixels(markup) {
  return sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function pixelAt({ data, info }, x, y) {
  const offset = (Math.round(y) * info.width + Math.round(x)) * 4;
  return [...data.subarray(offset, offset + 4)];
}

describe('coloring art follows the paper orientation (ADR-0050 native amendment)', () => {
  it.each([
    ['an upright phone', PORTRAIT_SIZE, 'portrait'],
    ['a phone on its side', paperSize(adoptPaper(844, 300, 3)), 'landscape'],
    ['the canonical sheet', CANONICAL_PAPER_SIZE, 'landscape'],
    ['a square paper, as the shipping picker', paperSize(adoptPaper(800, 800, 2)), 'portrait'],
    [
      'a blank page on an upright phone',
      presentedPaperSize(UNADOPTED_PAPER, PORTRAIT_FRAME),
      'portrait',
    ],
    [
      'a blank page on a phone on its side',
      presentedPaperSize(UNADOPTED_PAPER, LANDSCAPE_FRAME),
      'landscape',
    ],
  ])('uses the %s art for %j', (_label, size, orientation) => {
    expect(artOrientation(size)).toBe(orientation);
    for (const pageId of FARM_PAGE_IDS) {
      const outlines = BUNDLED_BOOK_OUTLINES[pageId];
      expect(bundledOutline(outlines, 'light', size)).toBe(outlines[orientation].light);
      expect(bundledFill(pageId, 'light', size)).toBe(
        BUNDLED_FARM_IMAGES[pageId][orientation].light
      );
    }
  });

  it.each([
    [PORTRAIT_SIZE, 'viewBox="0 0 1024 1536"', 'portrait'],
    [CANONICAL_PAPER_SIZE, 'viewBox="0 0 1536 1024"', 'landscape'],
  ])(
    'draws the bundled outline and Magic fill from the same variant on %j',
    (size, viewBox, orientation) => {
      const scope = { pageId: 'farm/horse', paper: PORTRAIT_PAPER };
      expect(
        picture(size, createElement(PageOutline, { pageId: 'farm/horse', size }), scope)
      ).toContain(viewBox);
      const fill = picture(
        size,
        createElement(BundledMagicFill, { pageId: 'farm/horse', theme: 'light', size }),
        scope
      );
      const other = orientation === 'portrait' ? 'landscape' : 'portrait';
      expect(fill).toContain(BUNDLED_FARM_IMAGES['farm/horse'][orientation].light);
      expect(fill).not.toContain(BUNDLED_FARM_IMAGES['farm/horse'][other].light);
    }
  );

  it('draws the tall dark Dog outline, including its circle, exactly as the canonical SVG', async () => {
    const size = { width: 1024, height: 1536 };
    const actual = await pixels(
      renderToStaticMarkup(
        createElement(
          Svg,
          { width: size.width, height: size.height, viewBox: `0 0 ${size.width} ${size.height}` },
          createElement(
            InkAppearanceScope.Provider,
            { value: { pageId: 'farm/dog', theme: 'dark' } },
            createElement(PageOutline, { pageId: 'farm/dog', size })
          )
        )
      )
    );
    const canonical = await readFile(
      resolve(process.cwd(), 'assets/static/coloring/farm/dog-tall.dark.overlay.svg')
    );
    const expected = await pixels(canonical);
    expect(actual.info).toEqual(expected.info);
    let differing = 0;
    for (let index = 3; index < actual.data.length; index += 4)
      if (Math.abs(actual.data[index] - expected.data[index]) > COLOR_TOLERANCE) differing += 1;
    expect(differing / (actual.data.length / 4)).toBeLessThan(0.001);
  });

  it('uses a downloaded book’s tall outline and fill on portrait paper', async () => {
    const artwork = await offlineArtwork();
    const scope = { pageId: trex, paper: PORTRAIT_PAPER, artwork: { [trex]: artwork } };
    const outline = picture(
      PORTRAIT_SIZE,
      createElement(PageOutline, { pageId: trex, size: PORTRAIT_SIZE }),
      scope
    );
    expect(outline).toContain('viewBox="0 0 1024 1536"');
    const fill = picture(
      PORTRAIT_SIZE,
      createElement(OfflineMagicFill, { pageId: trex, theme: 'light', size: PORTRAIT_SIZE }),
      scope
    );
    expect(fill).toContain(artwork.portrait.light.fill);
    expect(fill).not.toContain(artwork.landscape.light.fill);
  });
});

describe('Magic covers the whole paper on a book page', () => {
  it.each([
    ['tall art on portrait paper', PORTRAIT_SIZE, TALL_FRAME],
    ['wide art on portrait paper', PORTRAIT_SIZE, WIDE_FRAME],
    ['wide art on the canonical sheet', CANONICAL_PAPER_SIZE, WIDE_FRAME],
    ['tall art on a wide paper', paperSize(adoptPaper(844, 300, 3)), TALL_FRAME],
    ['tall art on a near-square tablet paper', paperSize(adoptPaper(768, 950, 2)), TALL_FRAME],
    ['wide art on a narrow phone paper', paperSize(adoptPaper(393, 700, 3)), WIDE_FRAME],
  ])('lays the fill over every point of %s, its bands reaching under it', (_label, size, frame) => {
    const placement = bookFillPlacement(size, frame);
    const box = { dx: placement.x, dy: placement.y, dw: placement.width, dh: placement.height };
    const rects = [box, ...placement.edges];
    const covered = (x, y) =>
      rects.some(
        (rect) => x >= rect.dx && x <= rect.dx + rect.dw && y >= rect.dy && y <= rect.dy + rect.dh
      );
    const seams = (start, extent) =>
      [start, start + extent].flatMap((edge) =>
        Array.from({ length: 65 }, (_, index) => edge - 1 + index / 32)
      );
    const across = (extent) => Array.from({ length: 33 }, (_, index) => (extent * index) / 32);
    const onPaper = (values, extent) => values.filter((value) => value >= 0 && value <= extent);
    const rows = onPaper(
      [...across(size.height), ...seams(placement.y, placement.height)],
      size.height
    );
    const columns = onPaper(
      [...across(size.width), ...seams(placement.x, placement.width)],
      size.width
    );
    for (const y of rows)
      for (const x of columns) expect(covered(x, y), `(${x}, ${y}) is outside the fill`).toBe(true);
    const overlap = (start, extent, boxStart, boxExtent) =>
      Math.min(start + extent, boxStart + boxExtent) - Math.max(start, boxStart);
    for (const edge of placement.edges)
      expect(
        Math.min(
          overlap(edge.dx, edge.dw, box.dx, box.dw),
          overlap(edge.dy, edge.dh, box.dy, box.dh)
        )
      ).toBeGreaterThanOrEqual(MIN_UNDERLAP_UNITS);
    for (const edge of placement.edges) {
      expect(edge.sx).toBeGreaterThanOrEqual(0);
      expect(edge.sy).toBeGreaterThanOrEqual(0);
      expect(edge.sx + edge.sw).toBeLessThanOrEqual(frame.width);
      expect(edge.sy + edge.sh).toBeLessThanOrEqual(frame.height);
    }
  });

  it.each([
    ['tall art on portrait paper', PORTRAIT_SIZE, 'portrait'],
    ['wide art on a narrow phone paper', paperSize(adoptPaper(393, 700, 3)), 'landscape'],
    ['tall art on a near-square tablet paper', paperSize(adoptPaper(768, 950, 2)), 'portrait'],
  ])(
    'renders an opaque Magic sheet with no seam where a band meets the fill: %s',
    async (_label, size) => {
      const artwork = await offlineArtwork();
      const scope = { pageId: trex, paper: PORTRAIT_PAPER, artwork: { [trex]: artwork } };
      const sheet = await pixels(
        picture(
          size,
          createElement(OfflineMagicFill, { pageId: trex, theme: 'light', size }),
          scope
        )
      );
      expect(sheet.info).toMatchObject({ width: size.width, height: size.height });
      expect(translucentPixels(sheet, sheetPixels(size, size))).toEqual([]);
    }
  );

  it.each(SMALL_PRESENTATIONS)(
    'keeps every join opaque when the tall sheet is presented at %j',
    async (presented) => {
      const artwork = await offlineArtwork();
      const scope = { pageId: trex, paper: PORTRAIT_PAPER, artwork: { [trex]: artwork } };
      const size = SMALL_SHEET_PAPER;
      const sheet = await pixels(
        picture(
          size,
          createElement(OfflineMagicFill, { pageId: trex, theme: 'light', size }),
          scope,
          presented
        )
      );
      expect(sheet.info).toMatchObject(presented);
      expect(translucentPixels(sheet, sheetPixels(size, presented))).toEqual([]);
    }
  );

  it('reveals the tall fill’s edge colour in both letterbox bands of a portrait picture', async () => {
    const artwork = await offlineArtwork();
    const drawing = { ...emptyDrawing(0, trex), paper: PORTRAIT_PAPER };
    const placement = bookFillPlacement(PORTRAIT_SIZE, TALL_FRAME);
    const bands = [placement.y / 2, placement.y + placement.height + placement.y / 2];
    const strokes = bands.map((y) => ({
      ...strokeStyle('magic', 'Blue', drawing, 'thick'),
      // Strokes end at their last sample midpoint, so dense samples carry ink near the end.
      points: Array.from({ length: 33 }, (_, index) => ({
        x: 40 + ((PORTRAIT_SIZE.width - 80) * index) / 32,
        y,
      })),
    }));
    const scope = { pageId: trex, paper: PORTRAIT_PAPER, artwork: { [trex]: artwork } };
    const render = (ink) =>
      pixels(
        picture(
          PORTRAIT_SIZE,
          [
            createElement(Rect, {
              key: 'paper',
              width: PORTRAIT_SIZE.width,
              height: PORTRAIT_SIZE.height,
              fill: 'white',
            }),
            createElement(InkScene, {
              key: 'ink',
              strokes: ink,
              checkpoint: null,
              onImageLoad() {},
            }),
          ],
          scope
        )
      );
    const blank = await render([]);
    const painted = await render(strokes);
    const fill = await sharp(await source('trex-tall.light.webp'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const [index, y] of bands.entries()) {
      const edge = placement.edges[index];
      for (const x of [80, PORTRAIT_SIZE.width / 2, PORTRAIT_SIZE.width - 80]) {
        expect(pixelAt(blank, x, y)).toEqual([255, 255, 255, 255]);
        const revealed = pixelAt(painted, x, y);
        const sourceX = ((x - placement.x) / placement.width) * TALL_FRAME.width;
        const expected = pixelAt(fill, sourceX, edge.sy + edge.sh / 2);
        expect(revealed[3]).toBe(255);
        for (let channel = 0; channel < 3; channel += 1)
          expect(Math.abs(revealed[channel] - expected[channel])).toBeLessThanOrEqual(
            COLOR_TOLERANCE
          );
        expect(revealed.slice(0, 3)).not.toEqual([255, 255, 255]);
      }
    }
  });
});
