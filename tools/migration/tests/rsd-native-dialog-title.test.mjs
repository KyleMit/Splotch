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
  expect(native(title()).style).toMatchObject({ flexGrow: 0, flexShrink: 0 });
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
  const close = controls.querySelector('[aria-label="Close"]');
  expect(close).not.toBeNull();
  const trailing = close.parentElement;
  expect(native(trailing).style).toMatchObject({ marginLeft: 'auto', flexDirection: 'row' });
  expect(trailing.textContent).toContain('Action');
  expect(trailing.querySelector('[aria-label="Back"]')).toBeNull();
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
  const narrow = title();
  host.windowWidth = 874;
  await render();
  expect(title()).not.toBe(narrow);
  expect(direction()).toBe('row');
  await lines('Settings');
  expect(direction()).toBe('row');
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  const large = title();
  fontScale = 1;
  await render();
  expect(title()).not.toBe(large);
  expect(direction()).toBe('row');
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  const extraLarge = title();
  await render({ titleSize: 'lg' });
  expect(title()).not.toBe(extraLarge);
  expect(direction()).toBe('row');
  await lines('Setting', 's');
  expect(direction()).toBe('column');
  const beforeHeight = title();
  height = 390;
  await render({ titleSize: 'lg' });
  expect(title()).toBe(beforeHeight);
  expect(direction()).toBe('column');
  await render({ title: 'About', titleSize: 'lg' });
  expect(direction()).toBe('row');
  await lines('Abo', 'ut');
  expect(direction()).toBe('column');
  await act(async () => stale({ nativeEvent: { lines: [{ text: 'Setting' }, { text: 's' }] } }));
  expect(direction()).toBe('column');
  expect(title().textContent).toBe('About');
});

it.each([
  ['Go Go', ['Go G', 'o']],
  ['Draw Drawing', ['Dr', 'aw Drawing']],
])('detects each occurrence of a split word in %s', async (text, wrapped) => {
  await render({ title: text });
  await lines(...wrapped);
  expect(direction()).toBe('column');
});

const ROW_PX = 330;
const WORD_PX = 520;
const measuredWords = () =>
  [...container.querySelectorAll('span[aria-hidden="true"]')]
    .map((node) => node.textContent)
    .filter(Boolean);
async function widthLines(...text) {
  await act(async () =>
    native(title()).props.onTextLayout({
      nativeEvent: { lines: text.map(([line, width]) => ({ text: line, width })) },
    })
  );
}

it('shrinks a word wider than its own full row just enough to fit, keeping OS scaling', async () => {
  host.layoutOf = (node) => ({
    x: 0,
    y: 0,
    width: node.getAttribute('role') === 'heading' ? ROW_PX : WORD_PX,
    height: 40,
  });
  await render({ title: 'Appearance' });
  const size = native(title()).style.fontSize;
  await widthLines(['Appearan', 300], ['ce', 40]);
  expect(direction()).toBe('column');
  expect(native(title()).style.fontSize).toBe(size);
  expect(measuredWords()).toEqual([]);
  await widthLines(['Appearanc', 320], ['e', 20]);
  expect(measuredWords()).toEqual(['Appearance']);
  const fitted = (size * ROW_PX * 0.98) / WORD_PX;
  expect(native(title()).style.fontSize).toBeCloseTo(fitted);
  expect(native(title()).props.allowFontScaling).not.toBe(false);
  expect(native(title()).props.maxFontSizeMultiplier).toBeUndefined();
  expect(native(title()).props.adjustsFontSizeToFit).toBeUndefined();
  expect(title().textContent).toBe('Appearance');
  expect(container.querySelectorAll('[role="heading"]')).toHaveLength(1);
  await widthLines(['Appearance', 318]);
  expect(native(title()).style.fontSize).toBeCloseTo(fitted);
  await widthLines(['Appearanc', 318], ['e', 4]);
  expect(native(title()).style.fontSize).toBeCloseTo(fitted * 0.95);
});

it('lets a word that fits its own row keep its full scaled size', async () => {
  host.layoutOf = () => ({ x: 0, y: 0, width: ROW_PX, height: 40 });
  await render({ title: 'Settings' });
  const size = native(title()).style.fontSize;
  await widthLines(['Setting', 300], ['s', 20]);
  expect(direction()).toBe('column');
  await widthLines(['Settings', 320]);
  expect(native(title()).style.fontSize).toBe(size);
  expect(measuredWords()).toEqual([]);
});
