// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintColors } from '../../experiments/native-architecture/src/drawing/PaintColors.tsx';
import { ColorPicker } from '../../experiments/native-architecture/src/drawing/ColorPicker.tsx';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock('../../experiments/native-architecture/src/drawing/measurePaper.ts', () => ({
  measurePaper: (_host, complete) => complete({ width: 260, height: 260, pageX: 0, pageY: 0 }),
}));
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('custom color controls through installed React Native Web', () => {
  it('exposes named paints and all custom paints with exactly the real selected toggle semantics', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      createElement(PaintColors, {
        color: '#123ABC',
        customColors: ['#123ABC', '#FFFFFF'],
        disabled: false,
        pickerOpen: false,
        onChange() {},
        onExplore() {},
      })
    );
    const buttons = [...host.querySelectorAll('[role="button"]')];
    expect(buttons.map((node) => node.getAttribute('aria-label'))).toContain('Purple paint');
    expect(buttons.map((node) => node.getAttribute('aria-label'))).toContain('More colors');
    const selected = buttons.filter((node) => node.getAttribute('aria-pressed') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('aria-label')).toBe('Custom paint #123ABC');
    expect(selected[0].textContent).toBe('✓');
  });
  it('blocks actual disabled swatch activation and retains selected semantics', async () => {
    const changed = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(PaintColors, {
          color: '#123ABC',
          customColors: ['#123ABC'],
          disabled: true,
          pickerOpen: false,
          onChange: changed,
          onExplore() {},
        })
      )
    );
    const selected = host.querySelector('[aria-pressed="true"]');
    expect(selected.getAttribute('aria-disabled')).toBe('true');
    expect(selected.tabIndex).toBe(-1);
    await act(async () => selected.click());
    expect(changed).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'keeps initial focus with pickerOpen %s under StrictMode',
    async (pickerOpen) => {
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      const host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);
      await act(async () =>
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(PaintColors, {
              color: 'Purple',
              customColors: [],
              disabled: pickerOpen,
              pickerOpen,
              onChange() {},
              onExplore() {},
            })
          )
        )
      );
      expect(document.activeElement).toBe(outside);
    }
  );
  it('restores the opener only when an enabled picker closes under StrictMode', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const renderColors = async (pickerOpen, disabled) =>
      act(async () =>
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(PaintColors, {
              color: 'Purple',
              customColors: [],
              disabled,
              pickerOpen,
              onChange() {},
              onExplore() {},
            })
          )
        )
      );
    await renderColors(false, false);
    await renderColors(false, true);
    await renderColors(false, false);
    expect(document.activeElement).toBe(outside);
    await renderColors(true, true);
    expect(document.activeElement).toBe(outside);
    await renderColors(false, false);
    const opener = host.querySelector('[aria-label="More colors"]');
    expect(document.activeElement).toBe(opener);
    outside.focus();
    await renderColors(true, true);
    await renderColors(false, true);
    expect(document.activeElement).toBe(outside);
    await renderColors(false, false);
    expect(document.activeElement).toBe(outside);
    await renderColors(true, true);
    await renderColors(false, false);
    expect(document.activeElement).toBe(opener);
  });
  it('uses the actual modal focus trap and native color buttons, applies only Use color and restores focus on close', async () => {
    const chosen = vi.fn();
    const closed = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = 'More colors';
    document.body.append(trigger);
    trigger.focus();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(ColorPicker, { selected: 'Purple', onChoose: chosen, onClose: closed })
      )
    );
    const opening = document.querySelector('[aria-label="Color picker"]');
    await act(async () =>
      opening.parentElement.parentElement.dispatchEvent(
        new Event('animationend', { bubbles: true })
      )
    );
    const modal = document.querySelector('[role="dialog"]');
    expect(modal.getAttribute('aria-label')).toBe('Color picker');
    const tile = modal.querySelector('[aria-label^="Explore "]');
    expect(tile.tagName).toBe('BUTTON');
    await act(async () => tile.click());
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(chosen).not.toHaveBeenCalled();
    const otherTile = modal.querySelectorAll('[aria-label^="Explore "]')[1];
    await act(async () =>
      otherTile.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    );
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(otherTile.getAttribute('aria-pressed')).toBe('false');
    const use = modal.querySelector('[aria-label="Use color"]');
    await act(async () => use.click());
    expect(chosen).toHaveBeenCalledWith(tile.getAttribute('aria-label').slice('Explore '.length));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    });
    expect(closed).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = null;
    expect(document.activeElement).toBe(trigger);
  });
});
