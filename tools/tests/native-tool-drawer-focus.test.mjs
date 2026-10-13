// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RsdToolDrawerSection } from '../../experiments/native-architecture/src/rsdDrawing/RsdToolDrawerSection.tsx';
import { DEFAULT_BRUSH_AVAILABILITY } from '../../experiments/native-architecture/src/settings/brushPreferences.ts';
import { DEFAULT_DRAWING_CONTROL_PREFERENCES } from '../../experiments/native-architecture/src/settings/drawingControlPreferences.ts';
import { TWO_COLUMN_CHIP_WIDTH_PX } from '../../experiments/native-architecture/src/settings/toolDrawerSection.ts';

// The Drawing Tools block as the web build renders it: React Native Web, the web toggle switch and
// the web focus carry, with React Strict DOM reduced to the plain elements its web build emits.
// happy-dom never lays anything out, so the block's onLayout is captured and fired by hand.
const layout = vi.hoisted(() => ({ measure: null }));
vi.mock('react-native', async () => {
  const web = await import('react-native-web');
  const { createElement: create, forwardRef: forward } = await import('react');
  const View = forward((props, ref) => {
    if (props.testID === 'tool-drawer-tools') layout.measure = props.onLayout;
    return create(web.View, { ...props, ref });
  });
  return { ...web, View };
});
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdPressable.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdPressable.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/focusCarry.ts',
  () => import('../../experiments/native-architecture/src/rsdDrawing/focusCarry.web.ts')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/segmentThumb.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/segmentThumb.web.tsx')
);
vi.mock('react-native-svg', () => ({ SvgXml: () => null }));
vi.mock('react-strict-dom', () => {
  const element = (tag) =>
    forwardRef(({ style: _style, for: htmlFor, ...props }, ref) =>
      createElement(tag, { ...props, htmlFor, ref })
    );
  const tags = ['div', 'span', 'button', 'section', 'h4', 'p', 'label'];
  return {
    html: Object.fromEntries(tags.map((tag) => [tag, element(tag)])),
    css: {
      create: (styles) =>
        Object.fromEntries(
          Object.entries(styles).map(([key, value]) => [
            key,
            typeof value === 'function' ? () => null : null,
          ])
        ),
      defineVars: (values) => values,
      createTheme: () => null,
    },
  };
});

let root;
let host;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const noop = () => {};
  await act(async () =>
    root.render(
      createElement(RsdToolDrawerSection, {
        settings: {
          ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
          applePencilSeen: false,
          pencilEraserEnabled: true,
        },
        brushState: {
          status: 'ready',
          brush: 'pen',
          availability: DEFAULT_BRUSH_AVAILABILITY,
          saved: true,
          message: '',
        },
        busy: false,
        onToolDrawerChange: noop,
        onBrushAvailabilityChange: noop,
        onUndoButtonChange: noop,
        onStrokeWidthControlChange: noop,
        onPencilEraserChange: noop,
        onRetryBrushSave: noop,
      })
    )
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  layout.measure = null;
});

async function measure(width) {
  await act(async () =>
    layout.measure({ nativeEvent: { layout: { x: 0, y: 0, width, height: 300 } } })
  );
}

const crayon = () => document.getElementById('crayonToggle');
const chipSkin = () => document.querySelector('[role="group"][aria-label="Drawing Tools"]');

// Negative control: without the carry, each swap drops focus to <body> with the unmounted control.
it.each([
  ['rows to chips', TWO_COLUMN_CHIP_WIDTH_PX - 1, TWO_COLUMN_CHIP_WIDTH_PX],
  ['chips to rows', TWO_COLUMN_CHIP_WIDTH_PX, TWO_COLUMN_CHIP_WIDTH_PX - 1],
])('keeps focus on the tool a keyboard user was on across the %s swap', async (_, from, to) => {
  await measure(from);
  const before = crayon();
  before.focus();
  expect(document.activeElement).toBe(before);
  await measure(to);
  expect(chipSkin() === null).toBe(to < TWO_COLUMN_CHIP_WIDTH_PX);
  expect(crayon()).not.toBe(before);
  expect(document.activeElement).toBe(crayon());
  expect(document.activeElement.getAttribute('aria-label')).toBe('Crayon');
});

it('leaves focus alone when a swap happens with focus outside the tools', async () => {
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  await measure(TWO_COLUMN_CHIP_WIDTH_PX);
  expect(chipSkin()).not.toBeNull();
  expect(document.activeElement).toBe(outside);
});
