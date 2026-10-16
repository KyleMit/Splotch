import { createAccessibilityInfoFixture } from './native-accessibility-fixture.mjs';
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';

export function installCaptureFrames(state, vi) {
  state.frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++state.nextFrame;
    state.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => state.frames.delete(id));
}

export function nativeCaptureSdk(state, crayonTilePx) {
  const View = forwardRef(({ children, style, onLayout, onPaperInput }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    if (onLayout) state.layouts.push(onLayout);
    if (onPaperInput) state.inputs.push(onPaperInput);
    return createElement('div', { style }, children);
  });
  return {
    useColorScheme: () => state.scheme,
    Platform: state.platform,
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: state.pixelRatio ?? 1, fontScale: 1 }),
      addEventListener: (_event, listener) => {
        state.screenListeners?.add(listener);
        return { remove: () => state.screenListeners?.delete(listener) };
      },
    },
    PixelRatio: { get: () => state.pixelRatio ?? 1 },
    AccessibilityInfo: createAccessibilityInfoFixture(),
    Image: (props) => {
      state.nativeImages.push(props);
      useEffect(() => {
        if (props.style?.width === crayonTilePx)
          props.onLoad?.({
            nativeEvent: {
              source: {
                uri: props.source.uri,
                width: crayonTilePx,
                height: crayonTilePx,
              },
            },
          });
      }, [props.source.uri]);
      return null;
    },
    findNodeHandle: (target) => target,
    View,
    requireNativeComponent: () => View,
    StyleSheet: {
      create: (styles) => styles,
      absoluteFill: { position: 'absolute' },
      absoluteFillObject: { position: 'absolute' },
    },
  };
}

export function svgCaptureSdk(state, crayonTilePx) {
  return {
    default: forwardRef(({ children, width, height, viewBox }, ref) => {
      useImperativeHandle(ref, () => ({
        toDataURL(callback, options) {
          state.captures.push({ callback, options, width, height, viewBox, children });
        },
      }));
      return createElement('div', { 'data-svg-width': width }, children);
    }),
    G: ({ children, opacity }) => createElement('div', { 'data-opacity': opacity }, children),
    Rect: ({ fill }) => createElement('div', { 'data-paper-fill': fill }),
    Circle: () => null,
    Path: () => null,
    Image: ({ onLoad, href, width }) => {
      useEffect(() => {
        if (width === crayonTilePx) onLoad?.();
      }, [href]);
      return width === crayonTilePx
        ? null
        : createElement('button', { 'data-output-image': href, onClick: onLoad });
    },
  };
}

const CAPTURE_READY_FRAMES = 2;
export async function flushCaptureFrames(state) {
  for (let count = 0; count < CAPTURE_READY_FRAMES; count += 1) {
    await act(async () => {
      const pending = [...state.frames.values()];
      state.frames.clear();
      for (const callback of pending) callback(0);
    });
  }
}

export async function loadCaptureImage(host, width = '100%') {
  const image = [...host.querySelectorAll(`[data-svg-width="${width}"] button`)].at(-1);
  if (!image) throw new Error('Capture image is not mounted.');
  await act(async () => image.click());
}

export async function beginFixtureOutput(ref, drawing, kind = 'captureInk') {
  const release = ref.current.lockInput();
  let promise;
  await act(async () => {
    promise = ref.current[kind](drawing);
  });
  return { promise, release };
}
