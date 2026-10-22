// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ScrollView } from 'react-native-web';
import { expect, it, vi } from 'vitest';
import {
  scrollSettingsPaneToSection,
  spiedSettingsSection,
} from '../../src/platform/settingsPane.web.ts';
import { SettingsTextZoom } from '../../src/platform/SettingsTextZoom.web.tsx';

it('wires the shipping pinch owner, blocks its trailing tap and resets when Settings closes', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const open = vi.fn();
  const child = createElement('button', { onClick: open }, 'Sound');
  try {
    await act(async () => root.render(createElement(SettingsTextZoom, { enabled: true }, child)));
    const pane = host.firstElementChild;
    expect(pane.style.touchAction).toBe('pan-x pan-y');
    pane.setPointerCapture = () => {};
    pane.hasPointerCapture = () => false;
    const pointer = (type, id, x) =>
      pane.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: 0,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
        })
      );
    pointer('pointerdown', 1, 0);
    pointer('pointerdown', 2, 100);
    pointer('pointermove', 2, 200);
    expect(pane.style.zoom).toBe('2');
    pointer('pointerup', 1, 0);
    pointer('pointerup', 2, 200);
    host
      .querySelector('button')
      .dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
    expect(open).not.toHaveBeenCalled();
    host
      .querySelector('button')
      .dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    expect(open).toHaveBeenCalledOnce();
    await act(async () => root.render(createElement(SettingsTextZoom, { enabled: false }, child)));
    expect(pane.style.zoom).toBe('');
    expect(pane.style.touchAction).toBe('');
    await act(async () => root.render(createElement(SettingsTextZoom, { enabled: true }, child)));
    pointer('pointerdown', 1, 0);
    pointer('pointerdown', 2, 100);
    pointer('pointermove', 2, 150);
    expect(pane.style.zoom).toBe('1.5');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('uses the real web ScrollView API and live section geometry after the pane reflows', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let ref;
  try {
    await act(async () =>
      root.render(
        createElement(
          ScrollView,
          {
            ref: (value) => {
              ref = value;
            },
          },
          createElement('section', { 'data-section': 'whatsnew' }),
          createElement('section', { 'data-section': 'about' })
        )
      )
    );
    const pane = ref.getScrollableNode();
    const section = pane.querySelector('[data-section="about"]');
    Object.defineProperties(pane, { clientHeight: { value: 642 }, scrollHeight: { value: 5365 } });
    pane.scrollTop = 4688;
    pane.getBoundingClientRect = () => ({ top: 226, height: 642 });
    section.getBoundingClientRect = () => ({ top: 598 });
    pane.scroll = vi.fn(({ top }) => {
      pane.scrollTop = Math.min(top, pane.scrollHeight - pane.clientHeight);
    });
    scrollSettingsPaneToSection(ref, 'about', 4688, false);
    expect(pane.scroll).toHaveBeenCalledWith({ top: 5048, left: 0, behavior: 'auto' });
    expect(pane.scrollTop).toBe(4723);
    expect(
      spiedSettingsSection(ref, ['whatsnew', 'about'], [0, 5056], {
        offset: 4688,
        viewport: 642,
        content: 5365,
      })
    ).toBe('about');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
