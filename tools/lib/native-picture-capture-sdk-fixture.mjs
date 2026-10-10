import { createElement, forwardRef, useImperativeHandle } from 'react';

export function nativeCaptureSdk(state) {
  return {
    useColorScheme: () => state.scheme,
    Platform: state.platform,
    Image: (props) => {
      state.nativeImages.push(props);
      return null;
    },
    findNodeHandle: (target) => target,
    View: forwardRef(({ children, style, onLayout }, ref) => {
      useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
      if (onLayout) state.layouts.push(onLayout);
      return createElement('div', { style }, children);
    }),
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    PanResponder: {
      create: (responder) => {
        state.responders.push(responder);
        return { panHandlers: {} };
      },
    },
  };
}

export function svgCaptureSdk(state) {
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
    Image: ({ onLoad, href }) =>
      createElement('button', { 'data-output-image': href, onClick: onLoad }),
  };
}
