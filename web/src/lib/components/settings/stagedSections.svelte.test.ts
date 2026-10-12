import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createStagedSections } from './stagedSections.svelte';
import { settingsModal } from '$lib/state/ui.svelte';

// Deferred rather than immediate, so a test runs each idle slice on demand and
// can see what is queued between them.
const idle = vi.hoisted(() => ({ queued: [] as (() => void)[] }));
vi.mock('$lib/idle', () => ({
  scheduleIdle: (run: () => void) => {
    idle.queued.push(run);
    return () => {
      idle.queued = idle.queued.filter((queued) => queued !== run);
    };
  },
}));

function runIdleSlice() {
  const next = idle.queued.shift();
  next?.();
  flushSync();
}

// Frames run only when a test asks, one frame's callbacks at a time.
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function runFrame() {
  const due = [...frames.values()];
  frames = new Map();
  for (const callback of due) callback(0);
  flushSync();
}

function runFramesUntilIdle() {
  let guard = 100;
  while (frames.size > 0 && guard-- > 0) runFrame();
}

const TOTAL = 6;
const OPENING = 2;

let stopRoot: (() => void) | undefined;

// Static imports on purpose, as in settingsMediaQuery's harness: resetting
// modules hands the state modules a second copy of Svelte's runtime.
function stage({ open }: { open: boolean }) {
  if (open) settingsModal.show(null);
  else settingsModal.hide();
  let staging: ReturnType<typeof createStagedSections> | undefined;
  stopRoot = $effect.root(() => {
    staging = createStagedSections(TOTAL, OPENING);
    staging.stageWhileClosed();
  });
  flushSync();
  if (!staging) throw new Error('the root did not run');
  return staging;
}

// A dialog fly-in whose `finished` the test settles.
function flyIn() {
  let land!: () => void;
  let cancel!: () => void;
  const finished = new Promise<Animation>((resolve, reject) => {
    land = () => resolve({} as Animation);
    cancel = () => reject(new DOMException('cancelled', 'AbortError'));
  });
  return { animation: { finished } as Animation, land, cancel };
}

// Lets the fill's `Promise.all(...).then` run.
const settleMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  idle.queued = [];
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  stopRoot?.();
  stopRoot = undefined;
  settingsModal.hide();
  vi.unstubAllGlobals();
});

describe('createStagedSections watermarks', () => {
  it('mounts the opening prefix on an open tap and nothing when mounted closed', () => {
    expect(stage({ open: true }).mountedCount).toBe(OPENING);
    stopRoot?.();
    expect(stage({ open: false }).mountedCount).toBe(0);
  });

  // Presenting implies existing: the two counters cannot disagree about a
  // section's state.
  it('mounts a run before presenting it', () => {
    const staging = stage({ open: true });

    expect(staging.presentAtLeast(4)).toBe(true);

    expect(staging.mountedCount).toBe(4);
    expect(staging.presentedCount).toBe(4);
  });

  it('never lowers a watermark through a raise', () => {
    const staging = stage({ open: true });
    staging.mountAtLeast(5);
    staging.presentAtLeast(3);

    expect(staging.mountAtLeast(1)).toBe(false);
    expect(staging.presentAtLeast(1)).toBe(false);

    expect(staging.mountedCount).toBe(5);
    expect(staging.presentedCount).toBe(3);
  });

  it('stops at the last section', () => {
    const staging = stage({ open: true });

    expect(staging.presentAtLeast(TOTAL + 10)).toBe(true);
    expect(staging.presentAtLeast(TOTAL + 10)).toBe(false);

    expect(staging.mountedCount).toBe(TOTAL);
    expect(staging.presentedCount).toBe(TOTAL);
  });

  // What's New keeps growing after its wrapper mounts, and the scroll-end
  // election trusts `fullyMounted` to be exact.
  it('is fully mounted only once the staged section has settled too', () => {
    const staging = stage({ open: true });
    staging.mountAtLeast(TOTAL);
    expect(staging.fullyMounted).toBe(false);

    staging.markStagedContentSettled();

    expect(staging.fullyMounted).toBe(true);
  });
});

describe('createStagedSections open fill', () => {
  it('presents nothing until the fly-in lands and a breather frame passes', async () => {
    const staging = stage({ open: true });
    const card = flyIn();

    staging.fillAfterFlyIn([card.animation]);
    await settleMicrotasks();
    expect(frames.size).toBe(0);

    card.land();
    await settleMicrotasks();
    runFrame();

    expect(staging.presentedCount).toBe(0);
  });

  it('then presents one section per frame, top down, to the last', async () => {
    const staging = stage({ open: true });
    staging.fillAfterFlyIn([]);
    await settleMicrotasks();
    runFrame();

    const presented: number[] = [];
    while (frames.size > 0) {
      runFrame();
      presented.push(staging.presentedCount);
    }

    expect(presented).toEqual([1, 2, 3, 4, 5, 6, 6]);
    expect(staging.mountedCount).toBe(TOTAL);
  });

  // A cancelled animation rejects `finished`; that leaves nothing to wait for.
  it('treats a cancelled fly-in as landed', async () => {
    const staging = stage({ open: true });
    const card = flyIn();

    staging.fillAfterFlyIn([card.animation]);
    card.cancel();
    await settleMicrotasks();
    runFramesUntilIdle();

    expect(staging.presentedCount).toBe(TOTAL);
  });

  // The pump asks for one more than the watermark holds each frame. A private
  // counter would find nothing left to do once a jump raised the watermark past
  // it, and stop — stranding every section below the one jumped to.
  it('finishes the fill below a section jumped to mid-pump', async () => {
    const staging = stage({ open: true });
    staging.fillAfterFlyIn([]);
    await settleMicrotasks();
    runFrame();
    runFrame();
    expect(staging.presentedCount).toBe(1);

    staging.presentAtLeast(4);
    runFramesUntilIdle();

    expect(staging.presentedCount).toBe(TOTAL);
    expect(staging.mountedCount).toBe(TOTAL);
  });

  it('stops presenting once the fill is stopped', async () => {
    const staging = stage({ open: true });
    const stop = staging.fillAfterFlyIn([]);
    await settleMicrotasks();
    runFrame();
    runFrame();

    stop();
    runFramesUntilIdle();

    expect(staging.presentedCount).toBe(1);
  });

  it('never starts when stopped before the fly-in lands', async () => {
    const staging = stage({ open: true });
    const card = flyIn();

    const stop = staging.fillAfterFlyIn([card.animation]);
    stop();
    card.land();
    await settleMicrotasks();
    runFramesUntilIdle();

    expect(staging.presentedCount).toBe(0);
  });
});

describe('createStagedSections while closed', () => {
  // Each prewarm slice is one section's construction and nothing more: the
  // physical-iPad idle gate scores each slice as a frame.
  it('prewarms one section per idle slice until the pane is whole', () => {
    const staging = stage({ open: false });

    const mounted: number[] = [];
    while (idle.queued.length > 0) {
      expect(idle.queued).toHaveLength(1);
      runIdleSlice();
      mounted.push(staging.mountedCount);
    }

    expect(mounted).toEqual([1, 2, 3, 4, 5, 6]);
    expect(staging.presentedCount).toBe(0);
  });

  it('hands the fill to the open path the moment the dialog opens', () => {
    const staging = stage({ open: false });
    runIdleSlice();
    expect(idle.queued).toHaveLength(1);

    settingsModal.show(null);
    flushSync();

    expect(idle.queued).toHaveLength(0);
    expect(staging.mountedCount).toBe(1);
  });

  it('restages one section per idle slice after a close, down to none', () => {
    const staging = stage({ open: true });
    staging.presentAtLeast(TOTAL);
    flushSync();
    expect(idle.queued).toHaveLength(0);

    settingsModal.hide();
    flushSync();
    const presented: number[] = [];
    while (idle.queued.length > 0) {
      expect(idle.queued).toHaveLength(1);
      runIdleSlice();
      presented.push(staging.presentedCount);
    }

    expect(presented).toEqual([5, 4, 3, 2, 1, 0]);
    expect(staging.mountedCount).toBe(TOTAL);
  });

  it('drops presentation in one step on reset', () => {
    const staging = stage({ open: true });
    staging.presentAtLeast(TOTAL);

    staging.resetPresentation();

    expect(staging.presentedCount).toBe(0);
    expect(staging.mountedCount).toBe(TOTAL);
  });
});
