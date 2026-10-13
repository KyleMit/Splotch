import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { caller, host, mount, expandControls } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { solveParentGate as solve } from './rsd-parent-gate-keypad.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { productOwners } from '../../../experiments/native-architecture/src/product/productOwnersLoader.web.ts';

// The web export's loader, with the chunk it fetches held until each test releases it.
const chunk = vi.hoisted(() => {
  let release;
  const arrived = new Promise((resolve) => (release = resolve));
  return { imports: 0, arrived, release };
});
vi.mock(
  '../../../experiments/native-architecture/src/product/productOwnersLoader.ts',
  () => import('../../../experiments/native-architecture/src/product/productOwnersLoader.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/product/productChunk.web.ts',
  async (importOriginal) => {
    chunk.imports += 1;
    await chunk.arrived;
    return importOriginal();
  }
);

const JOB_ID = 'b'.repeat(64);
// A frame, then the shipping idle gate's timer fallback (web/src/lib/idle.ts), with margin.
const PAINT_AND_IDLE_WAIT_MS = 2000;
const SENT_AGO_MS = 60_000;

async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}
async function arrive() {
  await act(async () => {
    chunk.release();
    await productOwners.load();
  });
}

// A generation the previous page load sent and the server accepted, saved before the reload.
function pendingAttempt() {
  const journal = Object.freeze({
    version: 1,
    id: Date.now() - SENT_AGO_MS,
    createdAt: Date.now() - SENT_AGO_MS,
    style: 'Sticker',
    originalId: 'picture-1-fixture',
    phase: 'pending',
    jobId: JOB_ID,
    result: null,
  });
  return {
    kind: 'native',
    receipt: Object.freeze({
      kind: 'prepared',
      journal,
      nonce: 'c'.repeat(64),
      revision: 1,
      originalRevision: 1,
      originalDigest: 'd'.repeat(64),
      inputDigest: 'e'.repeat(64),
      inputLength: 1,
      resultDigest: null,
      resultLength: null,
    }),
  };
}

function useCaller() {
  const drawing = emptyDrawing();
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'marker',
    history: { undo: [], drawing },
    currentDrawing: () => drawing,
    surface: { current: null },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
  };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: false,
      appearance: 'light',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      aiEnabled: true,
    },
    owner: null,
    audioMessage: '',
  };
  caller.menu = { open: false };
}

it('requests feedback and AI only after the screen has painted, and attaches them on arrival', async () => {
  vi.clearAllMocks();
  useCaller();
  await mount(createElement(RsdDrawingScreen));

  expect(host.querySelector('[aria-label="Expand controls"]')).not.toBeNull();
  expect(chunk.imports).toBe(0);
  await vi.waitFor(() => expect(chunk.imports).toBe(1), { timeout: PAINT_AND_IDLE_WAIT_MS });
  expect(caller.product.ai.owner).toBeNull();
  expect(caller.product.feedback.owner).toBeNull();

  await arrive();

  expect(caller.product.ai.owner).not.toBeNull();
  expect(caller.product.feedback.owner).not.toBeNull();
  expect(caller.product.feedback.state.policyReady).toBe(true);
});

it('still recovers a generation left pending before the reload', async () => {
  vi.clearAllMocks();
  caller.aiRead.mockResolvedValue(pendingAttempt());
  caller.aiSend.mockImplementation(async (request) =>
    request.path === '/api/free-generation-grant'
      ? new Response('{"ok":true,"remaining":9,"limit":10}')
      : new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } })
  );
  useCaller();
  await mount(createElement(RsdDrawingScreen));
  await arrive();
  await expandControls();

  await click('AI picture');
  await click('Check AI allowance');
  await solve();
  expect(caller.aiRead).toHaveBeenCalled();
  await click('Check waiting picture');
  await solve();

  const poll = caller.aiSend.mock.calls.find(
    ([request]) => request.path === '/api/generation-result'
  );
  expect(poll?.[0].query).toBe(`job=${JOB_ID}`);
  expect(caller.aiRetain).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('original drawing are saved');
});
