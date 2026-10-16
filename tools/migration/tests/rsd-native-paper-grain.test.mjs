import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { records, root, host, mount } from './rsd-native-selection-host.mjs';
import { flat } from './rsd-native-toolbar-fixture.mjs';
import { PaperTexture } from '../../../experiments/native-architecture/src/drawing/PaperTexture.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { NativeFrame } from '../../../experiments/native-architecture/src/rsdDrawing/NativeFrame.tsx';
import { PAPER_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');

// Every shipping surface that paints the grain (paperTexture.test.ts's consumers).
const PAPER_SITES = [
  'web/src/lib/components/DrawingCanvas.svelte',
  'web/src/lib/components/BareToolbarPaper.svelte',
  'web/src/lib/components/GlassPanes.svelte',
  'web/src/app.css',
];

// Shipping's paper rules size no background, so a CSS tile spans the image's own pixels in CSS
// pixels. Natively a repeating image tiles in device pixels, a third of that on a 3x phone.
// Negative control: a grain laid out at the paper's own size, unscaled, fails at every density
// above 1.
it.each([1, 2, 3, 3.5])(
  'tiles the paper grain one image pixel per point on a %sx screen, as shipping does per CSS pixel',
  async (density) => {
    for (const site of PAPER_SITES) {
      const rules = read(site)
        .split('}')
        .filter((rule) => rule.includes('var(--paper-texture)'));
      expect(rules.length, site).toBeGreaterThan(0);
      expect(
        rules.filter((rule) => rule.includes('background-size')),
        site
      ).toEqual([]);
    }
    records.dimensions = { width: 402, height: 874, scale: density, fontScale: 1 };
    records.props.length = 0;
    const element = createElement(PaperTexture);
    if (!root) await mount(element);
    else await act(async () => root.render(element));
    const grain = flat(records.props.findLast((props) => props.testID === 'paper-grain').style);
    const tile = await sharp(readFileSync(join(REPOSITORY, 'web/src/lib/assets/handmade-paper.webp')))
      .metadata();
    expect(grain.minWidth * density).toBe(tile.width);
    expect(grain.minHeight * density).toBe(tile.height);
    expect(grain).toMatchObject({ transform: [{ scale: density }], transformOrigin: 'top left' });
    for (const extent of [grain.width, grain.height]) {
      const covered = Number.parseFloat(extent) * density;
      expect(covered).toBeGreaterThanOrEqual(100);
      expect(covered).toBeLessThan(100 + density / 100 + Number.EPSILON);
    }
    expect(
      flat(records.props.findLast((props) => props.testID === 'paper-texture').style)
    ).toMatchObject({ overflow: 'hidden' });
    records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
  }
);

// Shipping's Flat container grains its padded strips. A full-window texture adds another layer
// under every stroke; stripping the frame's grain entirely leaves those strips solid.
it.each(['light', 'dark'])(
  'grains only Flat safe-area strips in %s, under the content and Notch Band',
  async (theme) => {
    const app = read('web/src/app.css');
    expect(
      /html\[data-toolbar='bare'\] \.app-container \{\s*background:\s*([^;]+);/.exec(app)[1]
    ).toBe('var(--paper) var(--paper-texture)');
    records.insets = { top: 24, right: 44, bottom: 34, left: 44 };
    records.props.length = 0;
    await mount(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(
          NativeFrame,
          {
            variant: 'flatDrawing',
            edges: createElement('i', { 'data-testid': 'notch-band' }),
          },
          createElement('i', { 'data-testid': 'drawing-content' })
        )
      )
    );
    const provider = host.querySelector('[data-safe-area-kind="provider"]');
    const strips = [...provider.querySelectorAll('[data-testid^="rsd-safe-area-grain-"]')];
    expect(strips.map((node) => node.dataset.testid)).toEqual([
      'rsd-safe-area-grain-top',
      'rsd-safe-area-grain-left',
      'rsd-safe-area-grain-right',
    ]);
    const boxes = strips.map((node) =>
      flat(records.props.findLast((props) => props.testID === node.dataset.testid).style)
    );
    expect(boxes).toEqual([
      { position: 'absolute', overflow: 'hidden', top: 0, left: 0, right: 0, height: 24 },
      { position: 'absolute', overflow: 'hidden', top: 24, left: 0, bottom: 0, width: 44 },
      { position: 'absolute', overflow: 'hidden', top: 24, right: 0, bottom: 0, width: 44 },
    ]);
    for (const strip of strips) {
      expect(strip.querySelector('[data-testid="paper-grain"]')).not.toBeNull();
      expect(
        records.props.findLast((props) => props.testID === strip.dataset.testid).pointerEvents
      ).toBe('none');
    }
    expect(
      records.props
        .filter((props) => props.testID === 'paper-texture')
        .map((props) => flat(props.style).backgroundColor)
    ).toEqual([PAPER_THEMES[theme].paper, PAPER_THEMES[theme].paper, PAPER_THEMES[theme].paper]);
    expect([...provider.children].slice(-2).map((node) => node.dataset.testid)).toEqual([
      'rsd-safe-area-frame',
      'notch-band',
    ]);
  }
);

it.each(['screen', 'drawing', 'flatDrawing', 'overlay'])(
  'adds no safe-area grain to an uninset %s frame',
  async (variant) => {
    records.insets = { top: 0, right: 0, bottom: 34, left: 0 };
    await mount(createElement(NativeFrame, { variant }, createElement('i')));
    expect(host.querySelectorAll('[data-testid^="rsd-safe-area-grain-"]')).toHaveLength(0);
    expect(host.querySelector('[data-testid="paper-texture"]')).toBeNull();
  }
);

it.each(['screen', 'drawing', 'overlay'])(
  'keeps the existing plain surface of an inset %s frame',
  async (variant) => {
    records.insets = { top: 24, right: 44, bottom: 34, left: 44 };
    await mount(createElement(NativeFrame, { variant }, createElement('i')));
    expect(host.querySelectorAll('[data-testid^="rsd-safe-area-grain-"]')).toHaveLength(0);
    expect(host.querySelector('[data-testid="paper-texture"]')).toBeNull();
  }
);
