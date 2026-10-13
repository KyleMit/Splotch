// @vitest-environment happy-dom
import { act, createElement, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedInkCapture } from '../../experiments/native-architecture/src/drawing/FixedInkCapture.tsx';
import { BundledFillLoadScope } from '../../experiments/native-architecture/src/drawing/BundledBookArtwork.tsx';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const capture = vi.hoisted(() => ({
  pageId: 'farm/cat',
  theme: 'light',
  os: 'ios',
  native: null,
  svg: null,
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return capture.os;
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: ({ children }) => createElement('div', null, children),
  Image: (props) => {
    capture.native = props;
    return null;
  },
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }) => createElement('div', null, children),
  Image: () => null,
}));
vi.mock('../../experiments/native-architecture/src/drawing/InkAppearance.tsx', () => ({
  useInkAppearance: () => capture,
}));
vi.mock('../../experiments/native-architecture/src/drawing/BundledBookArtwork.tsx', async () => {
  const { createContext } = await import('react');
  return { BundledFillLoadScope: createContext(null) };
});
vi.mock('../../experiments/native-architecture/src/drawing/CaptureSvg.tsx', () => ({
  CaptureSvg: ({ children }) => createElement('div', null, children),
}));
vi.mock('../../experiments/native-architecture/src/drawing/DecodedPng.tsx', () => ({
  DecodedPng: () => null,
}));
vi.mock('../../experiments/native-architecture/src/drawing/InkScene.tsx', () => ({
  InkScene: () => {
    capture.svg = useContext(BundledFillLoadScope);
    return null;
  },
}));
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  Object.assign(capture, {
    pageId: 'farm/cat',
    theme: 'light',
    os: 'ios',
    native: null,
    svg: null,
  });
});
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});
async function mountCapture(magic = true) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onReady = vi.fn();
  const onError = vi.fn();
  const plan = {
    checkpoint: null,
    strokes: magic ? [{ brush: 'magic', rainbow: 0, width: 30, points: [{ x: 100, y: 100 }] }] : [],
  };
  await act(async () =>
    root.render(
      createElement(FixedInkCapture, { plan, svgRef: { current: null }, onReady, onError })
    )
  );
  return { onReady, onError };
}

describe('bundled Magic capture waits for the selected real fill', () => {
  it.each(['native', 'svg'])(
    'requires both iOS decode boundaries when %s completes first',
    async (first) => {
      const mounted = await mountCapture();
      expect(mounted.onReady).not.toHaveBeenCalled();
      const ready = { native: () => capture.native.onLoad(), svg: () => capture.svg() };
      await act(async () => ready[first]());
      expect(mounted.onReady).not.toHaveBeenCalled();
      await act(async () => ready[first === 'native' ? 'svg' : 'native']());
      expect(mounted.onReady).toHaveBeenCalledOnce();
      expect(mounted.onError).not.toHaveBeenCalled();
    }
  );

  it('requires the Android native decode without waiting for an unavailable SVG image event', async () => {
    capture.os = 'android';
    const mounted = await mountCapture();
    expect(mounted.onReady).not.toHaveBeenCalled();
    await act(async () => capture.native.onLoad());
    expect(mounted.onReady).toHaveBeenCalledOnce();
    expect(mounted.onError).not.toHaveBeenCalled();
  });

  it('allows a Farm capture without Magic to proceed immediately', async () => {
    const mounted = await mountCapture(false);
    expect(capture.native).toBeNull();
    expect(mounted.onReady).toHaveBeenCalledOnce();
    expect(mounted.onError).not.toHaveBeenCalled();
  });

  it('reports an unresolved fill at the owned capture deadline', async () => {
    const mounted = await mountCapture();
    await act(async () => vi.advanceTimersByTime(PNG_TIMEOUT_MS));
    expect(mounted.onReady).not.toHaveBeenCalled();
    expect(mounted.onError).toHaveBeenCalledOnce();
    expect(mounted.onError.mock.calls[0][0].message).toBe(
      'The coloring fill did not load for capture. Your saved drawing is unchanged.'
    );
  });

  it('reports native image decode failure without declaring the export ready', async () => {
    const mounted = await mountCapture();
    await act(async () => capture.native.onError());
    expect(mounted.onReady).not.toHaveBeenCalled();
    expect(mounted.onError).toHaveBeenCalledOnce();
    expect(mounted.onError.mock.calls[0][0].message).toBe(
      'The coloring fill did not load. Your saved drawing is unchanged.'
    );
  });

  it('cancels the fill deadline on unmount', async () => {
    const mounted = await mountCapture();
    await act(async () => root.unmount());
    root = null;
    await act(async () => vi.advanceTimersByTime(PNG_TIMEOUT_MS));
    expect(mounted.onReady).not.toHaveBeenCalled();
    expect(mounted.onError).not.toHaveBeenCalled();
  });
});
