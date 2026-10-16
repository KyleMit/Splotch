import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import {
  caller,
  records,
  root,
  host,
  mount,
  expandControls,
} from './rsd-native-selection-host.mjs';
import { AI_BUTTON, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { adoptedDrawing } from '../../tests/native-paper-fixtures.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { DrawingSessionProvider } from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { Animated } from '../../../experiments/native-architecture/src/platform/animated.ts';
import * as pickerModule from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';

// Shipping's modal dialog leaves the drawing chrome behind it at full strength under the scrim's
// dim and blur, and inert: no press reaches it until the dialog has gone. Each dialog here is
// opened the way its owner opens it, so the screen's own dialog flag and the product route are
// both held.

// A closing dialog's exit runs on real timers here; the gate also holds its Unlocked! card.
const DIALOG_EXIT_WAIT_MS = PARENT_GATE_SUCCESS_HOLD_MS + 2000;
const LAYOUT = '[data-testid="rsd-drawing-layout"]';
const PAINT = 'Blue';
const DIALOGS = {
  Settings: {
    open: () => rerender({ dialogOpen: true, settingsOpen: true }),
    close: () => rerender({ dialogOpen: false, settingsOpen: false }),
  },
  'Color Picker': {
    open: () => rerender({ dialogOpen: true, colorPickerOpen: true }),
    close: () => rerender({ dialogOpen: false, colorPickerOpen: false }),
  },
  'Grown-Ups Only': {
    open: () => act(async () => caller.product.owner.openParentCenter()),
    close: () => act(async () => caller.product.owner.gate.dismiss()),
  },
};

function inked() {
  return {
    ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
    strokes: [{ brush: 'pen', width: 8, color: 'Purple', points: [{ x: 1, y: 1 }] }],
  };
}

async function rerender(overrides) {
  Object.assign(caller.screen, overrides);
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}

function chrome(label) {
  const node = host.querySelector(`${LAYOUT} [aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

// Every drawer tile and palette swatch as it shows: whether it is disabled, the opacity the
// native driver leaves on it, and the icon markup its colors are painted into.
function chromeLook() {
  const controls = [
    ...host.querySelectorAll(`${LAYOUT} [data-testid="rsd-drawer-tool"] button`),
    ...host.querySelectorAll(`${LAYOUT} [data-testid="rsd-palette-plate"] button`),
  ];
  expect(controls.length).toBeGreaterThan(0);
  return controls.map((node) => ({
    label: node.getAttribute('aria-label'),
    disabled: node.disabled,
    opacity: node.dataset.shownOpacity,
    icon: node.querySelector('svg[data-xml]')?.dataset.xml,
  }));
}

function activateClear() {
  records.props
    .findLast((props) => props.accessibilityLabel === 'Clear drawing')
    .onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
}

async function pressEveryControl() {
  for (const label of [
    PAINT,
    'Brushes',
    'Stroke width',
    'Coloring books',
    'Save screenshot',
    AI_BUTTON,
    'Undo',
    'Custom Color',
    'Settings',
  ]) {
    await act(async () => chrome(label).click());
  }
  await act(async () => activateClear());
}

async function dialogsGone() {
  await vi.waitFor(() => expect(host.querySelector('[data-native-modal]')).toBeNull(), {
    timeout: DIALOG_EXIT_WAIT_MS,
  });
}

it.each(['buttons', 'bare'].flatMap((style) => Object.keys(DIALOGS).map((name) => [name, style])))(
  'keeps the chrome at full strength under the %s dialog in the %s style and drops every press',
  async (name, style) => {
    await mountToolbar(
      toolbarScreen({
        history: { undo: [emptyDrawing()], drawing: inked() },
        closeSettings: vi.fn(),
        closeColorPicker: vi.fn(),
      })
    );
    await act(async () => caller.product.sound.owner.settings.setToolbarStyle(style));
    await expandControls();
    const live = chromeLook();
    const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
    const startAi = vi.spyOn(caller.product.ai.owner, 'start').mockImplementation(() => {});

    await DIALOGS[name].open();
    expect(host.querySelector(`[data-native-modal="${name}"]`), name).not.toBeNull();
    expect(chromeLook()).toEqual(live);
    await pressEveryControl();
    expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
    for (const handler of [
      'setPagePickerOpen',
      'save',
      'undoFromButton',
      'openColorPicker',
      'clear',
    ])
      expect(caller.screen[handler], handler).not.toHaveBeenCalled();
    expect(caller.screen.openSettings).not.toHaveBeenCalled();
    expect(setColor).not.toHaveBeenCalled();
    expect(startAi).not.toHaveBeenCalled();
    await act(async () => chrome('Collapse controls').click());
    expect(chrome('Collapse controls')).not.toBeNull();

    await DIALOGS[name].close();
    await dialogsGone();
    expect(chromeLook()).toEqual(live);
    await act(async () => chrome(PAINT).click());
    expect(setColor).toHaveBeenCalledExactlyOnceWith('Blue');
    await act(async () => chrome('Brushes').click());
    expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
    await act(async () => chrome('Brushes').click());
    for (const label of ['Coloring books', 'Save screenshot', 'Undo', 'Custom Color', 'Settings'])
      await act(async () => chrome(label).click());
    await act(async () => chrome(AI_BUTTON).click());
    await act(async () => activateClear());
    for (const handler of [
      'setPagePickerOpen',
      'save',
      'undoFromButton',
      'openColorPicker',
      'clear',
    ])
      expect(caller.screen[handler], handler).toHaveBeenCalledOnce();
    expect(caller.screen.openSettings).toHaveBeenCalledOnce();
    expect(startAi).toHaveBeenCalledOnce();
  }
);

it('pins shipping page selection and clear after dialog retirement and one frame', () => {
  const shipping = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/ColoringBook.svelte'),
    'utf8'
  );
  for (const action of ['applyColoringPageWithMagicUndo', 'clearColoringPageWithMagicUndo'])
    expect(shipping).toMatch(
      new RegExp(`await dialogRetired;\\s*await nextFrame\\(\\);\\s*${action}\\(`)
    );
});

it('keeps actual page history unchanged until the picker retires and the next frame paints', async () => {
  caller.realScreen = true;
  await mount(createElement(DrawingSessionProvider, null, createElement(RsdDrawingScreen)));
  await act(async () => caller.liveScreen.setBrush('magic'));
  await act(async () => host.querySelector('[data-testid="rsd-real-history-paper"]').click());
  await act(async () => caller.liveScreen.setPagePickerOpen(true));
  const before = caller.liveScreen.history;
  const frames = new Map();
  let frameId = 0,
    finishExit;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
  const parallel = vi.spyOn(Animated, 'parallel').mockImplementationOnce((animations) => ({
    start(done) {
      animations.forEach((animation) => animation.start());
      finishExit = () => done({ finished: true });
    },
    stop() {},
  }));
  try {
    await act(async () => host.querySelector('[aria-label="Cat coloring page"]').click());
    expect(caller.liveScreen.history).toBe(before);
    expect(caller.paper.pageId).toBe(before.drawing.pageId);
    expect(host.querySelector('[data-native-modal="Coloring books"]')).not.toBeNull();
    expect(caller.liveScreen.commandBusy).toBe(true);
    await act(async () => finishExit());
    expect(host.querySelector('[data-native-modal="Coloring books"]')).toBeNull();
    expect(caller.liveScreen.history).toBe(before);
    expect(caller.paper.pageId).toBe(before.drawing.pageId);
    const pending = [...frames.values()];
    frames.clear();
    await act(async () => pending.forEach((frame) => frame(0)));
    expect(caller.liveScreen.history.drawing.pageId).toBe('farm/cat');
    expect(caller.paper.pageId).toBe('farm/cat');
    expect(caller.liveScreen.history.undo).toEqual([...before.undo, before.drawing]);
    expect(caller.liveScreen.commandBusy).toBe(false);
  } finally {
    parallel.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('rejects old picker choices and dismissals after a manual close and reopen', async () => {
  caller.realScreen = true;
  const props = [];
  const Picker = pickerModule.RsdColoringBookPicker;
  const capture = vi.spyOn(pickerModule, 'RsdColoringBookPicker').mockImplementation((value) => {
    props.push(value);
    return createElement(Picker, value);
  });
  const exits = vi.spyOn(Animated, 'parallel').mockImplementation((animations) => ({
    start() {
      animations.forEach((animation) => animation.start());
    },
    stop() {},
  }));
  const frames = new Map();
  let frameId = 0;
  try {
    await mount(createElement(DrawingSessionProvider, null, createElement(RsdDrawingScreen)));
    await act(async () => caller.liveScreen.setPagePickerOpen(true));
    const old = props.at(-1);
    await act(async () => old.onClose());
    await act(async () => caller.liveScreen.setPagePickerOpen(true));
    const before = caller.liveScreen.history;
    await act(async () => old.onChoose('turtle'));
    expect(caller.liveScreen.history).toBe(before);
    expect(caller.liveScreen.commandBusy).toBe(false);
    expect(caller.liveScreen.pagePickerOpen).toBe(true);
    vi.stubGlobal('requestAnimationFrame', (run) => {
      const id = ++frameId;
      frames.set(id, run);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    await act(async () => props.at(-1).onChoose('flower'));
    expect(caller.liveScreen.commandBusy).toBe(true);
    expect(caller.liveScreen.pagePickerOpen).toBe(false);
    const current = props.at(-1);
    await act(async () => old.onDismiss());
    expect(host.querySelector('[data-native-modal="Coloring books"]')).not.toBeNull();
    expect(caller.liveScreen.history).toBe(before);
    expect(frames.size).toBe(0);
    await act(async () => current.onDismiss());
    expect(host.querySelector('[data-native-modal="Coloring books"]')).toBeNull();
    expect(frames.size).toBe(1);
    const ready = [...frames.values()];
    frames.clear();
    await act(async () => ready.forEach((run) => run(0)));
    expect(caller.liveScreen.history.drawing.pageId).toBe('flower');
    expect(caller.liveScreen.commandBusy).toBe(false);
  } finally {
    capture.mockRestore();
    exits.mockRestore();
    vi.unstubAllGlobals();
  }
});
