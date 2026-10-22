import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { host, mount, records } from './rsd-native-selection-host.mjs';
import { RsdPageSheet } from '../../../src/rsdDrawing/RsdNotFoundPage.tsx';
import { RsdReleaseRule } from '../../../src/rsdDrawing/RsdReleaseArticle.tsx';
import { DrawingAppearanceProvider } from '../../../src/drawing/DrawingAppearance.tsx';
import { DRAWING_THEMES } from '../../../src/drawing/theme.ts';

vi.mock(
  '../../../src/platform/forcedColors.ts',
  () => import('../../../src/platform/forcedColors.web.ts')
);

const FORCED_COLORS = '(forced-colors: active)';
const SYSTEM_INK = 'CanvasText';
const FORCED_RULE_WIDTH_PX = 2;
const FORCED_BLOB_BORDER_PX = 1;

let forced;
let listeners;
let originalMatchMedia;

beforeEach(() => {
  forced = true;
  listeners = new Set();
  originalMatchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: query === FORCED_COLORS && forced,
    media: query,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

async function setForced(value) {
  forced = value;
  await act(async () => {
    for (const listener of listeners) listener();
  });
}

async function mountRule() {
  await mount(
    createElement(
      DrawingAppearanceProvider,
      { preference: 'light' },
      createElement(RsdReleaseRule, { hue: 'Orange' })
    )
  );
  const rule = records.props.findLast((props) => props.testID === 'release-squiggle');
  await act(async () => rule.onLayout({ nativeEvent: { layout: { width: 48 } } }));
}

const rulePath = () => host.querySelector('[data-testid="release-squiggle"] path');

it('draws the crayon divider as shipping’s straight system-ink line in forced colors', async () => {
  await mountRule();
  expect(rulePath().getAttribute('d')).toBe(`M0 ${FORCED_RULE_WIDTH_PX / 2} H48`);
  expect(rulePath().getAttribute('stroke')).toBe(SYSTEM_INK);
  expect(rulePath().getAttribute('stroke-width')).toBe(String(FORCED_RULE_WIDTH_PX));
  expect(records.props.findLast((props) => props.testID === 'release-squiggle').style).toEqual({
    height: FORCED_RULE_WIDTH_PX,
  });
  await setForced(false);
  expect(rulePath().getAttribute('d')).toMatch(/^M0 4 Q6 0 12 4 T24 4/);
  expect(rulePath().getAttribute('stroke')).not.toBe(SYSTEM_INK);
});

async function mountSheet(theme) {
  records.os = 'web';
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  await mount(
    createElement(
      DrawingAppearanceProvider,
      { preference: theme },
      createElement(RsdPageSheet, { title: 'This page wandered off', lede: 'Still here.' })
    )
  );
  return () => {
    const xml = host.querySelector('a[href="/"] svg[data-xml]').getAttribute('data-xml');
    return new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
  };
}

const paints = (disc) =>
  [...disc.querySelectorAll('path, g')].flatMap((node) =>
    ['fill', 'stroke'].map((paint) => node.getAttribute(paint)).filter(Boolean)
  );

it.each(['light', 'dark'])(
  'draws the back-link disc in system colours in forced colors, %s',
  async (theme) => {
    const disc = await mountSheet(theme);
    await vi.waitFor(() => expect(disc().querySelector('g')).not.toBeNull());
    const [blob, edge] = disc().querySelectorAll(':scope > path');
    expect(blob.getAttribute('fill')).toBe('Canvas');
    expect(edge.getAttribute('stroke')).toBe(SYSTEM_INK);
    expect(edge.getAttribute('stroke-width')).toBe(String(FORCED_BLOB_BORDER_PX));
    expect(new Set(paints(disc()))).toEqual(new Set(['Canvas', 'none', SYSTEM_INK]));
    await setForced(false);
    expect(disc().querySelector('path').getAttribute('fill')).toBe(
      DRAWING_THEMES[theme].brandSolid
    );
    expect(paints(disc())).not.toContain(SYSTEM_INK);
  }
);
