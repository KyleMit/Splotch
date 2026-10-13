import { createElement, forwardRef, useEffect, useImperativeHandle } from 'react';

export function nativeRasterSdk(state, tileWidth) {
  return {
    Platform: state.platform,
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
    Image: (props) => {
      state.svgTiles.push(props);
      useEffect(() => {
        if (state.autoSvgTiles) props.onLoad?.();
      }, [props.href]);
      return null;
    },
  };
}
