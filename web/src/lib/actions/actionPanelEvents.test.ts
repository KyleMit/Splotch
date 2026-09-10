import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actionPanelEvents } from './actionPanelEvents';

let panel: HTMLDivElement;
let wrapper: HTMLDivElement;
let action: ReturnType<typeof actionPanelEvents>;
const close = vi.fn();
const stopMotion = vi.fn();

beforeEach(() => {
  close.mockClear();
  stopMotion.mockClear();
  panel = document.createElement('div');
  wrapper = document.createElement('div');
  panel.append(wrapper);
  document.body.append(panel);
  action = actionPanelEvents(panel, { wrapper: () => wrapper, close, stopMotion });
});
afterEach(() => {
  action.destroy();
  panel.remove();
});

it('dismisses outside presses while preserving presses in the open wrapper', () => {
  wrapper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(close).not.toHaveBeenCalled();
  panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(close).toHaveBeenCalledTimes(1);
});

it('restores focus on Escape and uses the current open wrapper', () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(close).toHaveBeenCalledExactlyOnceWith({ restoreFocus: true });
  action.update({ wrapper: () => undefined, close, stopMotion });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(close).toHaveBeenCalledTimes(1);
});

it('stops orientation motion and removes listeners on teardown', () => {
  window.dispatchEvent(new Event('orientationchange'));
  expect(stopMotion).toHaveBeenCalledTimes(1);
  action.destroy();
  expect(stopMotion).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event('orientationchange'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(stopMotion).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
});
