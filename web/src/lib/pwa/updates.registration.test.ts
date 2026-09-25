// Deferred service worker registration: the idle-slot deferral, Save-Data and
// dev-build skips, retry after a failed register(), and the repeat-visit
// re-registration initPWAUpdates schedules. The version-mismatch cache-bust and
// init wiring live in updates.test.ts; the apply half of the lifecycle lives in
// updates.activation.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPWAUpdates } from './updates';
import {
  CURRENT_VERSION,
  makeRegistration,
  makeWorker,
  stubDeployedVersion,
  stubServiceWorker,
} from './updatesTestHarness';

const canvasState = vi.hoisted(() => ({ canvasEmpty: true }));
vi.mock('$lib/state/canvas.svelte', () => ({ canvasState, SETTLED_IN_STROKES: 3 }));

// Controllable idle queue: registration must not fire until the test releases
// the idle slot, so deferral itself is assertable.
const idle = vi.hoisted(() => ({
  queue: [] as (() => void)[],
  flush() {
    const pending = [...this.queue];
    this.queue = [];
    for (const fn of pending) fn();
  },
}));
vi.mock('$lib/idle', () => ({
  scheduleIdle: (fn: () => void) => {
    idle.queue.push(fn);
    return () => {
      idle.queue = idle.queue.filter((queued) => queued !== fn);
    };
  },
}));

let pwaUpdates: ReturnType<typeof createPWAUpdates>;

beforeEach(() => {
  pwaUpdates = createPWAUpdates();
  canvasState.canvasEmpty = true;
});

// --- deferred service worker registration (issue #462) ---

describe('deferred service worker registration', () => {
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));
  let originalFetch: typeof fetch;

  function stubConnection(saveData: boolean) {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData },
      configurable: true,
    });
  }

  async function flushIdle() {
    idle.flush();
    await flushAsync();
  }

  beforeEach(() => {
    idle.queue = [];
    originalFetch = globalThis.fetch;
    stubDeployedVersion(CURRENT_VERSION);
    (import.meta.env as Record<string, unknown>).DEV = false;
    Object.defineProperty(window, 'location', {
      value: { href: 'https://splotch.art/', reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    delete navigator.connection;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    (import.meta.env as Record<string, unknown>).DEV = true;
  });

  it('registers sw.js only once the idle slot is released', async () => {
    const container = stubServiceWorker(undefined);

    void pwaUpdates.registerDeferredServiceWorker();
    expect(container.register).not.toHaveBeenCalled();

    await flushIdle();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('is idempotent: repeated gate calls schedule a single registration', async () => {
    const container = stubServiceWorker(undefined);

    void pwaUpdates.registerDeferredServiceWorker();
    void pwaUpdates.registerDeferredServiceWorker();
    expect(idle.queue).toHaveLength(1);

    await flushIdle();
    void pwaUpdates.registerDeferredServiceWorker();
    idle.flush();

    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('skips registration when Save-Data is on', () => {
    const container = stubServiceWorker(undefined);
    stubConnection(true);

    void pwaUpdates.registerDeferredServiceWorker();
    idle.flush();

    expect(container.register).not.toHaveBeenCalled();
  });

  it('does not re-register an existing worker when Save-Data is on', async () => {
    const container = stubServiceWorker(makeRegistration());
    stubConnection(true);

    const teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    await flushIdle();

    expect(container.register).not.toHaveBeenCalled();
    teardown?.();
  });

  it('still registers when the connection reports Save-Data off', async () => {
    const container = stubServiceWorker(undefined);
    stubConnection(false);

    void pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('does nothing in dev builds', () => {
    const container = stubServiceWorker(undefined);
    (import.meta.env as Record<string, unknown>).DEV = true;

    void pwaUpdates.registerDeferredServiceWorker();

    expect(idle.queue).toHaveLength(0);
    expect(container.register).not.toHaveBeenCalled();
  });

  it('a failed registration retries on the next gate call', async () => {
    const container = stubServiceWorker(undefined);
    container.register.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    void pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();
    expect(container.register).toHaveBeenCalledTimes(1);

    void pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();

    expect(container.register).toHaveBeenCalledTimes(2);
  });

  it('shares a repeat-visit registration failure with the stroke gate', async () => {
    const container = stubServiceWorker(makeRegistration());
    container.register.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();

    const result = pwaUpdates.registerDeferredServiceWorker();
    expect(pwaUpdates.registerDeferredServiceWorker()).toBe(result);
    await flushIdle();
    await expect(result).resolves.toBe(false);

    const retry = pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();
    await expect(retry).resolves.toBe(true);
    expect(container.register).toHaveBeenCalledTimes(2);
    teardown?.();
  });

  it('update checks no-op before registration and arm once one exists', async () => {
    const container = stubServiceWorker(undefined);

    await expect(pwaUpdates.checkForUpdates()).resolves.toBeUndefined();
    expect(container.register).not.toHaveBeenCalled();

    // Registration arrives late (gate passed) — the same check now reaches the
    // registration and drives the waiting worker (silently: the page matches
    // the deployed version, so activation needs no reload).
    stubDeployedVersion(CURRENT_VERSION);
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    container.getRegistration.mockResolvedValue(reg);
    void pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('initPWAUpdates re-registers immediately at idle on a repeat visit', async () => {
    const reg = makeRegistration();
    const container = stubServiceWorker(reg);
    stubDeployedVersion(CURRENT_VERSION);

    const teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    expect(container.register).not.toHaveBeenCalled(); // still waits for idle

    await flushIdle();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
    teardown?.();
  });

  it('initPWAUpdates leaves a first visit to the stroke gate', async () => {
    const container = stubServiceWorker(undefined);
    stubDeployedVersion(CURRENT_VERSION);

    const teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    await flushIdle();

    expect(container.register).not.toHaveBeenCalled();
    teardown?.();
  });
});
