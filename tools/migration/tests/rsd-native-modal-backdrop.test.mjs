import { records, root, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { describe, expect, it } from 'vitest';
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

function dialog({ visible = true, seeThrough = false, touchBackdrop } = {}) {
  return createElement(
    ModalShell,
    {
      visible,
      seeThrough,
      touchBackdrop,
      label: 'Drawing tools',
      size: 'sheet',
      onClose() {},
      header: createElement(DialogHeader, { title: 'Drawing tools', onClose() {} }),
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

  it.each([
    [31, true],
    [30, false],
  ])('blurs on Android API %i: %s', async (api, blurs) => {
    records.os = 'android';
    records.androidApi = api;
    await mount(dialog());
    expect(blur() !== undefined).toBe(blurs);
    expect(scrimColor()).toBe(blurs ? MODAL_SCRIM_FROSTED : MODAL_SCRIM_PLAIN);
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
