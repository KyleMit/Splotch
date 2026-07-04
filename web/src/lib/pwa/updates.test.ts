import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPWAUpdates, checkVersionMismatch, checkForUpdates } from './updates';

const canvasState = vi.hoisted(() => ({ canvasEmpty: true }));
vi.mock('$lib/state/canvas.svelte', () => ({ canvasState }));

// --- helpers ---

function makeRegistration({
  waiting = null as ServiceWorker | null,
  installing = null as ServiceWorker | null,
} = {}) {
  return {
    update: vi.fn().mockResolvedValue(undefined),
    waiting,
    installing,
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
}

function makeWorker() {
  return {
    state: 'installed',
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
  };
}

function stubServiceWorker(reg?: ServiceWorkerRegistration) {
  const container = {
    ready: new Promise(() => {}), // never resolves — keeps test side-effect-free
    getRegistration: vi.fn().mockResolvedValue(reg),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
    writable: true,
  });
  return container;
}

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

    await checkVersionMismatch();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('redirects to ?v= when deployed version differs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);

    await checkVersionMismatch();

    expect(window.location.replace).toHaveBeenCalledWith(expect.stringContaining('?v=1.0.1'));
  });

  it('does nothing when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);

    await checkVersionMismatch();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently (offline)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(checkVersionMismatch()).resolves.toBeUndefined();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('fetches /version.json with cache: no-store', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0-test' }),
    } as Response);

    await checkVersionMismatch();

    expect(globalThis.fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('skips the redirect when the mismatched version was already attempted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);

    await checkVersionMismatch('1.0.1');

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('still redirects when a newer version differs from the attempted one', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.2' }),
    } as Response);

    await checkVersionMismatch('1.0.1');

    expect(window.location.replace).toHaveBeenCalledWith(expect.stringContaining('?v=1.0.2'));
  });
});

// --- checkForUpdates: canvas-empty guard ---

describe('checkForUpdates — canvas-empty guard', () => {
  beforeEach(() => {
    canvasState.canvasEmpty = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts SKIP_WAITING and wires controllerchange when canvas is empty and a SW is waiting', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await checkForUpdates();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
      { once: true }
    );
  });

  it('does not post SKIP_WAITING when the canvas has content', async () => {
    canvasState.canvasEmpty = false;
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await checkForUpdates();

    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('resolves cleanly when there is no active registration', async () => {
    stubServiceWorker(undefined);

    await expect(checkForUpdates()).resolves.toBeUndefined();
  });

  it('attaches a statechange listener when the SW is still installing', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ installing: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await checkForUpdates();

    expect(worker.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function));
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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0-test' }),
    } as Response);
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

    teardown = initPWAUpdates();

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', expect.not.stringContaining('?v='));
  });

  it('does not call replaceState when no ?v= param is present', () => {
    stubLocation('https://splotch.art/');

    teardown = initPWAUpdates();

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('does not redirect again when the deployed version was already cache-busted', async () => {
    const replace = stubLocation('https://splotch.art/?v=1.0.1');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1' }),
    } as Response);

    teardown = initPWAUpdates();
    await flushAsync();

    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects when the deployed version differs from the attempted cache-bust', async () => {
    const replace = stubLocation('https://splotch.art/?v=1.0.1');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.2' }),
    } as Response);

    teardown = initPWAUpdates();
    await flushAsync();

    expect(replace).toHaveBeenCalledWith(expect.stringContaining('?v=1.0.2'));
  });

  it('is idempotent: a second call registers no additional listeners or intervals', () => {
    stubLocation('https://splotch.art/');
    const docListenerSpy = vi.spyOn(document, 'addEventListener');
    const winListenerSpy = vi.spyOn(window, 'addEventListener');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    teardown = initPWAUpdates();
    const second = initPWAUpdates();

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

    const first = initPWAUpdates();
    first?.();

    expect(docRemoveSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winRemoveSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    teardown = initPWAUpdates();
    expect(teardown).toBeDefined();
  });
});
