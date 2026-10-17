import { inflateSync } from 'node:zlib';
import { act, createElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { host, mount, records } from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { GLASS_PANE_INKS } from '../../../experiments/native-architecture/src/rsdDrawing/glassPaneInk.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { EDGE_INSET_PX } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import { glassPaneImage } from '../../../experiments/native-architecture/src/rsdDrawing/glassPaneImage.ts';
import { glassPanePng } from '../../../experiments/native-architecture/src/rsdDrawing/glassPanePng.ts';
import { RsdGlassPanes } from '../../../experiments/native-architecture/src/rsdDrawing/RsdBareGlass.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';

beforeEach(() => {
  vi.mocked(glassPaneImage).mockReset().mockResolvedValue(null);
});

const FORWARD_REF = Symbol.for('react.forward_ref');
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE_BYTES = 8;

// The React Native props a stand-in host element was rendered with.
function nativeProps(element) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
  const owner = key ? element[key].return : null;
  return owner?.type?.$$typeof === FORWARD_REF ? owner.memoizedProps : {};
}

const panes = () => [...host.querySelectorAll('[data-testid="rsd-glass-pane"]')];

async function mountFlat(width, height, settings = {}) {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
  storedSettings({ toolbarStyle: 'bare', aiEnabled: true, ...settings });
  await mountToolbar(toolbarScreen(), settings);
  await vi.waitFor(() => expect(panes().length).toBeGreaterThan(0));
}

// A pane image's palette colour and its per-pixel alpha bytes, read back from its data URI.
function decodePane(uri) {
  expect(uri.startsWith(PNG_PREFIX)).toBe(true);
  const png = Buffer.from(uri.slice(PNG_PREFIX.length), 'base64');
  const chunks = {};
  for (let at = PNG_SIGNATURE_BYTES; at < png.length;) {
    const length = png.readUInt32BE(at);
    chunks[png.toString('latin1', at + 4, at + 8)] = png.subarray(at + 8, at + 8 + length);
    at += length + 12;
  }
  const [columns, rows] = [chunks.IHDR.readUInt32BE(0), chunks.IHDR.readUInt32BE(4)];
  const scanlines = inflateSync(chunks.IDAT);
  const alpha = (column, row) => chunks.tRNS[scanlines[row * (columns + 1) + 1 + column]];
  return { rgb: [...chunks.PLTE.subarray(0, 3)], columns, rows, alpha };
}

// A pane as laid out: the box its clip holds in the paper area, and the image within it.
function paneLayout(element) {
  const image = nativeProps(element);
  const clip = flat(nativeProps(element.parentElement).style);
  return { image, clip, place: flat(image.style), pane: decodePane(image.source.uri) };
}

// The alpha byte the stretched image shows nearest a paper-area point.
function alphaAt({ clip, place, pane }, x, y) {
  const column = Math.round(((x - clip.left - place.left) / place.width) * pane.columns - 0.5);
  const row = Math.round(((y - clip.top - place.top) / place.height) * pane.rows - 0.5);
  return pane.alpha(column, row);
}

// What makes Android draw a view, and everything under it, into an offscreen layer every frame.
function layered(style) {
  return {
    opacity: style.opacity ?? 1,
    mixBlendMode: style.mixBlendMode ?? 'normal',
    filter: style.filter ?? [],
    transform: style.transform ?? [],
  };
}
const PLAIN = { opacity: 1, mixBlendMode: 'normal', filter: [], transform: [] };

describe('the native flat glass panes', () => {
  // Negative control: a pane, or a view between the panes and the layout, given an opacity or a
  // blend mode fails here; so does a pane that would catch the strokes drawn under it.
  it.each([
    ['portrait', 390, 844],
    ['landscape', 1180, 820],
  ])('fade the %s ink with plain, unblended images', async (_, width, height) => {
    await mountFlat(width, height);
    const layout = host.querySelector('[data-testid="rsd-drawing-layout"]');
    for (const element of panes()) {
      const { image, clip, place, pane } = paneLayout(element);
      expect(image.resizeMode).toBe('stretch');
      expect([clip.position, clip.overflow, place.position]).toEqual([
        'absolute',
        'hidden',
        'absolute',
      ]);
      expect(pane.rgb).toEqual(GLASS_PANE_INKS.light.rgb);
      expect(layered(flat(image.style))).toEqual(PLAIN);
      let untouchable = false;
      for (let view = element.parentElement; view && view !== layout; view = view.parentElement) {
        const props = nativeProps(view);
        expect(layered(flat(props.style) ?? {})).toEqual(PLAIN);
        untouchable ||= props.pointerEvents === 'none';
      }
      expect(untouchable).toBe(true);
    }
  });

  // Shipping's geometry runs from the layout's corner, over the bar; the paper area holding the
  // panes starts below it. Negative control: panes left in layout coordinates sit a bar's height
  // low, and the Settings corner's solid glass falls off the screen.
  it('lay the full ink solid over the drawer toggle and the Settings button', async () => {
    await mountFlat(390, 844);
    const solid = Math.round(255 * GLASS_PANE_INKS.light.alpha);
    const corner = CORNER_BUTTON_SIZE_PX / 2;
    const centre = 844 - EDGE_INSET_PX - corner;
    for (const [x, y] of [
      [EDGE_INSET_PX + corner, centre],
      [390 - EDGE_INSET_PX - corner, centre],
    ]) {
      const covering = panes()
        .map(paneLayout)
        .filter(
          ({ clip }) =>
            x >= clip.left &&
            x < clip.left + clip.width &&
            y >= clip.top &&
            y < clip.top + clip.height
        );
      expect(
        covering.map((pane) => alphaAt(pane, x, y)),
        `${x},${y}`
      ).toEqual([solid]);
    }
  });

  it('paint the night paper’s ink in Dark mode', async () => {
    await mountFlat(390, 844, { appearance: 'dark' });
    for (const element of panes())
      expect(paneLayout(element).pane.rgb).toEqual(GLASS_PANE_INKS.dark.rgb);
  });
});

describe('the native pane composition lifetime', () => {
  const SPACE = { width: 390, height: 844, insetBottom: 0, paperTop: 0, paperLeft: 0 };
  const GLASS = {
    panel: { mode: 'column', count: 5, size: 50, optionSize: 50, brushOptions: 4, stroke: true },
    expanded: false,
    open: null,
    fullscreen: false,
  };
  const tree = (theme, space = SPACE, glass = GLASS) =>
    createElement(
      DrawingAppearanceProvider,
      { preference: theme },
      createElement(RsdGlassPanes, { space, glass })
    );
  const renderedPanes = () =>
    records.props.filter((props) => props.testID === 'rsd-glass-pane').slice(-panes().length);
  const imageUris = () => renderedPanes().map(({ source }) => source.uri);
  async function changingPane() {
    let change;
    function PaneFixture() {
      const [state, setState] = useState({ theme: 'light', space: SPACE, visible: true });
      change = (next) => setState((previous) => ({ ...previous, ...next }));
      return state.visible ? tree(state.theme, state.space) : null;
    }
    await mount(createElement(PaneFixture));
    return (next) => act(async () => change(next));
  }

  it('passes the full feather and inset-adjusted window origin into each image', async () => {
    records.insets = { top: 47, left: 31, right: 0, bottom: 0 };
    await mount(tree('dark'));
    expect(glassPaneImage).toHaveBeenCalledTimes(panes().length);
    for (const [raster, theme, origin] of vi.mocked(glassPaneImage).mock.calls) {
      expect(theme).toBe('dark');
      expect(origin).toEqual({ x: raster.box.x + 31, y: raster.box.y + 47 });
      expect(Math.max(...raster.alpha)).toBe(255);
    }
  });

  it('retains the mean fallback until every pane has a settled texture', async () => {
    const pending = [];
    vi.mocked(glassPaneImage).mockImplementation(
      (raster) =>
        new Promise((resolve) => {
          pending.push({ resolve, uri: glassPanePng(raster, [1, 2, 3]) });
        })
    );
    await mount(tree('light'));
    const fallback = imageUris();
    expect(panes().map((element) => paneLayout(element).pane.rgb)).toEqual(
      panes().map(() => GLASS_PANE_INKS.light.rgb)
    );
    await act(async () => pending[0].resolve(pending[0].uri));
    expect(imageUris()).toEqual(fallback);
    await act(async () => pending.slice(1).forEach(({ resolve, uri }) => resolve(uri)));
    expect(imageUris()).toEqual(pending.map(({ uri }) => uri));
    for (const [index, element] of panes().entries()) {
      const { clip } = paneLayout(element);
      const place = flat(renderedPanes()[index].style);
      expect(place).toMatchObject({ left: 0, top: 0, width: clip.width, height: clip.height });
      expect(layered(place)).toEqual(PLAIN);
    }
  });

  it.each(['theme', 'layout'])('ignores late textures after the %s changes', async (change) => {
    const pending = [];
    vi.mocked(glassPaneImage).mockImplementation(
      (raster) =>
        new Promise((resolve) => {
          pending.push({ resolve, uri: glassPanePng(raster, [1, 2, 3]) });
        })
    );
    const changePane = await changingPane();
    const old = pending.splice(0);
    const theme = change === 'theme' ? 'dark' : 'light';
    const space = change === 'layout' ? { ...SPACE, width: 430 } : SPACE;
    await changePane({ theme, space });
    const fallback = imageUris();
    await act(async () => old.forEach(({ resolve, uri }) => resolve(uri)));
    expect(imageUris()).toEqual(fallback);
    await act(async () => pending.forEach(({ resolve, uri }) => resolve(uri)));
    expect(imageUris()).toEqual(pending.map(({ uri }) => uri));
  });

  it('forgets a composition after its pane unmounts', async () => {
    const pending = [];
    vi.mocked(glassPaneImage).mockImplementation(
      (raster) =>
        new Promise((resolve) => {
          pending.push({ resolve, uri: glassPanePng(raster, [1, 2, 3]) });
        })
    );
    const changePane = await changingPane();
    await changePane({ visible: false });
    await act(async () => pending.forEach(({ resolve, uri }) => resolve(uri)));
    expect(panes()).toEqual([]);
    await changePane({ visible: true });
    expect(panes().map((element) => paneLayout(element).pane.rgb)).toEqual(
      panes().map(() => GLASS_PANE_INKS.light.rgb)
    );
  });
});
