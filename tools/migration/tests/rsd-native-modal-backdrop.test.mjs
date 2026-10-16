import { UNADOPTED_PAPER } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { records, root, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement, Fragment, useEffect, useLayoutEffect } from 'react';
import { Animated } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { ModalOriginProvider } from '../../../experiments/native-architecture/src/rsdDrawing/modalOrigin.tsx';
import { NativeFrame } from '../../../experiments/native-architecture/src/rsdDrawing/NativeFrame.tsx';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
import { RsdIconButton } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { ModalShell } from '../../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx';
import { useProductModalRoute } from '../../../experiments/native-architecture/src/product/useProductModalRoute.ts';
import { DialogHeader } from '../../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import {
  CSS_EASE,
  CSS_EASE_REVERSED,
  MODAL_EXIT_MS,
  MODAL_FADE_MS,
  MODAL_SCRIM_BLUR_PX,
  MODAL_SCRIM_FROSTED,
  MODAL_SCRIM_PLAIN,
} from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';

function dialog({
  visible = true,
  seeThrough = false,
  touchBackdrop,
  onClose = () => {},
  onDismiss,
} = {}) {
  return createElement(
    ModalShell,
    {
      visible,
      seeThrough,
      touchBackdrop,
      label: 'Drawing tools',
      size: 'sheet',
      onClose,
      onDismiss,
      header: createElement(DialogHeader, { title: 'Drawing tools', onClose }),
    },
    createElement('span', null, 'body')
  );
}

const latest = (testID) => records.props.findLast((props) => props.testID === testID);
const scrimColor = () => Object.assign({}, ...[latest('modal-scrim').style].flat()).backgroundColor;
// The blur view's latest transition, while it is mounted.
const blur = () =>
  host.querySelector('[data-testid="modal-backdrop-blur"]')
    ? latest('modal-backdrop-blur').blur
    : undefined;

function PassiveWork({ visible, exit, observe }) {
  useEffect(() => {
    if (!visible) observe(typeof exit.finish === 'function');
  }, [visible, exit, observe]);
  return null;
}

it('starts the shipping exit before unrelated passive work on Android', async () => {
  records.os = 'android';
  const observed = [];
  const observe = (started) => observed.push(started);
  const exit = {};
  const screen = (visible) =>
    createElement(
      Fragment,
      null,
      createElement(PassiveWork, { visible, exit, observe }),
      dialog({ visible })
    );
  await mount(screen(true));
  vi.spyOn(Animated, 'parallel').mockImplementationOnce((animations) => ({
    start(done) {
      animations.forEach((animation) => animation.start());
      exit.finish = () => done({ finished: true });
    },
    stop() {},
  }));
  try {
    await act(async () => root.render(screen(false)));
    expect(observed).toEqual([true]);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => exit.finish());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    vi.restoreAllMocks();
  }
});

function RouteCommit({ target, observe, onDismissed }) {
  const route = useProductModalRoute('reported', target, onDismissed);
  useLayoutEffect(() => {
    observe(route);
  });
  return null;
}

it('closes the product route in its first committed render', async () => {
  records.os = 'android';
  const commits = [];
  const observe = (route) => commits.push(route);
  const onDismissed = vi.fn();
  const screen = (target) => createElement(RouteCommit, { target, observe, onDismissed });
  await mount(screen('settings'));
  commits.length = 0;
  await act(async () => root.render(screen('none')));
  expect(commits.map(({ visible }) => visible)).toEqual([false]);
  expect(commits[0]).toMatchObject({ shown: 'settings', closing: true, epoch: 1 });
  expect(onDismissed).not.toHaveBeenCalled();
});

it.each(['settings', 'feedback'])(
  'retains the route epoch while the closing target becomes %s',
  async (target) => {
    const commits = [];
    const observe = (route) => commits.push(route);
    const onDismissed = vi.fn();
    const screen = (next) => createElement(RouteCommit, { target: next, observe, onDismissed });
    await mount(screen('settings'));
    await act(async () => root.render(screen('none')));
    const outgoing = commits.at(-1).dismissed;
    await act(async () => root.render(screen(target)));
    expect(commits.at(-1)).toMatchObject({ shown: 'settings', closing: true, epoch: 1 });
    await act(async () => outgoing());
    expect(commits.at(-1)).toMatchObject({ shown: target, closing: false, epoch: 2 });
    expect(onDismissed).toHaveBeenCalledExactlyOnceWith('settings');
    await act(async () => root.render(screen('none')));
    const current = commits.at(-1).dismissed;
    await act(async () => outgoing());
    expect(commits.at(-1)).toMatchObject({ shown: target, closing: true, epoch: 2 });
    expect(onDismissed).toHaveBeenCalledOnce();
    await act(async () => current());
    expect(commits.at(-1)).toMatchObject({ shown: 'none', closing: false, epoch: 3 });
    expect(onDismissed.mock.calls).toEqual([['settings'], [target]]);
  }
);

function CompletionPassiveWork({ completed, observe }) {
  useEffect(() => {
    if (completed) observe('passive');
  }, [completed, observe]);
  return null;
}

it.each(['android', 'web'])(
  'reports a completed exit before unrelated passive work on %s',
  async (os) => {
    records.os = os;
    const order = [];
    const observe = (step) => order.push(step);
    const onDismiss = vi.fn(() => observe('dismiss'));
    const screen = (visible, completed = false) =>
      createElement(
        Fragment,
        null,
        createElement(CompletionPassiveWork, { completed, observe }),
        dialog({ visible, onDismiss })
      );
    await mount(screen(true));
    const exit = {};
    vi.spyOn(Animated, 'parallel').mockImplementationOnce((animations) => ({
      start(done) {
        animations.forEach((animation) => animation.start());
        exit.finish = () => done({ finished: true });
      },
      stop() {},
    }));
    try {
      await act(async () => root.render(screen(false)));
      expect(onDismiss).not.toHaveBeenCalled();
      await act(async () => {
        exit.finish();
        root.render(screen(false, true));
      });
      expect(order).toEqual(['dismiss', 'passive']);
      expect(onDismiss).toHaveBeenCalledOnce();
      await act(async () => exit.finish());
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(host.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  }
);

it('ignores a canceled exit callback after the dialog reopens', async () => {
  records.os = 'android';
  const onDismiss = vi.fn();
  await mount(dialog({ onDismiss }));
  const exit = {};
  vi.spyOn(Animated, 'parallel').mockImplementationOnce((animations) => ({
    start(done) {
      animations.forEach((animation) => animation.start());
      exit.finish = (finished) => done({ finished });
    },
    stop() {},
  }));
  try {
    await act(async () => root.render(dialog({ visible: false, onDismiss })));
    await act(async () => exit.finish(false));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => root.render(dialog({ onDismiss })));
    await act(async () => exit.finish(true));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    vi.restoreAllMocks();
  }
});

describe('the dialog backdrop', () => {
  it('blurs the screen behind on iOS under the frosted dim, and unblurs with the exit', async () => {
    await mount(dialog());
    expect(scrimColor()).toBe(MODAL_SCRIM_FROSTED);
    expect(blur()).toEqual({
      radius: MODAL_SCRIM_BLUR_PX,
      durationMs: MODAL_FADE_MS,
      easing: CSS_EASE,
      theme: 'light',
    });
    await act(async () => root.render(dialog({ visible: false })));
    // The exit's last render, before the closed modal unmounts it.
    expect(latest('modal-backdrop-blur').blur).toEqual({
      radius: 0,
      durationMs: MODAL_EXIT_MS,
      easing: CSS_EASE_REVERSED,
      theme: 'light',
    });
  });

  it('asks iOS for the blur tint that suits the dark paper', async () => {
    await mount(createElement(DrawingAppearanceProvider, { preference: 'dark' }, dialog()));
    expect(blur()).toMatchObject({ radius: MODAL_SCRIM_BLUR_PX, theme: 'dark' });
  });

  // Shipping's Android WebView draws the frosted dim and none of its blur.
  it('dims with the frosted tint and no blur on Android, as shipping does there', async () => {
    records.os = 'android';
    await mount(dialog());
    expect(blur()).toBeUndefined();
    expect(scrimColor()).toBe(MODAL_SCRIM_FROSTED);
  });

  it('keeps the plain dim with no blur when the reader asked for less transparency', async () => {
    records.reduceTransparency = true;
    await mount(dialog());
    expect(blur()).toBeUndefined();
    expect(scrimColor()).toBe(MODAL_SCRIM_PLAIN);
  });

  it('keeps the plain dim with no blur for a dialog whose touch backdrop is plain', async () => {
    await mount(dialog({ touchBackdrop: 'plain' }));
    expect(blur()).toBeUndefined();
    expect(scrimColor()).toBe(MODAL_SCRIM_PLAIN);
  });

  it('drops and restores the blur at once around a see-through dialog', async () => {
    await mount(dialog());
    await act(async () => root.render(dialog({ seeThrough: true })));
    expect(blur()).toMatchObject({ radius: 0, durationMs: 0 });
    await act(async () => root.render(dialog()));
    expect(blur()).toMatchObject({ radius: MODAL_SCRIM_BLUR_PX, durationMs: 0 });
    await act(async () => root.render(dialog({ visible: false })));
    expect(latest('modal-backdrop-blur').blur).toMatchObject({
      radius: 0,
      durationMs: MODAL_EXIT_MS,
    });
  });
});

it('uses the secondary chrome contact for the dialog opener dead zone', async () => {
  const layout = createElement(
    NativeDrawingLayout,
    {
      bareGlass: null,
      paper: UNADOPTED_PAPER,
      paperPresentations: new WeakMap(),
      empty: true,
      departingPaper: null,
      palette: () => null,
      clearUnderlay: () => null,
      clearOverlay: null,
      settings: null,
      status: null,
      overlays: null,
      capturePress: () => false,
      actionsPanel: () =>
        createElement(RsdIconButton, {
          skin: 'corner',
          icon: 'settings',
          label: 'Open tools',
          onPress: () => root.render(screen(true)),
        }),
    },
    () => 'paper'
  );
  const screen = (visible) =>
    createElement(
      ModalOriginProvider,
      null,
      createElement(NativeFrame, null, layout),
      dialog({ visible })
    );
  await mount(screen(false));
  const trigger = host.querySelector('[aria-label="Open tools"]');
  trigger.getBoundingClientRect = () => ({ x: 30, y: 740, width: 60, height: 60 });
  trigger.measureInWindow = (done) => done(30, 740, 60, 60);
  const first = { identifier: 1, pageX: 100, pageY: 100, timestamp: 50 };
  const second = { identifier: 2, pageX: 40, pageY: 760, timestamp: 100 };
  const packet = (lifted) => ({
    persist() {},
    nativeEvent: {
      ...first,
      touches: lifted ? [first] : [first, second],
      changedTouches: [second],
    },
  });
  const frame = records.props.findLast((props) => props.testID === 'rsd-safe-area-frame');
  const handlers = records.props.findLast((props) => props.testID === 'rsd-drawing-layout');
  await act(async () => {
    frame.onStartShouldSetResponderCapture(packet(false));
    handlers.onStartShouldSetResponderCapture(packet(false));
    handlers.onTouchEnd(packet(true));
  });
  const stage = records.props.findLast(
    (props) =>
      props.onStartShouldSetResponderCapture &&
      props.testID !== 'rsd-safe-area-frame' &&
      props.testID !== 'rsd-drawing-layout'
  );
  expect(stage.onStartShouldSetResponderCapture({ nativeEvent: second })).toBe(true);
  expect(stage.onStartShouldSetResponderCapture({ nativeEvent: first })).toBe(false);
});

it('routes native Escape to the visible modal and ignores its departed receiver', async () => {
  const close = vi.fn();
  await mount(dialog({ onClose: close }));
  const receiver = records.props.findLast((props) => props.testID === 'modal-keyboard-scope');
  expect(receiver).toBeDefined();
  await act(async () => receiver.onShortcutKey({ nativeEvent: { key: 'escape' } }));
  expect(close).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  await act(async () => receiver.onShortcutKey({ nativeEvent: { key: 'escape' } }));
  expect(close).toHaveBeenCalledOnce();
});
