import { UNADOPTED_PAPER } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { records, root, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModalOriginProvider } from '../../../experiments/native-architecture/src/rsdDrawing/modalOrigin.tsx';
import { NativeFrame } from '../../../experiments/native-architecture/src/rsdDrawing/NativeFrame.tsx';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
import { RsdIconButton } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { ModalShell } from '../../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx';
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

function dialog({ visible = true, seeThrough = false, touchBackdrop, onClose = () => {} } = {}) {
  return createElement(
    ModalShell,
    {
      visible,
      seeThrough,
      touchBackdrop,
      label: 'Drawing tools',
      size: 'sheet',
      onClose,
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
