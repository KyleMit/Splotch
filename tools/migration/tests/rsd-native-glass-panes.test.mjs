import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { host, records } from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { GLASS_PANE_INKS } from '../../../experiments/native-architecture/src/rsdDrawing/glassPaneInk.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { EDGE_INSET_PX } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';

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
