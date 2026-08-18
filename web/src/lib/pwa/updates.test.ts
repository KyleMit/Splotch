// Registration, init wiring, and the version-mismatch cache-bust. The apply
// half of the lifecycle — silent activation and the hidden-edge reload — is
// covered in updates.activation.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPWAUpdates } from './updates';
import {
  CURRENT_VERSION,
  NEWER_VERSION,
  makeRegistration,
  makeWorker,
  restoreDocumentVisibility,
  setDocumentVisibility,
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
});

// --- checkVersionMismatch ---

describe('checkVersionMismatch', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    canvasState.canvasEmpty = true;
    Object.defineProperty(window, 'location', {
      value: { href: 'https://splotch.art/', replace: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('does nothing when version matches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0-test' }),
    } as Response);

    await pwaUpdates.checkVersionMismatch();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('redirects to ?v= when deployed version differs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);

    await pwaUpdates.checkVersionMismatch();

    expect(window.location.replace).toHaveBeenCalledWith(expect.stringContaining('?v=1.0.1'));
  });

  it('does nothing when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);

    await pwaUpdates.checkVersionMismatch();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently (offline)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(pwaUpdates.checkVersionMismatch()).resolves.toBeUndefined();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('fetches /version.json with cache: no-store', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0-test' }),
    } as Response);

    await pwaUpdates.checkVersionMismatch();

    expect(globalThis.fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('skips the redirect when the mismatched version was already attempted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);

    await pwaUpdates.checkVersionMismatch('1.0.1');

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('still redirects when a newer version differs from the attempted one', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.2' }),
    } as Response);

    await pwaUpdates.checkVersionMismatch('1.0.1');

    expect(window.location.replace).toHaveBeenCalledWith(expect.stringContaining('?v=1.0.2'));
  });

  it('does nothing when the payload has no version field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    await pwaUpdates.checkVersionMismatch();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  // The canvas starts blank and gains ink while /version.json is still in flight —
  // the real post-deploy race, since the child can draw from the first frame
  // (ADR-0072) and the fetch takes seconds on a slow connection. Asserting from an
  // already-inked canvas would also pass against a guard that read canvasEmpty
  // before the await, which is exactly the implementation this must reject.
  it('does not redirect when the canvas gains content while the version fetch is in flight', async () => {
    let deliverVersion = (_: Response) => {};
    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        deliverVersion = resolve;
      })
    );

    const mismatchCheck = pwaUpdates.checkVersionMismatch();
    canvasState.canvasEmpty = false;
    deliverVersion({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);
    await mismatchCheck;

    expect(window.location.replace).not.toHaveBeenCalled();
  });
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
    canvasState.canvasEmpty = true;
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

    pwaUpdates.registerDeferredServiceWorker();
    expect(container.register).not.toHaveBeenCalled();

    await flushIdle();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('is idempotent: repeated gate calls schedule a single registration', async () => {
    const container = stubServiceWorker(undefined);

    pwaUpdates.registerDeferredServiceWorker();
    pwaUpdates.registerDeferredServiceWorker();
    expect(idle.queue).toHaveLength(1);

    await flushIdle();
    pwaUpdates.registerDeferredServiceWorker();
    idle.flush();

    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('skips registration when Save-Data is on', () => {
    const container = stubServiceWorker(undefined);
    stubConnection(true);

    pwaUpdates.registerDeferredServiceWorker();
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

    pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('does nothing in dev builds', () => {
    const container = stubServiceWorker(undefined);
    (import.meta.env as Record<string, unknown>).DEV = true;

    pwaUpdates.registerDeferredServiceWorker();

    expect(idle.queue).toHaveLength(0);
    expect(container.register).not.toHaveBeenCalled();
  });

  it('a failed registration retries on the next gate call', async () => {
    const container = stubServiceWorker(undefined);
    container.register.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();
    expect(container.register).toHaveBeenCalledTimes(1);

    pwaUpdates.registerDeferredServiceWorker();
    await flushIdle();

    expect(container.register).toHaveBeenCalledTimes(2);
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
    pwaUpdates.registerDeferredServiceWorker();
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

// --- initPWAUpdates: URL cleanup, cache-bust loop guard, lifecycle ---

describe('initPWAUpdates', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof fetch;
  let teardown: (() => void) | undefined;

  function stubLocation(href: string) {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href, replace },
      writable: true,
      configurable: true,
    });
    return replace;
  }

  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    replaceStateSpy = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
    // Prevent checkForUpdates / checkVersionMismatch from doing real work
    stubServiceWorker(undefined);
    stubDeployedVersion(CURRENT_VERSION);
    // initPWAUpdates guards on DEV; override it for these tests
    (import.meta.env as Record<string, unknown>).DEV = false;
    teardown = undefined;
  });

  afterEach(() => {
    teardown?.();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    (import.meta.env as Record<string, unknown>).DEV = true;
  });

  it('strips ?v= from the URL and calls replaceState', () => {
    stubLocation('https://splotch.art/?v=1.0.1');

    teardown = pwaUpdates.initPWAUpdates();

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', expect.not.stringContaining('?v='));
  });

  it('does not call replaceState when no ?v= param is present', () => {
    stubLocation('https://splotch.art/');

    teardown = pwaUpdates.initPWAUpdates();

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('does not redirect again when the deployed version was already cache-busted', async () => {
    const replace = stubLocation('https://splotch.art/?v=1.0.1');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);

    teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();

    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects when the deployed version differs from the attempted cache-bust', async () => {
    const replace = stubLocation('https://splotch.art/?v=1.0.1');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.2' }),
    } as Response);

    teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();

    expect(replace).toHaveBeenCalledWith(expect.stringContaining('?v=1.0.2'));
  });

  it('applies a pending update when the document goes hidden', async () => {
    stubLocation('https://splotch.art/');
    canvasState.canvasEmpty = true;
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);
    stubDeployedVersion(NEWER_VERSION);

    teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    expect(worker.postMessage).not.toHaveBeenCalled(); // stale page: no visible activation

    setDocumentVisibility('hidden');
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    } finally {
      restoreDocumentVisibility();
    }
  });

  it('is idempotent: a second call registers no additional listeners or intervals', () => {
    stubLocation('https://splotch.art/');
    const docListenerSpy = vi.spyOn(document, 'addEventListener');
    const winListenerSpy = vi.spyOn(window, 'addEventListener');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    teardown = pwaUpdates.initPWAUpdates();
    const second = pwaUpdates.initPWAUpdates();

    expect(second).toBeUndefined();
    expect(docListenerSpy).toHaveBeenCalledTimes(1);
    expect(winListenerSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('teardown removes listeners, clears the interval, and allows re-init', () => {
    stubLocation('https://splotch.art/');
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const first = pwaUpdates.initPWAUpdates();
    first?.();

    expect(docRemoveSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winRemoveSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    teardown = pwaUpdates.initPWAUpdates();
    expect(teardown).toBeDefined();
  });
});
