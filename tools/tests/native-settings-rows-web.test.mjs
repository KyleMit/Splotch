// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { brand, scale, themes } from '../../web/src/lib/design/tokens.ts';
import { ReduceMotionPreferenceProvider } from '../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import { LineClampBox } from '../../experiments/native-architecture/src/rsdDrawing/lineClampBox.web.tsx';
import { RsdHubRow } from '../../experiments/native-architecture/src/rsdDrawing/RsdHubRow.tsx';
import { RsdToggleRow } from '../../experiments/native-architecture/src/rsdDrawing/RsdToggleRow.tsx';
import { RsdToggleSwitch } from '../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.web.tsx';

// The web build compiles React Strict DOM to real elements and class names; this stand-in renders
// the same elements with each one's merged style as data, so the props a browser receives can be
// read. Rows import each platform module by its bare path, which Metro resolves to the .web file.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/lineClampBox.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/lineClampBox.web.tsx')
);
vi.mock('react-strict-dom', async () => {
  const React = await import('react');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const elements = new Map();
  const element = (tag) => {
    if (!elements.has(tag))
      elements.set(tag, ({ style, for: htmlFor, ...props }) =>
        React.createElement(tag, { ...props, htmlFor, 'data-style': JSON.stringify(flat(style)) })
      );
    return elements.get(tag);
  };
  return {
    html: new Proxy({}, { get: (_, tag) => element(tag) }),
    css: { create: (styles) => styles, defineVars: (values) => values, createTheme: () => ({}) },
  };
});
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove() {} }),
  },
  StatusBar: () => null,
  useColorScheme: () => 'light',
}));
vi.mock('react-native-svg', () => ({
  SvgXml: ({ width, height }) => h('svg', { width, height }),
}));

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(element, reduceMotion = 'system') {
  await act(async () =>
    root.render(h(ReduceMotionPreferenceProvider, { preference: reduceMotion }, element))
  );
}

const style = (node) => JSON.parse(node.dataset.style);
const control = () => host.querySelector('button[role="switch"]');
const slide = () => host.querySelector('[data-testid="toggle-switch-slide"]');
const track = () => host.querySelector('[data-testid="toggle-switch-track"]');

function toggleRow(props = {}) {
  return h(RsdToggleRow, {
    icon: 'sound',
    label: 'Sound',
    id: 'sound-toggle',
    checked: false,
    onToggle: () => {},
    help: 'Plays drawing sounds.',
    ...props,
  });
}

it('renders a button switch labelled by its row and described by the help line', async () => {
  const onToggle = vi.fn();
  await render(toggleRow({ onToggle }));
  const button = control();
  expect(button.id).toBe('sound-toggle');
  expect(button.getAttribute('aria-label')).toBe('Sound');
  expect(button.getAttribute('aria-checked')).toBe('false');
  const help = host.querySelector(`#${button.getAttribute('aria-describedby')}`);
  expect(help.textContent).toBe('Plays drawing sounds.');
  expect(host.querySelector('label').htmlFor).toBe('sound-toggle');
  await act(async () => button.click());
  expect(onToggle).toHaveBeenCalledWith(true);
});

it('disables the button with its row', async () => {
  const onToggle = vi.fn();
  await render(toggleRow({ onToggle, disabled: true }));
  expect(control().disabled).toBe(true);
  expect(control().getAttribute('aria-disabled')).toBe('true');
  await act(async () => control().click());
  expect(onToggle).not.toHaveBeenCalled();
});

it('slides the thumb by a CSS transition over the shipping duration', async () => {
  const props = { id: 'demo', label: 'Demo', checked: false, onToggle: () => {} };
  await render(h(RsdToggleSwitch, props));
  expect(style(slide())).toMatchObject({
    transform: 'translateX(0)',
    transitionProperty: 'transform',
    transitionDuration: scale.durationBase,
    transitionTimingFunction: 'ease',
  });
  await render(h(RsdToggleSwitch, { ...props, checked: true }));
  expect(style(slide()).transform).toBe('translateX(20px)');
  expect(style(track()).backgroundColor).toBe(brand.brand);
});

it('stops the slide, not the state, under reduced motion', async () => {
  await render(
    h(RsdToggleSwitch, { id: 'demo', label: 'Demo', checked: true, onToggle: () => {} }),
    'reduce'
  );
  expect(style(slide())).toMatchObject({ transform: 'translateX(20px)', transitionDuration: '0s' });
});

it('lifts the track a step under a mouse, as the shipping hover does', async () => {
  await render(
    h(RsdToggleSwitch, { id: 'demo', label: 'Demo', checked: false, onToggle: () => {} })
  );
  expect(style(track()).backgroundColor).toBe(themes.light.controlTrack);
  await act(async () =>
    control().dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
    )
  );
  expect(style(track()).backgroundColor).toBe(themes.light.controlTrackHover);
});

// A bare `line-clamp` is all React Strict DOM emits for lineClamp, and browsers ignore it outside
// a -webkit-box: without this box a long subtitle runs to every line it needs.
// Server markup keeps the vendor-prefixed declarations that happy-dom's style parser drops.
it('clamps the hub subtitle to two lines in a -webkit-box, as shipping does', async () => {
  const subtitle = 'Choose when grown-up checks appear for every tool in the drawer';
  await render(
    h(RsdHubRow, { icon: 'sound', title: 'Sound', subtitle, unseen: false, onOpen: () => {} })
  );
  const title = [...host.querySelectorAll('span')].find((span) => span.textContent === 'Sound');
  expect(style(title).overflowWrap).toBe('normal');
  expect(style(host.querySelector('[data-testid="hub-subtitle"]')).overflowWrap).toBe('normal');
  const clamp = host.querySelector('[data-testid="hub-subtitle"] > [data-line-clamp]');
  expect(clamp.textContent).toBe(subtitle);
  const markup = renderToStaticMarkup(
    h(LineClampBox, { lines: Number(clamp.dataset.lineClamp) }, subtitle)
  );
  const declared = markup.match(/style="([^"]*)"/)[1];
  for (const declaration of [
    'display:-webkit-box',
    '-webkit-box-orient:vertical',
    '-webkit-line-clamp:2',
    'overflow:hidden',
  ])
    expect(declared).toContain(declaration);
});
