import { createElement } from 'react';
import { expect, it } from 'vitest';
import { records, mount } from './rsd-native-selection-host.mjs';
import { flat } from './rsd-native-toolbar-fixture.mjs';
import { yogaChainLayout } from './rsd-yoga-host.mjs';
import { PaperTexture } from '../../../experiments/native-architecture/src/drawing/PaperTexture.tsx';

// The first Yoga case compiles React Native's Yoga sources before it lays anything out.
const YOGA_COMPILE_TIMEOUT_MS = 180_000;

// Yoga rounds every frame to the device-pixel grid and the grain's scale multiplies its rounding by
// the density, so its far edges can land up to a point short of the paper's.
const GRAIN_ROUNDING_PT = 1;
const YOGA_KEYS = [
  'direction',
  'top',
  'bottom',
  'left',
  'right',
  'width',
  'height',
  'minWidth',
  'minHeight',
];
const yogaStyle = (style, swap) =>
  Object.fromEntries(
    YOGA_KEYS.filter((key) => style[key] !== undefined).map((key) => [
      swap ? ({ left: 'start', right: 'end' }[key] ?? key) : key,
      style[key],
    ])
  );

// React Native mirrors `left` to the start edge in RTL but scales from the physical corner its
// transformOrigin names, so the grain's coverage is a question for the engine's own layout.
// Negative control (issue 3140): without the texture's `direction: 'ltr'`, RTL with the swap
// leaves the paper's left (1 - 1/density) bare at every density above 1.
it.each(
  [
    { name: 'LTR', direction: 'ltr', swap: false },
    { name: 'RTL with the left/right swap', direction: 'rtl', swap: true },
    { name: 'RTL without the swap', direction: 'rtl', swap: false },
  ].flatMap((layout) =>
    [1, 2, 3, 3.5].flatMap((density) =>
      [{}, { origin: { x: -380.5, y: -194.25 }, rightInset: 48 }].map((props) => ({
        ...layout,
        density,
        props,
      }))
    )
  )
)(
  'grains the whole paper in $name at $density x with props $props',
  async ({ direction, swap, density, props }) => {
    const window = { width: 402, height: 874 };
    records.dimensions = { ...window, scale: density, fontScale: 1 };
    records.props.length = 0;
    await mount(createElement(PaperTexture, props));
    const styles = ['paper-texture', 'paper-grain-phase', 'paper-grain'].map((id) =>
      flat(records.props.findLast((recorded) => recorded.testID === id).style)
    );
    const grainStyle = styles.at(-1);
    expect(grainStyle).toMatchObject({
      transform: [{ scale: density }],
      transformOrigin: 'top left',
    });
    const [paper, , grain] = yogaChainLayout({
      ...window,
      direction,
      scale: density,
      styles: styles.map((style) => yogaStyle(style, swap)),
    });
    expect(paper).toEqual({ left: 0, top: 0, ...window });
    expect(grain.left).toBeLessThanOrEqual(paper.left);
    expect(grain.top).toBeLessThanOrEqual(paper.top);
    expect(grain.left + grain.width * density).toBeGreaterThanOrEqual(
      paper.width - GRAIN_ROUNDING_PT
    );
    expect(grain.top + grain.height * density).toBeGreaterThanOrEqual(
      paper.height - GRAIN_ROUNDING_PT
    );
    records.dimensions = { ...window, scale: 1, fontScale: 1 };
  },
  YOGA_COMPILE_TIMEOUT_MS
);
