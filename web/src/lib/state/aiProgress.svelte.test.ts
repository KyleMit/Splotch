import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGenerationMachine, type AiResultState } from './aiGeneration.svelte';
import { createAiProgress } from './aiProgress.svelte';

const ESTIMATE_MS = 30_000;
const FRAME_MS = 16;
// Generous: the done-ramp closes 16% of the remaining gap per frame, so a reveal
// from a standing start takes on the order of 40.
const RAMP_FRAME_BUDGET = 200;

let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
let clock = 0;

// Run every frame the loop has asked for, `ms` after the last one. The loop
// re-requests from inside its own callback, so each call advances exactly one
// frame however long that frame is.
function pumpFrame(ms = FRAME_MS) {
  clock += ms;
  const due = [...frames.values()];
  frames.clear();
  for (const cb of due) cb(clock);
}

function pendingFrames() {
  return frames.size;
}

function createHarness() {
  const state: AiResultState = $state({
    generating: false,
    open: false,
    minimized: false,
    resultUrl: null,
    resultType: null,
    previewUrl: null,
    style: null,
    reportToken: null,
    error: null,
  });
  const machine = createAiGenerationMachine(state);
  const progress = createAiProgress(state, ESTIMATE_MS);
  const destroy = $effect.root(() => progress.watch());
  return { state, machine, progress, destroy };
}

// Start a run and let it fill for a while — the state every case here branches
// from. The awaits let the module's effects see each machine call.
async function startRunInFlight(harness: ReturnType<typeof createHarness>, fillMs = 10_000) {
  const runId = harness.machine.startAiGeneration('blob:preview');
  await tick();
  pumpFrame(fillMs);
  return runId;
}

beforeEach(() => {
  frames = new Map();
  nextFrameId = 0;
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createAiProgress', () => {
  it('fills while a run is in flight', async () => {
    const harness = createHarness();
    try {
      await startRunInFlight(harness, 5000);

      expect(harness.progress.value).toBeGreaterThan(0);
      expect(harness.progress.revealed).toBe(false);
    } finally {
      harness.destroy();
    }
  });

  it('keeps filling from where it was across a minimize and a restore', async () => {
    const harness = createHarness();
    try {
      await startRunInFlight(harness);
      const beforeMinimize = harness.progress.value;

      harness.machine.minimizeAiResult();
      await tick();
      pumpFrame(5000);
      const whileMinimized = harness.progress.value;

      harness.machine.restoreAiResult();
      await tick();
      pumpFrame();

      // The whole point of owning the loop above the dial: minimizing does not
      // pause the run, and coming back does not restart it at zero.
      expect(whileMinimized).toBeGreaterThan(beforeMinimize);
      expect(harness.progress.value).toBeGreaterThan(whileMinimized);
    } finally {
      harness.destroy();
    }
  });

  it('reveals a picture that arrives while minimized, with no frames to spare', async () => {
    const harness = createHarness();
    try {
      const runId = await startRunInFlight(harness);
      harness.machine.minimizeAiResult();
      await tick();

      harness.machine.finishAiGeneration(runId, 'blob:result', 'image/png');
      await tick();

      // No pumpFrame: nothing is watching a dial in the corner, so the reveal
      // is a fact by the time the child taps the polaroid.
      expect(harness.progress.revealed).toBe(true);
      expect(harness.progress.value).toBe(1);
      expect(pendingFrames()).toBe(0);
    } finally {
      harness.destroy();
    }
  });

  it('leaves a restored ready picture revealed instead of ramping it again', async () => {
    const harness = createHarness();
    try {
      const runId = await startRunInFlight(harness);
      harness.machine.minimizeAiResult();
      await tick();
      harness.machine.finishAiGeneration(runId, 'blob:result', 'image/png');
      await tick();

      harness.machine.restoreAiResult();
      await tick();

      expect(harness.progress.revealed).toBe(true);
      expect(harness.progress.value).toBe(1);
      expect(pendingFrames()).toBe(0);
    } finally {
      harness.destroy();
    }
  });

  it('ramps to the reveal when the picture arrives with the modal in front', async () => {
    const harness = createHarness();
    try {
      const runId = await startRunInFlight(harness, 5000);
      harness.machine.finishAiGeneration(runId, 'blob:result', 'image/png');
      await tick();

      expect(harness.progress.revealed).toBe(false);

      let framesSpent = 0;
      while (!harness.progress.revealed && framesSpent < RAMP_FRAME_BUDGET) {
        pumpFrame();
        framesSpent += 1;
      }

      expect(harness.progress.revealed).toBe(true);
      expect(harness.progress.value).toBe(1);
      expect(pendingFrames()).toBe(0);
    } finally {
      harness.destroy();
    }
  });

  it('holds a pulse once the estimate runs out and the picture still has not come', async () => {
    const harness = createHarness();
    try {
      await startRunInFlight(harness, ESTIMATE_MS + 3000);

      expect(harness.progress.waiting).toBe(true);
      expect(harness.progress.revealed).toBe(false);
    } finally {
      harness.destroy();
    }
  });

  it('drops the loop when the run fails', async () => {
    const harness = createHarness();
    try {
      const runId = await startRunInFlight(harness);
      harness.machine.failAiGeneration(runId, 'Try again', 'retry');
      await tick();

      expect(pendingFrames()).toBe(0);
    } finally {
      harness.destroy();
    }
  });

  it('clears itself when the run closes, so the next one opens at zero', async () => {
    const harness = createHarness();
    try {
      const runId = await startRunInFlight(harness);
      harness.machine.finishAiGeneration(runId, 'blob:result', 'image/png');
      await tick();
      harness.machine.closeAiResult();
      await tick();

      expect(harness.progress.value).toBe(0);
      expect(harness.progress.revealed).toBe(false);
      expect(harness.progress.waiting).toBe(false);
      expect(pendingFrames()).toBe(0);
    } finally {
      harness.destroy();
    }
  });
});
