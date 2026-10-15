import { act, createElement, StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { caller, records, host, mount, root } from './rsd-native-selection-host.mjs';
import { ProbeApp } from '../../../experiments/native-architecture/src/ProbeApp.tsx';
import {
  decodeDrawingDraft,
  encodeDrawingDraft,
} from '../../../experiments/native-architecture/src/product/drawingDraft.ts';
import { adoptedDrawing } from '../../tests/native-paper-fixtures.mjs';

// The canonical root (index.ts) under React StrictMode, which runs every effect's cleanup and setup
// once more as it mounts, as development builds do. The first owners' work still in flight then
// (the stored draft's read, the settings read) must not land, and the second owners must serve
// the session alone: the draft restored once, a stroke written once, Settings saving once, and
// every listener released at unmount. The plain root is the baseline each figure is held to.
vi.mock('../../../experiments/native-architecture/src/platform/shippingFont.tsx', () => ({
  ShippingFontGate: ({ children }) => children,
}));

const SETTLE_TURNS = 6;
// Two full launches of the app, each through a stroke and a Settings choice.
const TWO_LAUNCHES_TIMEOUT_MS = 30_000;
let drafts;

beforeEach(() => {
  caller.realScreen = true;
  caller.settingsStorage = {
    read: vi.fn(async () => '{"version":1,"soundEnabled":true}'),
    write: vi.fn(async () => {}),
  };
  const stored = {
    ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
    strokes: [{ brush: 'pen', width: 8, color: 'Purple', points: [{ x: 1, y: 1 }] }],
  };
  drafts = [encodeDrawingDraft(stored)];
  caller.draftStorage = {
    read: vi.fn(async () => drafts.at(-1)),
    write: vi.fn(async (draft) => {
      drafts.push(draft);
    }),
  };
});

async function settle() {
  for (let turn = 0; turn < SETTLE_TURNS; turn += 1) await act(async () => {});
}

const listeners = () => ({
  appState: records.appStateListeners.size,
  back: records.backListeners.size,
  dimensions: records.dimensionListeners.size,
});

async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  await act(async () => node.click());
}

// What the session, its draft and its services show through one launch, a stroke, a Settings
// choice and the unmount.
async function launch(strict) {
  const app = createElement(ProbeApp);
  await mount(strict ? createElement(StrictMode, null, app) : app);
  await settle();
  const launched = {
    strokes: caller.liveScreen.history.drawing.strokes.length,
    undo: caller.liveScreen.history.undo.length,
    settings: caller.sound.settings.status,
    listeners: listeners(),
  };
  await click('Draw RSD fixture stroke');
  await settle();
  const drawn = {
    strokes: caller.liveScreen.history.drawing.strokes.length,
    draftWrites: caller.draftStorage.write.mock.calls.length,
    draftStrokes: decodeDrawingDraft(drafts.at(-1)).strokes.length,
  };
  await click('Settings');
  await settle();
  const sound = host.querySelector('[role="switch"][aria-label="Sound"]');
  expect(sound).not.toBeNull();
  await act(async () => sound.click());
  await settle();
  const chosen = {
    settingsWrites: caller.settingsStorage.write.mock.calls.length,
    soundEnabled: caller.sound.settings.soundEnabled,
  };
  await act(async () => root.unmount());
  return { launched, drawn, chosen, unmounted: listeners() };
}

it(
  'runs the canonical root under StrictMode as it runs without it',
  async () => {
    const plain = await launch(false);
    expect(plain).toEqual({
      launched: {
        strokes: 1,
        undo: 0,
        settings: 'ready',
        listeners: { appState: 3, back: 0, dimensions: 1 },
      },
      drawn: { strokes: 2, draftWrites: 1, draftStrokes: 2 },
      chosen: { settingsWrites: 1, soundEnabled: false },
      unmounted: { appState: 0, back: 0, dimensions: 0 },
    });
    caller.draftStorage.write.mockClear();
    caller.settingsStorage.write.mockClear();
    drafts.splice(1);
    expect(await launch(true)).toEqual(plain);
  },
  TWO_LAUNCHES_TIMEOUT_MS
);
