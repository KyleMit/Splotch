import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { caller, host, mount, records, expandControls } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, vi } from 'vitest';
import { GATE_MODAL, solveParentGate as solve } from './rsd-parent-gate-keypad.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { drawingPaper } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { pictureExport } from '../../../experiments/native-architecture/src/drawing/pictureExport.ts';

const save = vi.hoisted(() => ({ outcome: 'photos', calls: [] }));
vi.mock('../../../experiments/native-architecture/src/platform/pictureSave.ts', () => ({
  pictureSave: {
    save: async (base64, format) => {
      save.calls.push({ base64, format });
      return save.outcome;
    },
  },
}));
vi.mock('../../../experiments/native-architecture/src/platform/aiPictureBase64.ts', () => ({
  aiPictureBase64: async (picture) => `bytes-of:${picture.uri}`,
}));

export const labelled = (label) => host.querySelector(`[aria-label="${label}"]`);
export const testId = (id) => host.querySelector(`[data-testid="${id}"]`);
export const modal = (label) => host.querySelector(`[data-native-modal="${label}"]`);
export async function click(label) {
  const node = labelled(label);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}
// A design Button is named by its label, which the caller reads as its text.
export async function press(text) {
  const node = [...host.querySelectorAll('button')].find((button) => button.textContent === text);
  expect(node, text).toBeDefined();
  expect(node.disabled, text).toBe(false);
  await act(async () => node.click());
}
export async function settle(check) {
  await act(() => vi.waitFor(check));
}
// Each solved check holds its "Unlocked!" card in real time before its destination shows, and a
// full send-and-report run solves up to three.
export const GATED_FLOW_TIMEOUT_MS = 15_000;
// The dial's done-ramp closes a sixth of the remaining gap each frame, so it
// needs about forty frames; this is several times that at happy-dom's frame rate.
export const REVEAL_RAMP_WAIT_MS = 2000;
// One poll interval (POLL_INTERVAL_MS) and a margin for the poll to settle.
export const POLL_WAIT_MS = 3500;
export const POLL_TEST_TIMEOUT_MS = 15_000;
export const WAND = 'Create AI image, 10 free left';
export const WAITING_LABEL = 'Your picture is being made — tap to watch';
export const READY_LABEL = 'Your picture is ready — tap to see it';
export const GRANT = '{"ok":true,"remaining":10,"limit":10}';

export function pictureReply() {
  return new Response(rgbaPng(2, 2, 255), {
    headers: { 'Content-Type': 'image/png', 'X-Report-Token': 'fixture-report-proof' },
  });
}
export function reply(generate, grant = () => new Response(GRANT), poll = pictureReply) {
  vi.clearAllMocks();
  save.calls.length = 0;
  save.outcome = 'photos';
  caller.aiAdmit.mockResolvedValue(undefined);
  caller.aiSend.mockImplementation(async (request) =>
    request.path === '/api/free-generation-grant'
      ? grant()
      : request.path === '/api/report-image'
        ? new Response('{"ok":true,"reportId":"17-00000000-0000-0000-0000-000000000001"}')
        : request.path === '/api/generate-image'
          ? generate()
          : poll()
  );
}
export function useCaller(drawing = emptyDrawing(), overrides = {}) {
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'marker',
    history: { undo: [], drawing },
    currentDrawing: () => drawing,
    surface: {
      current: {
        lockInput: () => () => {},
        capturePng: async () => rgbaPng(1024, 768, 255).toString('base64'),
        captureAiPng: async () => {
          const { width, height } = pictureExport(
            drawingPaper(drawing),
            'light',
            records.dimensions.scale
          ).size;
          return {
            base64: rgbaPng(width, height, 255).toString('base64'),
            size: { width, height },
            isCurrent: () => true,
          };
        },
      },
    },
    inkVisible: true,
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    saveFailure: {
      outcome: null,
      pictureCount: 0,
      retrying: false,
      retry: async () => {},
      dismiss() {},
      report: vi.fn(),
    },
    ...overrides,
  };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: false,
      appearance: 'dark',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
    },
    owner: null,
    audioMessage: '',
  };
}
async function openAiArt() {
  const row = host.querySelector('[aria-label^="AI Art, "]');
  expect(row, 'AI Art row').not.toBeNull();
  await act(async () => row.click());
}
// Settings › AI Art's switch is the master control, with no grown-up check, as shipping's is; the
// drawer carries the wand only once it is on.
export async function enableAi({ customize = true, autoSave = false } = {}) {
  await mount(createElement(RsdDrawingScreen));
  await expandControls();
  expect(host.querySelector('[aria-label^="Create AI image"]')).toBeNull();
  await click('Settings');
  await openAiArt();
  await click('Create AI Images');
  expect(host.textContent).not.toContain('Grown-Ups Only');
  expect(caller.product.state.settings.aiEnabled).toBe(true);
  if (!customize) await click('Customize AI Style');
  if (autoSave) await click('Auto-Save AI Images');
  await settle(() =>
    expect(caller.sound.settings).toMatchObject({
      aiCustomizationEnabled: customize,
      autoSaveAiEnabled: autoSave,
    })
  );
  await click('Close');
}
// Settings opened on its AI Art page rather than the hub.
export async function expectAiArtPage() {
  await settle(() => expect(caller.screen.settingsOpen).toBe(true));
  expect(caller.screen.settingsSection).toBe('ai');
  await settle(() => expect(labelled('Create AI Images')).not.toBeNull());
  expect(host.querySelector('[aria-label^="AI Art, "]')).toBeNull();
}
export const drawingRequests = () =>
  caller.aiSend.mock.calls.filter(([request]) => request.path !== '/api/free-generation-grant');

// The wand asks a grown-up at the tap, as shipping does, and the AI Style Prompt follows.
export async function openPrompt() {
  await settle(() => expect(labelled(WAND)).not.toBeNull());
  await click(WAND);
  expect(modal('Grown-Ups Only')).not.toBeNull();
  expect(caller.aiRead).not.toHaveBeenCalled();
  await solve();
  expect(modal('Pick a style')).not.toBeNull();
}
export async function sendDrawing(style = 'Sticker') {
  await enableAi();
  await openPrompt();
  expect(drawingRequests()).toHaveLength(0);
  await click(style);
  expect(host.querySelector(GATE_MODAL)).toBeNull();
}

export async function finishedPicture() {
  reply(pictureReply);
  useCaller();
  await sendDrawing();
  await settle(() => expect(labelled('Report this picture')).not.toBeNull());
}

// The save the mocked picture save path records, which each test resets through reply().
export { save };
