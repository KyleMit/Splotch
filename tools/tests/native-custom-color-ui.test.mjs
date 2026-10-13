// @vitest-environment happy-dom
import './native-feedback-drawing-fixture.mjs';
import { act, createElement, forwardRef, StrictMode, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintColors } from '../../experiments/native-architecture/src/drawing/PaintColors.tsx';
import { ColorPicker } from '../../experiments/native-architecture/src/drawing/ColorPicker.tsx';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { AppState } from 'react-native';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';

const platform = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  release: vi.fn(),
  lock: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: { read: platform.read, write: platform.write },
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async () => 'sharing-closed',
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: async () => [],
  reopenPicture: vi.fn(),
  savePicture: vi.fn(),
  exportPng: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({
      lockInput: platform.lock,
      refreshGeometry() {},
    }));
    return null;
  }),
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => {
  const storage = { read: async () => null, write: async () => {} };
  return {
    drawingDraftStorage: storage,
    protectedDraftPageIds: async () => [],
  };
});
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock('../../experiments/native-architecture/src/drawing/measurePaper.ts', () => ({
  measurePaper: (_host, complete) => complete({ width: 260, height: 260, pageX: 0, pageY: 0 }),
}));
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  platform.read.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  platform.write.mockReset().mockResolvedValue();
  platform.release.mockReset();
  platform.lock.mockReset().mockReturnValue(platform.release);
});
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function chooseWithPendingWrite() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  platform.write.mockReturnValueOnce(promise);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(DrawingScreen)));
  const opener = host.querySelector('[aria-label="More colors"]');
  expect(opener.disabled, host.textContent).toBe(false);
  await act(async () => {
    opener.focus();
    opener.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: false }));
  });
  expect(platform.lock).toHaveBeenCalledTimes(1);
  const opening = document.querySelector('[aria-label="Color picker"]');
  expect(opening, host.textContent).not.toBeNull();
  await act(async () =>
    opening.parentElement.parentElement.dispatchEvent(new Event('animationend', { bubbles: true }))
  );
  const tile = document.querySelector('[aria-label^="Explore "]');
  await act(async () => tile.click());
  const chosen = tile.getAttribute('aria-label').slice('Explore '.length);
  await act(async () =>
    document
      .querySelector('[aria-label="Use color"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: false }))
  );
  return { host, opener, chosen, resolve, reject };
}

describe('custom color controls through installed React Native Web', () => {
  it('exposes named paints and all custom paints with exactly the real selected toggle semantics', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      createElement(PaintColors, {
        color: '#123ABC',
        customColors: ['#123ABC', '#FFFFFF'],
        disabled: false,
        openerRef: { current: null },
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
          openerRef: { current: null },
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
  it('keeps initial focus and ignores an unrelated paint save under StrictMode', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    let finish;
    platform.write.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(createElement(StrictMode, null, createElement(DrawingScreen)))
    );
    expect(document.activeElement).toBe(outside);
    await act(async () =>
      host
        .querySelector('[aria-label="Blue paint"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: false }))
    );
    expect(platform.write).toHaveBeenCalledTimes(1);
    const opener = host.querySelector('[aria-label="More colors"]');
    expect(opener.disabled).toBe(true);
    expect(document.activeElement).toBe(outside);
    await act(async () => finish());
    expect(opener.disabled).toBe(false);
    expect(document.activeElement).toBe(outside);
  });
  it.each([
    ['resolve', false],
    ['reject', true],
  ])('restores focus after the real Use color delayed write %s', async (completion, failed) => {
    const pending = await chooseWithPendingWrite();
    expect(platform.write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(platform.write.mock.calls[0][0]).selectedColor).toBe(pending.chosen);
    expect(document.querySelector('[aria-label="Color picker"]')).toBeNull();
    expect(pending.opener.disabled).toBe(true);
    expect(document.activeElement).not.toBe(pending.opener);
    expect(platform.release).toHaveBeenCalledTimes(1);
    await act(async () => pending[completion](new Error('write unavailable')));
    expect(pending.opener.disabled).toBe(false);
    expect(document.activeElement).toBe(pending.opener);
    expect(pending.host.textContent.includes('could not be saved')).toBe(failed);
  });
  it.each(['focus', 'pointer', 'modal', 'background'])(
    'does not steal focus after intervening %s during the real color write',
    async (interruption) => {
      const listeners = new Set();
      const subscribe = AppState.addEventListener.bind(AppState);
      vi.spyOn(AppState, 'addEventListener').mockImplementation((name, listener) => {
        listeners.add(listener);
        const subscription = subscribe(name, listener);
        return {
          remove() {
            listeners.delete(listener);
            subscription.remove();
          },
        };
      });
      const pending = await chooseWithPendingWrite();
      const tools = pending.host.querySelector('[aria-label="Drawing tools"]');
      expect(tools).not.toBeNull();
      const interrupt = {
        focus: async () => act(async () => tools.focus()),
        pointer: async () =>
          act(async () => tools.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))),
        modal: async () => {
          await act(async () =>
            tools.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: false }))
          );
          const settings = document.querySelector('[aria-label="Settings"]');
          expect(settings).not.toBeNull();
          await act(async () =>
            settings.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: false }))
          );
          expect(document.querySelector('[aria-label="Close Settings"]')).not.toBeNull();
          expect(tools.disabled).toBe(true);
          expect(tools.tabIndex).toBe(-1);
        },
        background: async () =>
          act(async () => listeners.forEach((listener) => listener('background'))),
      };
      await interrupt[interruption]();
      const focused = document.activeElement;
      await act(async () => pending.resolve());
      expect(document.activeElement).toBe(focused);
      expect(document.activeElement).not.toBe(pending.opener);
      if (interruption === 'modal') {
        await act(async () =>
          document
            .querySelector('[aria-label="Close Settings"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: false }))
        );
      }
      expect(pending.opener.disabled).toBe(false);
      expect(document.activeElement).not.toBe(pending.opener);
      expect(platform.write).toHaveBeenCalledTimes(1);
      expect(JSON.parse(platform.write.mock.calls[0][0]).selectedColor).toBe(pending.chosen);
    }
  );
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
    const explorer = modal.querySelector('[role="group"][aria-label="Color explorer"]');
    expect(explorer).not.toBeNull();
    expect(explorer.tabIndex).toBe(-1);
    expect(explorer.closest('[aria-hidden="true"]')).toBeNull();
    const tiles = [...explorer.querySelectorAll('[aria-label^="Explore "]')];
    expect(tiles).toHaveLength(25);
    expect(new Set(tiles.map((button) => button.getAttribute('aria-label'))).size).toBe(25);
    for (const button of tiles) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('role')).toBe('button');
      expect(button.disabled).toBe(false);
      expect(button.closest('[aria-hidden="true"]')).toBeNull();
      await act(async () => button.click());
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(explorer.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
      expect(chosen).not.toHaveBeenCalled();
    }
    const tile = tiles[0];
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

vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);

function luminance(color) {
  const channels = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
it.each(['light', 'dark'])(
  'renders the actual Use color label above AA contrast in %s',
  async (preference) => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          DrawingAppearanceProvider,
          { preference },
          createElement(ColorPicker, { selected: 'Black', onChoose() {}, onClose() {} })
        )
      )
    );
    const action = document.querySelector('[aria-label="Use color"]');
    expect(action).not.toBeNull();
    const text = [...action.querySelectorAll('*')].find((node) => node.textContent === 'Use color');
    expect(
      contrast(getComputedStyle(text).color, getComputedStyle(action).backgroundColor)
    ).toBeGreaterThanOrEqual(4.5);
  }
);
it.each(['light', 'dark'])(
  'renders readable RN Black and dark custom swatch selection marks in %s',
  async (preference) => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    for (const color of ['Black', '#B5835A', '#7A74E7']) {
      await act(async () =>
        root.render(
          createElement(
            DrawingAppearanceProvider,
            { preference },
            createElement(PaintColors, {
              color,
              customColors: ['#B5835A', '#7A74E7'],
              disabled: false,
              openerRef: { current: null },
              onChange() {},
              onExplore() {},
            })
          )
        )
      );
      const swatch = host.querySelector('[aria-pressed="true"]');
      expect(swatch.textContent).toBe('✓');
      expect(
        contrast(
          getComputedStyle(swatch.firstElementChild).color,
          getComputedStyle(swatch).backgroundColor
        )
      ).toBeGreaterThanOrEqual(3);
    }
  }
);

it.each(['light', 'dark'])(
  'preserves unchanged semantic Black through the real More colors caller in %s',
  async (appearance) => {
    let stored = JSON.stringify({
      version: 4,
      soundEnabled: false,
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      selectedColor: 'Black',
      customColors: [],
      appearance,
    });
    platform.read.mockImplementation(async () => stored);
    platform.write.mockImplementation(async (snapshot) => {
      stored = snapshot;
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(DrawingScreen)));
    const open = async () => {
      await act(async () => host.querySelector('[aria-label="More colors"]').click());
      const opening = document.querySelector('[aria-label="Color picker"]');
      await act(async () =>
        opening.parentElement.parentElement.dispatchEvent(
          new Event('animationend', { bubbles: true })
        )
      );
      return document.querySelector('[role="dialog"]');
    };
    let modal = await open();
    expect(modal.textContent).toContain(appearance === 'dark' ? '#FFFFFF' : '#0A0B10');
    for (const id of ['rsd-window-insets', 'rsd-safe-area-frame']) {
      const color = getComputedStyle(modal.querySelector(`[data-testid="${id}"]`)).backgroundColor;
      expect(color).toMatch(/^(transparent|rgba\(0, 0, 0, 0(?:\.0+)?\))$/);
    }
    await act(async () => modal.querySelector('[aria-label="Use color"]').click());
    expect(JSON.parse(stored)).toMatchObject({ selectedColor: 'Black', customColors: [] });
    expect(host.querySelector('[aria-label="Black paint"]').getAttribute('aria-pressed')).toBe(
      'true'
    );
    modal = await open();
    const tile = modal.querySelector('[aria-label^="Explore "]');
    const literal = tile.getAttribute('aria-label').slice('Explore '.length);
    await act(async () => tile.click());
    await act(async () => modal.querySelector('[aria-label="Use color"]').click());
    expect(JSON.parse(stored)).toMatchObject({ selectedColor: literal, customColors: [literal] });
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(DrawingScreen)));
    expect(
      host.querySelector(`[aria-label="Custom paint ${literal}"]`).getAttribute('aria-pressed')
    ).toBe('true');
  }
);

vi.mock('../../experiments/native-architecture/src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
