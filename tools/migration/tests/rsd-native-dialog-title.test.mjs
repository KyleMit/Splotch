import { act, createElement as h, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { host, native, resetHost } from './rsd-native-control-host.mjs';
import * as ReactNative from 'react-native';
import { DialogHeader } from '../../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx';

vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/DialogTitle.tsx',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/DialogTitle.native.tsx')
);

vi.mock('../../../experiments/native-architecture/src/platform/svg.ts', async () => {
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
const direction = () => native(title().parentElement).style.flexDirection;
async function render(props = {}) {
  await act(async () =>
    root.render(h(DialogHeader, { title: 'Settings', titleSize: 'xl', onClose() {}, ...props }))
  );
}
async function lines(...text) {
  await act(async () =>
    native(title()).props.onTextLayout({ nativeEvent: { lines: text.map((text) => ({ text })) } })
  );
}

it('gives a split native word its own row without reducing text scaling or losing the heading ref', async () => {
  const close = vi.fn();
  const ref = createRef();
  await render({ onClose: close, titleRef: ref });
  expect(direction()).toBe('row');
  const headingRef = ref.current;
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  expect(title().textContent).toBe('Settings');
  expect(ref.current).not.toBeNull();
  expect(ref.current.textContent).toBe('Settings');
  expect(ref.current).toBe(headingRef);
  expect(native(title()).props.allowFontScaling).not.toBe(false);
  expect(native(title()).props.maxFontSizeMultiplier).toBeUndefined();
  expect(native(title()).props.adjustsFontSizeToFit).toBeUndefined();
  expect(native(title()).props.numberOfLines).toBeUndefined();
  expect(container.querySelectorAll('[role="heading"]')).toHaveLength(1);
  await act(async () => container.querySelector('[aria-label="Close"]').click());
  expect(close).toHaveBeenCalledOnce();
  await lines('Settings');
  expect(direction()).toBe('column');
});

it('keeps whole-word line breaks in the ordinary header and ignores empty layout reports', async () => {
  await render({ title: 'Tool Drawer' });
  await lines();
  expect(direction()).toBe('row');
  await lines('Tool ', 'Drawer');
  expect(direction()).toBe('row');
  await lines('Tool Dra', 'wer');
  expect(direction()).toBe('column');
});

it('keeps Back and additional actions available before the reflowed heading', async () => {
  const back = vi.fn();
  const action = vi.fn();
  const { html } = await import('react-strict-dom');
  await render({
    title: 'Accessibility',
    onBack: back,
    actions: h(html.button, { onClick: action }, 'Action'),
  });
  await lines('Accessibilit', 'y');
  expect(direction()).toBe('column');
  const controls = title().previousElementSibling;
  expect(controls.textContent).toContain('Action');
  expect(controls.querySelector('[aria-label="Close"]')).not.toBeNull();
  await act(async () => controls.querySelector('[aria-label="Back"]').click());
  await act(async () =>
    [...controls.querySelectorAll('button')].find((node) => node.textContent === 'Action').click()
  );
  expect(back).toHaveBeenCalledOnce();
  expect(action).toHaveBeenCalledOnce();
});

it('reconsiders a word after the viewport, title, title size or OS font changes and ignores stale events', async () => {
  let fontScale = 3;
  let height = 874;
  vi.spyOn(ReactNative, 'useWindowDimensions').mockImplementation(() => ({
    width: host.windowWidth,
    height,
    scale: 1,
    fontScale,
  }));
  await render();
  const stale = native(title()).props.onTextLayout;
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  host.windowWidth = 874;
  await render();
  expect(direction()).toBe('row');
  await lines('Settings');
  expect(direction()).toBe('row');
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  fontScale = 1;
  await render();
  expect(direction()).toBe('row');
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  await render({ titleSize: 'lg' });
  expect(direction()).toBe('row');
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  height = 390;
  await render({ titleSize: 'lg' });
  expect(direction()).toBe('row');
  await render({ title: 'About', titleSize: 'lg' });
  expect(direction()).toBe('row');
  await lines('Abo', 'ut');
  expect(direction()).toBe('column');
  await act(async () => stale({ nativeEvent: { lines: [{ text: 'Setting' }, { text: 's' }] } }));
  expect(direction()).toBe('column');
  expect(title().textContent).toBe('About');
});
