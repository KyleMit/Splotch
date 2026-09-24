// Init wiring and the version-mismatch cache-bust. Deferred registration is
// covered in updates.registration.test.ts; the apply half of the lifecycle —
// silent activation and the hidden-edge reload — in updates.activation.test.ts.

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

// initPWAUpdates schedules repeat-visit registration at idle. These tests never
// release that slot, so the mock keeps register() from firing after a test ends;
// updates.registration.test.ts drives the deferral itself.
vi.mock('$lib/idle', () => ({ scheduleIdle: () => () => {} }));

let pwaUpdates: ReturnType<typeof createPWAUpdates>;

beforeEach(() => {
  pwaUpdates = createPWAUpdates();
  // The mocked canvas state is one object for the file, and the mismatch guard
  // reads it, so the default belongs to every describe — the same placement
  // updates.activation.test.ts uses.
  canvasState.canvasEmpty = true;
});

// --- checkVersionMismatch ---

describe('checkVersionMismatch', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
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
    history.replaceState({ 'sveltekit:index': 7 }, '', '/');
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

    expect(replaceStateSpy).toHaveBeenCalledWith(
      history.state,
      '',
      expect.not.stringContaining('?v=')
    );
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

  // A resume fires visibilitychange (→ visible) and focus together, and both
  // handlers ask for a check. Each one revalidates /sw.js over the network, so
  // one resume cost two requests on a connection the module already cares
  // enough about to skip registration entirely under Save-Data.
  it('revalidates once when a resume fires visibilitychange and focus together', async () => {
    stubLocation('https://splotch.art/');
    const reg = makeRegistration();
    stubServiceWorker(reg);
    stubDeployedVersion(CURRENT_VERSION);

    teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    expect(reg.update).toHaveBeenCalledOnce();

    setDocumentVisibility('visible');
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      await flushAsync();
    } finally {
      restoreDocumentVisibility();
    }

    // Both resume events land inside MIN_UPDATE_CHECK_GAP_MS of the init check.
    expect(reg.update).toHaveBeenCalledOnce();
  });

  // The floor gates the network revalidation only. A check suppressed by it
  // still decides on a worker the registration already holds — otherwise a
  // waiting worker found between checks would sit undecided until the hourly
  // timer came round.
  it('still activates a waiting worker when the check falls inside the minimum gap', async () => {
    stubLocation('https://splotch.art/');
    canvasState.canvasEmpty = true;
    const worker = makeWorker();
    const reg = makeRegistration();
    stubServiceWorker(reg);
    stubDeployedVersion(CURRENT_VERSION);

    teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    expect(reg.update).toHaveBeenCalledOnce();

    (reg as { waiting: ServiceWorker | null }).waiting = worker as unknown as ServiceWorker;
    setDocumentVisibility('visible');
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsync();
    } finally {
      restoreDocumentVisibility();
    }

    expect(reg.update).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  // The floor must not let a duplicate check walk past a revalidation that is
  // still fetching. registration.waiting can hold a worker from an earlier
  // deploy while update() is in flight, and only the settled fetch populates
  // registration.installing — the signal that outranks it below. Deciding
  // mid-update silently activates the stale worker.
  it('joins an in-flight revalidation instead of deciding on a stale waiting worker', async () => {
    stubLocation('https://splotch.art/');
    canvasState.canvasEmpty = true;
    const staleWorker = makeWorker();
    const reg = makeRegistration({ waiting: staleWorker as unknown as ServiceWorker });
    let settleUpdate!: () => void;
    (reg as { update: unknown }).update = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settleUpdate = resolve;
        })
    );
    stubServiceWorker(reg);
    stubDeployedVersion(CURRENT_VERSION);

    teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    expect(staleWorker.postMessage).not.toHaveBeenCalled();

    setDocumentVisibility('visible');
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsync();
    } finally {
      restoreDocumentVisibility();
    }

    expect(staleWorker.postMessage).not.toHaveBeenCalled();
    settleUpdate();
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
