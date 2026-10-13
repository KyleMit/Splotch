import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { html } from 'react-strict-dom';
import { styles } from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import { RsdRecoveryNotice } from '../../../experiments/native-architecture/src/rsdDrawing/RsdRecoveryNotice.tsx';
import { TOUCH_TARGET } from '../../../experiments/native-architecture/src/drawing/theme.ts';
const records = vi.hoisted(() => ({ props: [], viewports: [] }));
vi.mock('react-native-svg', () => ({ SvgXml: () => null }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const host = (tag) =>
    React.forwardRef((props, ref) => {
      records.props.push(props);
      return React.createElement(
        tag,
        {
          ref,
          role: props.role,
          disabled: props.disabled,
          'aria-label': props.accessibilityLabel,
          'data-checked': props.accessibilityState?.checked,
          'data-native-background': props.style?.backgroundColor,
          'data-native-color': props.style?.color,
          onClick: props.disabled ? undefined : () => props.onPress?.({ nativeEvent: {} }),
        },
        props.children
      );
    });
  const Text = host('span'),
    Pressable = host('button'),
    View = host('div');
  return {
    StyleSheet: { create: (value) => value },
    ScrollView: React.forwardRef((props, ref) => {
      records.viewports.push(props);
      return React.createElement(
        'section',
        { ref, 'data-testid': props.testID, 'aria-label': props.accessibilityLabel },
        props.children
      );
    }),
    Platform: {
      OS: 'ios',
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    Animated: { createAnimatedComponent: (component) => component, View, Text, Image: View },
    Easing: {},
    useWindowDimensions: () => ({ width: 402, height: 874, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    Text,
    Pressable,
    View,
    SafeAreaView: View,
    Modal: View,
    Image: View,
    TextInput: host('input'),
    experimental_LayoutConformance: View,
  };
});
vi.mock('react-native/Libraries/Text/TextAncestor', async () => {
  const React = await import('react');
  return { default: React.createContext(false) };
});
vi.mock('react-native/Libraries/Components/View/ViewNativeComponent', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef((props, ref) => {
      records.props.push(props);
      return React.createElement(
        'div',
        { ref, role: props.role, 'aria-label': props.accessibilityLabel },
        props.children
      );
    }),
  };
});
let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
async function mount(element) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  return host;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
  records.props.length = 0;
  records.viewports.length = 0;
});
function recoveryState(pictures = []) {
  return { status: 'ready', pictures, busy: false, notice: '' };
}
function held(id) {
  return {
    id,
    filename: `splotch-${id}.png`,
    durable: true,
    attempt: { status: 'sharing-closed' },
  };
}
function screen(state) {
  return {
    drawing: false,
    pagePickerOpen: false,
    settingsOpen: false,
    pngRecovery: { state, dismiss: vi.fn(), retry: vi.fn() },
  };
}
function render(screen) {
  return createElement(
    html.div,
    { style: styles.screen },
    createElement(RsdRecoveryNotice, { screen, blocked: false })
  );
}
function assertViewport(props) {
  if (
    props.testID !== 'rsd-png-recovery-viewport' ||
    props.accessibilityLabel !== 'PNG recovery' ||
    props.accessible !== false ||
    props.style.maxHeight !== '25%' ||
    props.style.flexGrow !== 0 ||
    props.removeClippedSubviews !== false
  )
    throw new Error('Missing bounded recovery viewport');
}
it('keeps three exact PNG actions in a named bounded native viewport through the released RSD renderer', async () => {
  const state = recoveryState(['png-1-first', 'png-2-second', 'png-3-third'].map(held));
  const owner = screen(state);
  await mount(render(owner));
  const viewport = records.viewports.at(-1);
  assertViewport(viewport);
  expect(viewport.scrollEnabled).toBe(true);
  const section = host.querySelector('[data-testid="rsd-png-recovery-viewport"]');
  const buttons = [...section.querySelectorAll('button')];
  expect(buttons.map((button) => button.textContent)).toEqual([
    ...state.pictures.map(() => 'Dismiss'),
    'Try PNG export again',
  ]);
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
    ...state.pictures.map((picture) => `Dismiss held PNG ${picture.filename}`),
    'Try PNG export again',
  ]);
  for (const picture of state.pictures) {
    expect(section.textContent.split(picture.filename)).toHaveLength(2);
    const props = records.props.findLast(
      (entry) => entry.accessibilityLabel === `Dismiss held PNG ${picture.filename}`
    );
    expect(props.style.minWidth).toBe(TOUCH_TARGET);
    expect(props.style.minHeight).toBe(TOUCH_TARGET);
    expect(props.accessibilityState.disabled).toBe(false);
  }
  await act(async () => buttons[2].click());
  expect(owner.pngRecovery.dismiss).toHaveBeenCalledExactlyOnceWith('png-3-third');
  expect(owner.pngRecovery.retry).not.toHaveBeenCalled();
  expect(
    records.props.some(
      (props) =>
        props.style?.flexGrow === 1 &&
        props.style?.flexShrink === 1 &&
        props.style?.flexBasis === 0 &&
        props.style?.minHeight === 0
    )
  ).toBe(true);
});
it('freezes recovery content and disables its actions and scrolling during live drawing contacts', async () => {
  const owner = screen(recoveryState([held('png-1-first'), held('png-2-second')]));
  await mount(render(owner));
  owner.drawing = true;
  owner.pngRecovery.state = recoveryState([held('png-2-second')]);
  await act(async () => root.render(render(owner)));
  expect(records.viewports.at(-1).scrollEnabled).toBe(false);
  expect(
    [...host.querySelectorAll('button')].filter((node) => node.textContent.startsWith('Dismiss'))
  ).toHaveLength(2);
  await act(async () => host.querySelector('button').click());
  expect(owner.pngRecovery.dismiss).not.toHaveBeenCalled();
  owner.drawing = false;
  await act(async () => root.render(render(owner)));
  expect(
    [...host.querySelectorAll('button')].filter((node) => node.textContent.startsWith('Dismiss'))
  ).toHaveLength(1);
  expect(records.viewports.at(-1).scrollEnabled).toBe(true);
});
it('allocates no empty recovery viewport and preserves the unreadable-state retry consumer', async () => {
  const owner = screen(recoveryState());
  await mount(render(owner));
  expect(records.viewports).toHaveLength(0);
  owner.pngRecovery.state = { ...recoveryState(), status: 'unreadable' };
  await act(async () => root.render(render(owner)));
  assertViewport(records.viewports.at(-1));
  await act(async () => host.querySelector('button').click());
  expect(owner.pngRecovery.retry).toHaveBeenCalledOnce();
});
it('rejects an unbounded, grouped or clipping recovery-host substitution', async () => {
  await mount(render(screen(recoveryState([held('png-1-first')]))));
  const props = records.viewports.at(-1);
  for (const bad of [
    { ...props, style: { ...props.style, maxHeight: undefined } },
    { ...props, accessible: true },
    { ...props, removeClippedSubviews: true },
    { ...props, testID: 'other-viewport' },
  ])
    expect(() => assertViewport(bad)).toThrow('Missing bounded recovery viewport');
});
