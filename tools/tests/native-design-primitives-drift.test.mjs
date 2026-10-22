import { expect, it, vi } from 'vitest';
import { scale } from '../../web/src/lib/design/tokens.ts';

import { blobPath } from '../../experiments/native-architecture/src/rsdDrawing/blob.ts';
import { mixSrgb, rgba } from '../../experiments/native-architecture/src/rsdDrawing/colorMix.ts';

vi.mock('react-native', () => ({
  AccessibilityInfo: {},
  Platform: { OS: 'web' },
  ScrollView: () => null,
  StyleSheet: { create: (styles) => styles },
  Text: () => null,
  TextInput: () => null,
  useColorScheme: () => 'light',
}));
vi.mock('react-native-svg', () => ({ SvgXml: () => null }));
vi.mock('react-strict-dom', () => ({
  css: { create: (styles) => styles, defineVars: (vars) => vars, createTheme: () => ({}) },
  html: {},
}));

// The corner radii of a blob path's four arcs, clockwise from the top right.
function arcRadii(path) {
  return [...path.matchAll(/A([\d.]+) ([\d.]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

it.each(['radiusBlob1', 'radiusBlob2', 'radiusBlob3'])(
  'draws %s with the shipping elliptical corners',
  (shape) => {
    const size = 32;
    const [horizontal, vertical = horizontal] = scale[shape]
      .split('/')
      .map((list) => list.trim().split(/\s+/).map(Number.parseFloat));
    const full = (list) => [
      list[0],
      list[1] ?? list[0],
      list[2] ?? list[0],
      list[3] ?? list[1] ?? list[0],
    ];
    const [h, v] = [full(horizontal), full(vertical)];
    // CSS Backgrounds 3 §5.5: when two radii along one side overlap it, all shrink by one factor.
    const factor = Math.min(
      1,
      100 / (h[0] + h[1]),
      100 / (h[2] + h[3]),
      100 / (v[0] + v[3]),
      100 / (v[1] + v[2])
    );
    const radius = (percent) => Math.round((percent / 100) * size * factor * 1000) / 1000;
    const clockwiseFromTopRight = [1, 2, 3, 0];
    expect(arcRadii(blobPath(shape, size, size))).toEqual(
      clockwiseFromTopRight.map((corner) => [radius(h[corner]), radius(v[corner])])
    );
  }
);

it('mixes and spells colors the way React Native reads them', () => {
  expect(mixSrgb('#ab71e1', 0, '#333')).toBe('#333333');
  expect(mixSrgb('#ab71e1', 100, '#ffffff')).toBe('#ab71e1');
  expect(mixSrgb('#000000', 50, '#ffffff')).toBe('#808080');
  expect(rgba('#23232b', 0)).toBe('rgba(35, 35, 43, 0)');
  expect(() => mixSrgb('rgb(0 0 0)', 50, '#fff')).toThrow('Not a hex color');
});
