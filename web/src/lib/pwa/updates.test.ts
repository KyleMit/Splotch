import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPWAUpdates, ACTIVATION_RECOVERY_MS, WAITING_SETTLE_MS } from './updates';

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
    register: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
    writable: true,
  });
  return container;
}

function registeredListener(addEventListener: ReturnType<typeof vi.fn>, type: string) {
  const call = addEventListener.mock.calls.find(([eventType]) => eventType === type);
  expect(call).toBeDefined();
  return call?.[1] as EventListener;
}

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

// --- checkForUpdates: canvas-empty guard ---

describe('checkForUpdates — canvas-empty guard', () => {
  beforeEach(() => {
    canvasState.canvasEmpty = true;
    Object.defineProperty(window, 'location', {
      value: { href: 'https://splotch.art/', reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads on controllerchange when the canvas remains empty', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();

    const onControllerChange = registeredListener(container.addEventListener, 'controllerchange');
    onControllerChange(new Event('controllerchange'));

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(container.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
      { once: true }
    );
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('defers reload when ink appears before controllerchange', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    canvasState.canvasEmpty = false;

    const onControllerChange = registeredListener(container.addEventListener, 'controllerchange');
    onControllerChange(new Event('controllerchange'));

    expect(window.location.reload).not.toHaveBeenCalled();

    canvasState.canvasEmpty = true;
    await pwaUpdates.checkForUpdates();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does not post SKIP_WAITING when the canvas has content', async () => {
    canvasState.canvasEmpty = false;
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();

    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('resolves cleanly when there is no active registration', async () => {
    stubServiceWorker(undefined);

    await expect(pwaUpdates.checkForUpdates()).resolves.toBeUndefined();
  });

  it('attaches a statechange listener when the SW is still installing', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ installing: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();

    expect(worker.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function), {
      once: true,
    });
  });

  it('observes the same installing worker only once across update checks', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ installing: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    await pwaUpdates.checkForUpdates();

    expect(worker.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('registers only one reload while a waiting worker activates', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    await pwaUpdates.checkForUpdates();

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(container.addEventListener).toHaveBeenCalledTimes(1);

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));
  });

  it('recovers from a stuck activation when controllerchange never fires', async () => {
    vi.useFakeTimers();
    try {
      const worker = makeWorker();
      const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
      stubServiceWorker(reg);

      await pwaUpdates.checkForUpdates();
      expect(worker.postMessage).toHaveBeenCalledTimes(1); // entered 'activating'

      // The new worker never takes control, so no controllerchange arrives. Before
      // the recovery timer, a fresh check is short-circuited by the 'activating'
      // guard and posts nothing — the session-long lockout.
      const stuckReg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
      stubServiceWorker(stuckReg);
      await pwaUpdates.checkForUpdates();
      expect(worker.postMessage).toHaveBeenCalledTimes(1);

      // After the grace period the lifecycle releases back to none...
      await vi.advanceTimersByTimeAsync(ACTIVATION_RECOVERY_MS);

      // ...so the next check re-attempts activation instead of no-oping forever.
      const freshReg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
      stubServiceWorker(freshReg);
      await pwaUpdates.checkForUpdates();
      expect(worker.postMessage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rechecks canvas state after an installing worker takes control', async () => {
    vi.useFakeTimers();
    try {
      const installingWorker = makeWorker();
      const waitingWorker = makeWorker();
      const reg = makeRegistration({
        installing: installingWorker as unknown as ServiceWorker,
      });
      const container = stubServiceWorker(reg);

      await pwaUpdates.checkForUpdates();
      Object.defineProperty(reg, 'waiting', {
        value: waitingWorker,
        configurable: true,
      });
      registeredListener(
        installingWorker.addEventListener,
        'statechange'
      )(new Event('statechange'));
      await vi.advanceTimersByTimeAsync(WAITING_SETTLE_MS);
      canvasState.canvasEmpty = false;

      registeredListener(
        container.addEventListener,
        'controllerchange'
      )(new Event('controllerchange'));

      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(window.location.reload).not.toHaveBeenCalled();

      canvasState.canvasEmpty = true;
      await pwaUpdates.checkForUpdates();

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
    return () => {
      delete navigator.connection;
    };
  }

  beforeEach(() => {
    idle.queue = [];
    canvasState.canvasEmpty = true;
    originalFetch = globalThis.fetch;
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

    idle.flush();
    await flushAsync();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('is idempotent: repeated gate calls schedule a single registration', async () => {
    const container = stubServiceWorker(undefined);

    pwaUpdates.registerDeferredServiceWorker();
    pwaUpdates.registerDeferredServiceWorker();
    expect(idle.queue).toHaveLength(1);

    idle.flush();
    await flushAsync();
    pwaUpdates.registerDeferredServiceWorker();
    idle.flush();

    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('skips registration when Save-Data is on', () => {
    const container = stubServiceWorker(undefined);
    const restore = stubConnection(true);

    pwaUpdates.registerDeferredServiceWorker();
    idle.flush();

    expect(container.register).not.toHaveBeenCalled();
    restore();
  });

  // prettier-ignore
  it('does not re-register an existing worker when Save-Data is on', async () => { const container = stubServiceWorker(makeRegistration()); const restore = stubConnection(true); const teardown = pwaUpdates.initPWAUpdates(); await flushAsync(); idle.flush(); await flushAsync(); expect(container.register).not.toHaveBeenCalled(); restore(); teardown?.(); });

  it('still registers when the connection reports Save-Data off', async () => {
    const container = stubServiceWorker(undefined);
    const restore = stubConnection(false);

    pwaUpdates.registerDeferredServiceWorker();
    idle.flush();
    await flushAsync();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
    restore();
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
    idle.flush();
    await flushAsync();
    expect(container.register).toHaveBeenCalledTimes(1);

    pwaUpdates.registerDeferredServiceWorker();
    idle.flush();
    await flushAsync();

    expect(container.register).toHaveBeenCalledTimes(2);
  });

  it('update checks no-op before registration and arm once one exists', async () => {
    const container = stubServiceWorker(undefined);

    await expect(pwaUpdates.checkForUpdates()).resolves.toBeUndefined();
    expect(container.register).not.toHaveBeenCalled();

    // Registration arrives late (gate passed) — the same check now reaches the
    // registration and drives the waiting worker.
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    container.getRegistration.mockResolvedValue(reg);
    pwaUpdates.registerDeferredServiceWorker();
    idle.flush();
    await flushAsync();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('initPWAUpdates re-registers immediately at idle on a repeat visit', async () => {
    const reg = makeRegistration();
    const container = stubServiceWorker(reg);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0-test' }),
    } as Response);

    const teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    expect(container.register).not.toHaveBeenCalled(); // still waits for idle

    idle.flush();
    await flushAsync();

    expect(container.register).toHaveBeenCalledWith('/sw.js');
    teardown?.();
  });

  it('initPWAUpdates leaves a first visit to the stroke gate', async () => {
    const container = stubServiceWorker(undefined);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.0-test' }),
    } as Response);

    const teardown = pwaUpdates.initPWAUpdates();
    await flushAsync();
    idle.flush();
    await flushAsync();

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
