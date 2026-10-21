import { createElement, forwardRef, useEffect, useImperativeHandle } from 'react';

export function nativeRasterSdk(state, tileWidth) {
  return {
    Platform: state.platform,
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: state.pixelRatio ?? 1, fontScale: 1 }),
      addEventListener: () => ({ remove() {} }),
    },
    PixelRatio: { get: () => state.pixelRatio ?? 1 },
    Image: (props) => {
      state.nativeImages.push(props);
      useEffect(() => {
        if (state.autoNativeTiles && props.style?.width === tileWidth)
          props.onLoad?.({
            nativeEvent: {
              source: {
                uri: props.source.uri,
                width: tileWidth,
                height: tileWidth,
              },
            },
          });
      }, [props.source.uri]);
      return null;
    },
    View: ({ children, style }) => createElement('div', { style }, children),
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
  };
}

export function svgRasterSdk(state) {
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
    Image: (props) => {
      state.svgTiles.push(props);
      useEffect(() => {
        if (state.autoSvgTiles) props.onLoad?.();
      }, [props.href]);
      return null;
    },
  };
}

// `accessibility` receives each AccessibilityInfo listener by event name, so a test can fire one.
export async function nativeInkViewSdk(readPlane, loadImage, accessibility = new Map()) {
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  const View = ({ children, onLayout, testID }) => {
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: readPlane() } });
    }, [onLayout]);
    return createElement('div', { 'data-testid': testID }, children);
  };
  return {
    Animated: animatedPort(View, View),
    Easing: easingPort,
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: (event, listener) => {
        accessibility.set(event, listener);
        return { remove: () => accessibility.delete(event) };
      },
    },
    PixelRatio: { get: () => 1 },
    Platform: { OS: 'web' },
    Image: ({ source, onLoad }) => {
      useEffect(() => loadImage(onLoad), [source.uri, onLoad]);
      return null;
    },
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    View,
  };
}

export function svgInkViewSdk(loadImage) {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: group,
    G: group,
    Defs: group,
    Mask: group,
    Pattern: group,
    Filter: group,
    LinearGradient: group,
    Stop: group,
    FeBlend: group,
    FeComposite: group,
    ClipPath: group,
    RadialGradient: group,
    SvgXml: group,
    Path: () => null,
    Use: () => null,
    Circle: () => null,
    Rect: () => null,
    Ellipse: () => null,
    Polygon: () => null,
    Image: ({ href, onLoad }) => {
      useEffect(() => loadImage(onLoad), [href, onLoad]);
      return createElement('div', { 'data-ghost-image': href });
    },
  };
}
