import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { host, resetHost } from './rsd-native-control-host.mjs';
import * as ReactNative from 'react-native';
import { DialogHeader } from '../../../src/rsdDrawing/DialogHeader.tsx';

vi.mock('../../../src/platform/svg.ts', async () => {
  const { createElement } = await import('react');
  return {
    Svg: ({ children, width, height }) => createElement('svg', { width, height }, children),
    Path: (props) => createElement('path', props),
    SvgXml: ({ xml, width, height }) => createElement('svg', { 'data-xml': xml, width, height }),
  };
});

let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
const title = () => container.querySelector('[role="heading"]');
async function render(props = {}) {
  await act(async () =>
    root.render(h(DialogHeader, { title: 'Settings', titleSize: 'xl', onClose() {}, ...props }))
  );
}

it('keeps the focused web heading mounted across height, width and font changes', async () => {
  let height = 874;
  let fontScale = 1;
  vi.spyOn(ReactNative, 'useWindowDimensions').mockImplementation(() => ({
    width: host.windowWidth,
    height,
    scale: 1,
    fontScale,
  }));
  const props = { title: 'Appearance', titleSize: 'lg', titleRef: () => {}, onBack() {} };
  await render(props);
  const heading = title();
  heading.tabIndex = -1;
  heading.focus();
  expect(document.activeElement).toBe(heading);
  height = 600;
  await render(props);
  expect(title()).toBe(heading);
  expect(document.activeElement).toBe(heading);
  host.windowWidth = 874;
  await render(props);
  expect(title()).toBe(heading);
  expect(document.activeElement).toBe(heading);
  fontScale = 3;
  await render(props);
  expect(title()).toBe(heading);
  expect(document.activeElement).toBe(heading);
});
