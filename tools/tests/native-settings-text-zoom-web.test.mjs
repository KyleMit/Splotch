// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  scrollSettingsPaneToSection,
  spiedSettingsSection,
} from '../../experiments/native-architecture/src/platform/settingsPane.web.ts';
import { SettingsTextZoom } from '../../experiments/native-architecture/src/platform/SettingsTextZoom.web.tsx';

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

it('uses live web section geometry after the pane reflows and elects its clamped final section', () => {
  const pane = document.createElement('div');
  const previous = document.createElement('section');
  previous.dataset.section = 'whatsnew';
  const section = document.createElement('section');
  section.dataset.section = 'about';
  pane.append(previous, section);
  document.body.append(pane);
  Object.defineProperties(pane, { clientHeight: { value: 642 }, scrollHeight: { value: 5365 } });
  pane.scrollTop = 4688;
  pane.getBoundingClientRect = () => ({ top: 226, height: 642 });
  section.getBoundingClientRect = () => ({ top: 598 });
  pane.scrollTo = vi.fn();
  const ref = { getScrollableNode: () => pane };
  try {
    scrollSettingsPaneToSection(ref, 'about', 4688, false);
    expect(pane.scrollTo).toHaveBeenCalledWith({ top: 5048, behavior: 'auto' });
    pane.scrollTop = pane.scrollHeight - pane.clientHeight;
    expect(
      spiedSettingsSection(ref, ['whatsnew', 'about'], [0, 5056], {
        offset: 4688,
        viewport: 642,
        content: 5365,
      })
    ).toBe('about');
  } finally {
    pane.remove();
  }
});
