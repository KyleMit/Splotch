// @vitest-environment happy-dom
import './native-feedback-drawing-fixture.mjs';
import { act, createElement, forwardRef, StrictMode, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintColors } from '../../experiments/native-architecture/src/drawing/PaintColors.tsx';
import { RsdColorPicker } from '../../experiments/native-architecture/src/rsdDrawing/RsdColorPicker.tsx';
import { hexPickerLayout } from '../../experiments/native-architecture/src/rsdDrawing/hexPicker.ts';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { Dimensions } from 'react-native';
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
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: async () => [],
  savePicture: vi.fn(),
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
// The Color Picker is a React Strict DOM surface; its web build emits these plain elements.
vi.mock('react-strict-dom', async () => (await import('./native-rsd-web-stub.mjs')).rsdWebStub());
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdPressable.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdPressable.web.tsx')
);
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

// The picker loads on first open (legacyColorPicker.ts), a few ticks after the press.
async function pickerOpened() {
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"][aria-label="Color Picker"]')).not.toBeNull()
  );
  return document.querySelector('[role="dialog"][aria-label="Color Picker"]');
}

async function chooseFromPicker() {
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
  const picker = await pickerOpened();
  const hexagon = picker.querySelector('button');
  const chosen = hexagon.getAttribute('aria-label');
  await act(async () => hexagon.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  return { host, opener, chosen };
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
  it('keeps initial focus through a paint tap under StrictMode, which saves nothing', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
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
    expect(host.querySelector('[aria-label="Blue paint"]').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(platform.write).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="More colors"]').disabled).toBe(false);
    expect(document.activeElement).toBe(outside);
  });
  it('returns focus to More colors as the picked color closes the picker, saving nothing', async () => {
    const picked = await chooseFromPicker();
    expect(document.querySelector('[aria-label="Color Picker"]')).toBeNull();
    expect(platform.release).toHaveBeenCalledTimes(1);
    expect(platform.write).not.toHaveBeenCalled();
    expect(picked.opener.disabled).toBe(false);
    expect(document.activeElement).toBe(picked.opener);
    expect(
      picked.host
        .querySelector(`[aria-label="Custom paint ${picked.chosen}"]`)
        .getAttribute('aria-pressed')
    ).toBe('true');
  });
  it('uses the actual modal focus trap and named hexagon buttons, picks only on a pointerless click and restores focus on close', async () => {
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
        createElement(RsdColorPicker, {
          visible: true,
          customColor: undefined,
          onChoose: chosen,
          onClose: closed,
        })
      )
    );
    const modal = document.querySelector('[role="dialog"]');
    expect(modal.getAttribute('aria-label')).toBe('Color Picker');
    expect(modal.textContent).toBe('');
    const hexagons = [...modal.querySelectorAll('button')];
    expect(hexagons.map((button) => button.getAttribute('aria-label'))).toEqual(
      hexPickerLayout(Dimensions.get('window')).cells.map((cell) => cell.color)
    );
    for (const button of hexagons) {
      expect(button.disabled).toBe(false);
      expect(button.closest('[aria-hidden="true"]')).toBeNull();
    }
    const [first] = hexagons;
    const color = first.getAttribute('aria-label');
    await act(async () =>
      first.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    );
    expect(chosen).not.toHaveBeenCalled();
    await act(async () => first.click());
    expect(chosen).toHaveBeenCalledExactlyOnceWith(color);
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
  'starts on Purple over a record that saved Black, and keeps a picked hexagon for the session only, in %s',
  async (appearance) => {
    const stored = JSON.stringify({
      version: 4,
      soundEnabled: false,
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      selectedColor: 'Black',
      customColors: [],
      appearance,
    });
    platform.read.mockImplementation(async () => stored);
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const pressed = (label) =>
      host.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-pressed');
    await act(async () => root.render(createElement(DrawingScreen)));
    expect(pressed('Purple paint')).toBe('true');
    expect(pressed('Black paint')).toBe('false');
    await act(async () => host.querySelector('[aria-label="More colors"]').click());
    const hexagon = (await pickerOpened()).querySelector('button');
    const literal = hexagon.getAttribute('aria-label');
    await act(async () => hexagon.click());
    expect(pressed(`Custom paint ${literal}`)).toBe('true');
    expect(platform.write).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(DrawingScreen)));
    expect(pressed('Purple paint')).toBe('true');
    expect(host.querySelector(`[aria-label="Custom paint ${literal}"]`)).toBeNull();
  }
);

vi.mock('../../experiments/native-architecture/src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
