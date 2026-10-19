import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { caller, records, root, host, mount } from './rsd-native-selection-host.mjs';
import {
  HOME,
  commitClear,
  drag,
  inkedDrawing,
  layout,
  lift,
  mountClear,
  offset,
  press,
  radius,
  settle,
} from './rsd-native-clear-fixture.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { CLEAR_SHEET_DURATION_MS } from '../../../experiments/native-architecture/src/clear/dragToClear.ts';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { Animated } from '../../../experiments/native-architecture/src/platform/animated.ts';
import { adoptPaper } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  fittedPaper,
  paperLifted,
} from '../../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { displayOrientation, Orientation } from './rsd-orientation-port.mjs';
import { flat } from './rsd-native-toolbar-fixture.mjs';
import { PaperTexture } from '../../../experiments/native-architecture/src/drawing/PaperTexture.tsx';
import { PaperTexture as WebPaperTexture } from '../../../experiments/native-architecture/src/drawing/PaperTexture.web.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { NativeFrame } from '../../../experiments/native-architecture/src/rsdDrawing/NativeFrame.tsx';
import { RsdNotchBand } from '../../../experiments/native-architecture/src/rsdDrawing/RsdNotchBand.tsx';
import { paletteHex } from '../../../experiments/native-architecture/src/drawing/palette.ts';
import { PAPER_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
const committedStyle = (node) => JSON.parse(node.dataset.committedProps).style;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    const tile = await sharp(
      readFileSync(join(REPOSITORY, 'web/src/lib/assets/handmade-paper.webp'))
    ).metadata();
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

it.each(['light', 'dark'].flatMap((theme) => [0, 48].map((rightInset) => ({ theme, rightInset }))))(
  'keeps intrinsic web grain through theme and inset rerenders from $theme at right inset $rightInset',
  async ({ theme, rightInset }) => {
    await mount(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(WebPaperTexture, { rightInset })
      )
    );
    const paper = host.querySelector('[data-testid="paper-texture"]');
    const color = document.createElement('div');
    color.style.backgroundColor = PAPER_THEMES[theme].paper;
    expect(paper.style.backgroundColor).toBe(color.style.backgroundColor);
    expect(paper.style.backgroundImage).toMatch(/handmade-paper\.webp/);
    expect(paper.style.backgroundSize).toMatch(/^(auto|initial)$/);
    expect(paper.style.backgroundRepeat).toMatch(/^(repeat|initial)$/);
    expect(paper.style.backgroundPosition).toMatch(
      rightInset ? /^calc\(48px - 100vw\) 0(?:px|%)?$/ : /^(0% 0%|0px 0px|initial)$/
    );
    expect(paper.style.pointerEvents).toBe('none');
    expect(paper.style.transform).toBe('');
    expect(paper.querySelector('img')).toBeNull();
    const changedTheme = theme === 'light' ? 'dark' : 'light';
    const changedInset = rightInset ? 24 : 48;
    for (const inset of [rightInset, changedInset, changedInset]) {
      await act(async () =>
        root.render(
          createElement(
            DrawingAppearanceProvider,
            { preference: changedTheme },
            createElement(WebPaperTexture, { rightInset: inset })
          )
        )
      );
      expect(host.querySelector('[data-testid="paper-texture"]')).toBe(paper);
      color.style.backgroundColor = PAPER_THEMES[changedTheme].paper;
      expect(paper.style.backgroundColor).toBe(color.style.backgroundColor);
      expect(paper.style.backgroundPosition).toMatch(
        inset
          ? new RegExp(`^calc\\(${inset}px - 100vw\\) 0(?:px|%)?$`)
          : /^(0% 0%|0px 0px|initial)$/
      );
    }
  }
);

const PURPLE = paletteHex('Purple');
const INSET_CASES = [
  {
    name: 'corner inset fixture',
    insets: { top: 24, right: 44, bottom: 34, left: 44 },
    dimensions: { width: 874, height: 402, scale: 3, fontScale: 1 },
    edges: ['top', 'left', 'right'],
    boxes: [
      { position: 'absolute', overflow: 'hidden', top: 0, left: 0, right: 0, height: 24 },
      { position: 'absolute', overflow: 'hidden', top: 0, left: 0, bottom: 0, width: 44 },
      { position: 'absolute', overflow: 'hidden', top: 0, right: 0, bottom: 0, width: 44 },
    ],
    bandColors: ['transparent', PURPLE, PURPLE],
  },
  {
    name: 'iPhone landscape inset fixture',
    insets: { top: 0, right: 62, bottom: 21, left: 62 },
    dimensions: { width: 874, height: 402, scale: 3, fontScale: 1 },
    edges: ['left', 'right'],
    boxes: [
      { position: 'absolute', overflow: 'hidden', top: 0, left: 0, bottom: 0, width: 62 },
      { position: 'absolute', overflow: 'hidden', top: 0, right: 0, bottom: 0, width: 62 },
    ],
    bandColors: ['transparent', PURPLE, PURPLE],
  },
  {
    name: 'asymmetric landscape inset fixture',
    insets: { top: 0, right: 48, bottom: 20, left: 36 },
    dimensions: { width: 1210, height: 834, scale: 3, fontScale: 1 },
    orientation: Orientation.LANDSCAPE_RIGHT,
    edges: ['left', 'right'],
    boxes: [
      { position: 'absolute', overflow: 'hidden', top: 0, left: 0, bottom: 0, width: 36 },
      { position: 'absolute', overflow: 'hidden', top: 0, right: 0, bottom: 0, width: 48 },
    ],
    bandColors: ['transparent', PURPLE, 'transparent'],
  },
  {
    name: 'iPad landscape inset fixture',
    insets: { top: 32, right: 0, bottom: 20, left: 0 },
    dimensions: { width: 1210, height: 834, scale: 2, fontScale: 1 },
    edges: ['top'],
    boxes: [{ position: 'absolute', overflow: 'hidden', top: 0, left: 0, right: 0, height: 32 }],
    bandColors: ['transparent', 'transparent', 'transparent'],
  },
  {
    name: 'small status-bar inset fixture',
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
    dimensions: { width: 1024, height: 768, scale: 2, fontScale: 1 },
    edges: ['top'],
    boxes: [{ position: 'absolute', overflow: 'hidden', top: 0, left: 0, right: 0, height: 24 }],
    bandColors: ['transparent', 'transparent', 'transparent'],
  },
];

// Shipping's Flat container grains its padded strips. A full-window texture adds another layer
// under every stroke; stripping the frame's grain entirely leaves those strips solid.
it.each(
  INSET_CASES.flatMap((profile) => ['light', 'dark'].map((theme) => ({ ...profile, theme })))
)(
  'grains only Flat safe-area strips for $name in $theme, under the content and Notch Band',
  async ({ theme, insets, dimensions, orientation, edges, boxes, bandColors }) => {
    const app = read('web/src/app.css');
    expect(
      /html\[data-toolbar='bare'\] \.app-container \{\s*background:\s*([^;]+);/.exec(app)[1]
    ).toBe('var(--paper) var(--paper-texture)');
    records.insets = insets;
    records.dimensions = dimensions;
    records.journalHostProps = true;
    displayOrientation.current = orientation ?? Orientation.PORTRAIT_UP;
    records.props.length = 0;
    await mount(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(
          NativeFrame,
          {
            variant: 'flatDrawing',
            edges: createElement(RsdNotchBand, { ink: PURPLE, eraser: false, layer: 'top' }),
          },
          createElement('i', { 'data-testid': 'drawing-content' })
        )
      )
    );
    const provider = host.querySelector('[data-safe-area-kind="provider"]');
    const strips = [...provider.querySelectorAll('[data-testid^="rsd-safe-area-grain-"]')];
    expect(strips.map((node) => node.dataset.testid)).toEqual(
      edges.map((edge) => `rsd-safe-area-grain-${edge}`)
    );
    expect(
      strips.map((node) =>
        flat(records.props.findLast((props) => props.testID === node.dataset.testid).style)
      )
    ).toEqual(boxes);
    for (const strip of strips) {
      const texture = strip.querySelector('[data-testid="paper-texture"]');
      expect(JSON.parse(texture.dataset.committedProps).style).toMatchObject({
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      });
      expect(strip.querySelector('[data-testid="paper-grain"]')).not.toBeNull();
      expect(
        records.props.findLast((props) => props.testID === strip.dataset.testid).pointerEvents
      ).toBe('none');
    }
    expect(
      records.props
        .filter((props) => props.testID === 'paper-texture')
        .map((props) => flat(props.style).backgroundColor)
    ).toEqual(edges.map(() => PAPER_THEMES[theme].paper));
    const tile = await sharp(
      readFileSync(join(REPOSITORY, 'web/src/lib/assets/handmade-paper.webp'))
    ).metadata();
    expect(
      records.props
        .filter((props) => props.testID === 'paper-grain-phase')
        .map((props) => flat(props.style).left)
    ).toEqual(
      edges.map((edge) =>
        edge === 'right' ? -((dimensions.width - insets.right) % tile.width) : 0
      )
    );
    const frame = provider.querySelector('[data-testid="rsd-safe-area-frame"]');
    expect([...provider.children].indexOf(strips.at(-1))).toBeLessThan(
      [...provider.children].indexOf(frame)
    );
    const siblings = [...provider.children];
    expect(
      siblings
        .slice(siblings.indexOf(frame) + 1)
        .filter((node) => node.dataset.committedProps !== undefined)
        .map((node) => JSON.parse(node.dataset.committedProps).style.backgroundColor)
    ).toEqual(bandColors.slice(0, 1));
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

it.each([
  { origin: { x: -84, y: -68 }, rightInset: 0 },
  { origin: { x: -380.5, y: -194.25 }, rightInset: 48 },
  { origin: { x: 310.5, y: 168.25 }, rightInset: 48 },
])(
  'composes frame grain origin $origin with right inset $rightInset on both targets',
  async (props) => {
    records.dimensions = { width: 1210, height: 834, scale: 3, fontScale: 1 };
    records.journalHostProps = true;
    await mount(
      createElement(
        'section',
        null,
        createElement(PaperTexture, props),
        createElement(WebPaperTexture, props)
      )
    );
    const phase = host.querySelector('[data-testid="paper-grain-phase"]');
    const texture = phase.parentElement;
    expect(committedStyle(texture)).toMatchObject({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      backgroundColor: PAPER_THEMES.light.paper,
    });
    const tile = await sharp(
      readFileSync(join(REPOSITORY, 'web/src/lib/assets/handmade-paper.webp'))
    ).metadata();
    const anchor = {
      x: props.origin.x + (props.rightInset ? records.dimensions.width - props.rightInset : 0),
      y: props.origin.y,
    };
    const native = committedStyle(phase);
    for (const [axis, offset, extent] of [
      ['x', 'left', tile.width],
      ['y', 'top', tile.height],
    ]) {
      expect(native[offset]).toBeLessThanOrEqual(0);
      expect(native[offset]).toBeGreaterThan(-extent);
      expect(((anchor[axis] + native[offset]) % extent) + 0).toBe(0);
    }
    expect(native).toMatchObject({ right: 0, bottom: 0 });
    expect(texture.nextElementSibling.style.backgroundPosition).toBe(
      `${props.rightInset ? `calc(${props.rightInset - props.origin.x}px - 100vw)` : `${-props.origin.x}px`} ${-props.origin.y}px`
    );
  }
);

it.each([
  {
    name: 'portrait negative top',
    window: { width: 402, height: 874 },
    column: { x: 0, y: 68, width: 402, height: 806 },
    lifted: false,
  },
  {
    name: 'landscape negative left',
    window: { width: 1210, height: 834 },
    column: { x: 84, y: 0, width: 1126, height: 834 },
    lifted: false,
  },
  {
    name: 'lifted portrait sheet in landscape',
    window: { width: 1210, height: 834 },
    column: { x: 84, y: 0, width: 1126, height: 834 },
    lifted: true,
  },
])(
  'keeps Clear grain aligned after an inked Bare-to-Buttons switch with $name',
  async ({ window, column, lifted }) => {
    records.dimensions = { ...window, scale: 3, fontScale: 1 };
    records.journalHostProps = true;
    storedSettings({ toolbarStyle: 'bare' });
    const drawing = {
      ...inkedDrawing(),
      paper: adoptPaper(lifted ? 402 : window.width, lifted ? 874 : window.height, 3),
    };
    const initial = fittedPaper(window, drawing.paper);
    const frame = { ...initial, left: initial.left - column.x, top: initial.top - column.y };
    vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn() });
    await mountClear({ drawing, clear: vi.fn(() => new Promise(() => {})) });
    await layout('rsd-drawing-layout', { x: 0, y: 0, ...window });
    await layout('rsd-canvas-column', { x: 0, y: 0, ...window });
    await layout('rsd-canvas-area', { x: 0, y: 0, ...window });
    expect(caller.product.sound.settings.toolbarStyle).toBe('bare');
    await act(async () => caller.product.sound.owner.settings.setToolbarStyle('buttons'));
    expect(caller.product.sound.settings.toolbarStyle).toBe('buttons');
    await layout('rsd-canvas-column', column);
    await layout('rsd-canvas-area', { x: 0, y: 0, width: column.width, height: column.height });
    await layout('rsd-clear-underlay', { x: 0, y: 0, width: column.width, height: column.height });
    expect(paperLifted(column, frame)).toBe(lifted);
    const slot = host.querySelector('[data-testid="rsd-paper-slot"]');
    expect(slot.querySelector('[data-testid="paper-grain-phase"]') === null).toBe(lifted);
    await commitClear();
    const tile = await sharp(
      readFileSync(join(REPOSITORY, 'web/src/lib/assets/handmade-paper.webp'))
    ).metadata();
    for (const id of ['rsd-clear-cover', 'rsd-clear-sheet']) {
      const paper = host.querySelector(`[data-testid="${id}"]`);
      expect(committedStyle(paper), id).toMatchObject(frame);
      const texture = paper.querySelector('[data-testid="paper-texture"]');
      expect(committedStyle(texture)).toMatchObject({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        backgroundColor: PAPER_THEMES.light.paper,
      });
      const phase = committedStyle(paper.querySelector('[data-testid="paper-grain-phase"]'));
      const origin = lifted ? { x: 0, y: 0 } : { x: frame.left, y: frame.top };
      expect(phase.left).toBe(0 - (((origin.x % tile.width) + tile.width) % tile.width));
      expect(phase.top).toBe(0 - (((origin.y % tile.height) + tile.height) % tile.height));
      expect(phase).toMatchObject({ right: 0, bottom: 0 });
    }
  }
);

it('keeps the prepared native grain image through release and removes it on cancellation or the flight deadline', async () => {
  records.journalHostProps = true;
  vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  await mountClear();
  expect(host.querySelector('[data-testid="rsd-clear-prepared-sheet"]')).toBeNull();
  vi.useFakeTimers();
  await press();
  const prepared = host.querySelector('[data-testid="rsd-clear-prepared-sheet"]');
  expect(prepared).not.toBeNull();
  const grain = prepared.querySelector('[data-testid="paper-grain"]');
  expect(committedStyle(prepared).opacity).toBe(0);
  expect(prepared.children).toHaveLength(1);
  const props = records.props.findLast((props) => props.testID === 'rsd-clear-prepared-sheet');
  expect(props).toMatchObject({
    pointerEvents: 'none',
    accessible: false,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
  await drag(offset(radius() / 2));
  expect(
    host.querySelector('[data-testid="rsd-clear-prepared-sheet"] [data-testid="paper-grain"]')
  ).toBe(grain);
  await lift(HOME);
  expect(host.querySelector('[data-testid="rsd-clear-prepared-sheet"]')).toBeNull();
  expect(grain.isConnected).toBe(false);
  expect(caller.screen.clear).not.toHaveBeenCalled();
  await press();
  const next = host.querySelector(
    '[data-testid="rsd-clear-prepared-sheet"] [data-testid="paper-grain"]'
  );
  expect(next).not.toBe(grain);
  await drag(offset(radius() + 10));
  await lift(offset(radius() + 10));
  const sheet = host.querySelector('[data-testid="rsd-clear-sheet"]');
  expect(sheet.querySelector('[data-testid="paper-grain"]')).toBe(next);
  expect(sheet.children).toHaveLength(2);
  expect(sheet.querySelector('path')).not.toBeNull();
  expect(committedStyle(sheet).opacity).toBe(1);
  expect(host.querySelector('[data-testid="rsd-clear-prepared-sheet"]')).toBeNull();
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  await settle(CLEAR_SHEET_DURATION_MS - 1);
  expect(next.isConnected).toBe(true);
  await settle(1);
  expect(next.isConnected).toBe(false);
});

it.each([
  { name: 'reduced motion', reduceMotion: true },
  { name: 'an empty drawing', drawing: emptyDrawing() },
])('prepares no departing texture for $name', async ({ name: _name, ...options }) => {
  await mountClear(options);
  await press();
  expect(host.querySelector('[data-testid="rsd-clear-prepared-sheet"]')).toBeNull();
  await lift(HOME);
});
