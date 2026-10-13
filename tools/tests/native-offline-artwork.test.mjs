// @vitest-environment happy-dom
import { CANONICAL_PAPER_SIZE } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { URL, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { OfflineArtworkScope } from '../../experiments/native-architecture/src/offlineLibrary/artworkContext.ts';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import {
  PAPER_WIDTH,
  PAPER_HEIGHT,
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock(
  'react-native-svg/lib/module/elements',
  () => import('react-native-svg/lib/module/elements.web.js')
);
vi.mock('react-native-svg', async () => ({
  ...(await import('react-native-svg/lib/module/elements.web.js')),
  SvgXml: (await import('react-native-svg/lib/module/xml.js')).SvgXml,
}));
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);
const { Svg, Rect } = await import('react-native-svg');
const { PageOutline } =
  await import('../../experiments/native-architecture/src/drawing/PageOutline.tsx');
const { InkScene } = await import('../../experiments/native-architecture/src/drawing/InkScene.tsx');
const { OfflineMagicFill } =
  await import('../../experiments/native-architecture/src/offlineLibrary/artwork.tsx');
const pack = catalogPack('dinosaur', 'full');
const pageId = offlinePageId(pack, 'trex');
const staticRoot = pathToFileURL(`${resolve(process.cwd(), 'web/static/coloring/dinosaur')}/`);
async function artwork() {
  const variant = async (slug, dark) => ({
    outline: await readFile(
      new URL(`trex-${slug}${dark ? '.dark' : ''}.overlay.svg`, staticRoot),
      'utf8'
    ),
    fill: `data:image/png;base64,${(
      await sharp(
        await readFile(new URL(`trex-${slug}.${dark ? 'night' : 'light'}.webp`, staticRoot))
      )
        .png()
        .toBuffer()
    ).toString('base64')}`,
  });
  const themes = async (slug) => ({
    light: await variant(slug, false),
    dark: await variant(slug, true),
  });
  return { landscape: await themes('wide'), portrait: await themes('tall') };
}
function render(art, theme, content) {
  return renderToStaticMarkup(
    createElement(
      Svg,
      { width: PAPER_WIDTH, height: PAPER_HEIGHT, viewBox: `0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}` },
      createElement(
        OfflineArtworkScope.Provider,
        { value: { [pageId]: art } },
        createElement(InkAppearanceScope.Provider, { value: { pageId, theme } }, content)
      )
    )
  );
}
async function pixels(source) {
  return sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

describe('downloaded Dinosaurs artwork through actual paper and export consumers', () => {
  it.each(['light', 'dark'])(
    'renders the canonical %s outline with the released SvgXml parser',
    async (theme) => {
      const art = await artwork();
      const actual = await pixels(
        render(art, theme, createElement(PageOutline, { pageId, size: CANONICAL_PAPER_SIZE }))
      );
      const expected = await pixels(
        art.landscape[theme].outline.replace(
          'width="1536" height="1024"',
          `width="${PAPER_WIDTH}" height="${PAPER_HEIGHT}"`
        )
      );
      expect(actual.info).toEqual(expected.info);
      expect(actual.data.equals(expected.data)).toBe(true);
      expect(actual.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      const missing = {
        ...art,
        landscape: {
          ...art.landscape,
          [theme]: {
            ...art.landscape[theme],
            outline: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" />',
          },
        },
      };
      expect(
        (
          await pixels(
            render(
              missing,
              theme,
              createElement(PageOutline, { pageId, size: CANONICAL_PAPER_SIZE })
            )
          )
        ).data.equals(expected.data)
      ).toBe(false);
    }
  );
  it('uses the private revision fill URI and paints Magic under the same canonical export outline', async () => {
    const art = await artwork();
    const privateArt = {
      ...art,
      landscape: {
        ...art.landscape,
        light: {
          ...art.landscape.light,
          fill: 'file:///private/coloring/dinosaur-revision/files/trex-wide.light.webp',
        },
      },
    };
    expect(
      render(
        privateArt,
        'light',
        createElement(OfflineMagicFill, { pageId, theme: 'light', size: CANONICAL_PAPER_SIZE })
      )
    ).toContain(privateArt.landscape.light.fill);
    const stroke = {
      ...strokeStyle('magic', 'Blue', emptyDrawing()),
      points: [
        { x: 200, y: 300 },
        { x: 800, y: 300 },
      ],
    };
    const picture = (strokes) =>
      render(art, 'light', [
        createElement(Rect, {
          key: 'paper',
          width: PAPER_WIDTH,
          height: PAPER_HEIGHT,
          fill: 'white',
        }),
        createElement(InkScene, { key: 'ink', strokes, checkpoint: null, onImageLoad() {} }),
        createElement(PageOutline, { key: 'outline', pageId, size: CANONICAL_PAPER_SIZE }),
      ]);
    const before = await pixels(picture([]));
    const painted = await pixels(picture([stroke]));
    expect(painted.info).toEqual(before.info);
    expect(painted.data.equals(before.data)).toBe(false);
    const reopened = structuredClone(art);
    expect(
      (
        await pixels(
          render(reopened, 'light', [
            createElement(Rect, {
              key: 'paper',
              width: PAPER_WIDTH,
              height: PAPER_HEIGHT,
              fill: 'white',
            }),
            createElement(InkScene, {
              key: 'ink',
              strokes: [stroke],
              checkpoint: null,
              onImageLoad() {},
            }),
            createElement(PageOutline, { key: 'outline', pageId, size: CANONICAL_PAPER_SIZE }),
          ])
        )
      ).data.equals(painted.data)
    ).toBe(true);
  });
});
