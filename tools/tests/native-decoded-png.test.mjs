// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DecodedPng } from '../../experiments/native-architecture/src/drawing/DecodedPng.tsx';

const sdk = vi.hoisted(() => ({ image: null, platform: { OS: 'android' } }));
vi.mock('react-native', () => ({
  Image: (props) => {
    sdk.image = props;
    return null;
  },
  Platform: sdk.platform,
  StyleSheet: { create: (styles) => styles },
}));
let root, host, loaded, failed;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sdk.platform.OS = 'android';
  sdk.image = null;
  host = document.createElement('div');
  root = createRoot(host);
  loaded = vi.fn();
  failed = vi.fn();
});
afterEach(() => act(() => root.unmount()));
function render(base64 = 'actual-capture-payload') {
  act(() => root.render(createElement(DecodedPng, { base64, onLoad: loaded, onError: failed })));
}
function event(image, changes = {}) {
  return {
    nativeEvent: { source: { uri: image.source.uri, width: 1024, height: 768, ...changes } },
  };
}
it.each([{ uri: 'another-image' }, { width: 1023 }, { height: 769 }])(
  'refuses decoded callbacks from an unexpected URI or sampling grid: %j',
  (changes) => {
    render();
    act(() => sdk.image.onLoad(event(sdk.image, changes)));
    expect(failed).toHaveBeenCalledOnce();
    expect(loaded).not.toHaveBeenCalled();
  }
);
it('accepts only the full decoded image callback and forwards decoding failure', () => {
  render();
  expect(sdk.image.resizeMethod).toBe('none');
  expect(loaded).not.toHaveBeenCalled();
  act(() => sdk.image.onLoad(event(sdk.image)));
  expect(loaded).toHaveBeenCalledOnce();
  act(() => sdk.image.onError({ nativeEvent: { error: 'failed' } }));
  expect(failed).toHaveBeenCalledOnce();
});
it('refuses stale callbacks after source replacement and after unmount', () => {
  render('old');
  const previous = sdk.image;
  render('current');
  act(() => {
    previous.onLoad(event(previous));
    previous.onError({});
  });
  expect(loaded).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
  const current = sdk.image;
  act(() => root.render(null));
  act(() => {
    current.onLoad(event(current));
    current.onError({});
  });
  expect(loaded).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
});
it.each(['web', 'ios'])('preserves the existing SVG readiness owner on %s', (platform) => {
  sdk.platform.OS = platform;
  render();
  expect(sdk.image).toBeNull();
});
