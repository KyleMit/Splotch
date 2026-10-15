// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
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
