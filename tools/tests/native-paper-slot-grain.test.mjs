// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { NativePaper } from '../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx';
import { PaperTexture } from '../../experiments/native-architecture/src/drawing/PaperTexture.tsx';

const surface = vi.hoisted(() => ({ props: null }));

vi.mock('react-native', () => ({
  AccessibilityInfo: createAccessibilityInfoFixture(),
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 402, height: 874, scale: 3, fontScale: 1 }),
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
  Image: () => null,
  View: ({ children }) => createElement('div', null, children),
}));

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: (props) => {
    surface.props = props;
    return null;
  },
}));

let container;
let root;

function mount(lifted) {
  const drawing = adoptedDrawing({ width: 402, height: 700, pixelRatio: 3 });
  const screen = {
    history: { drawing },
    currentDrawing: () => drawing,
    surface: createRef(),
    recovery: { generation: 0, callbacks: {} },
    brush: 'pen',
    busy: false,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
  };
  const sound = {
    settings: {
      status: 'ready',
      selectedColor: 'Green',
      strokeWidth: 'medium',
      eraserWidth: 'medium',
    },
    owner: null,
  };
  act(() =>
    root.render(
      createElement(NativePaper, {
        screen,
        sound,
        menuOpen: false,
        lifted,
        frame: { left: 0, top: 0, width: 402, height: 700 },
      })
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  surface.props = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// The slot around the paper wears the grain wherever the sheet fills it (RsdPaperSlot), so a
// sheet that fills the slot painting its own grain and color again is two more full-paper layers
// Android redraws on every frame of a stroke. Negative control: an underlay passed whether or
// not the sheet is lifted fails the filling case.
it('gives the paper its own grain only when the sheet is lifted off the margin', () => {
  mount(false);
  expect(surface.props.underlay).toBeNull();
  mount(true);
  expect(surface.props.underlay.type).toBe(PaperTexture);
});
