// The apply half of the update lifecycle: silent activation when the running
// page already matches the deployed version, and the hidden-edge apply that
// reloads a stale page only while nobody is looking. Registration, init
// wiring, and the version-mismatch cache-bust live in updates.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPWAUpdates, ACTIVATION_RECOVERY_MS, WAITING_SETTLE_MS } from './updates';
import {
  CURRENT_VERSION,
  NEWER_VERSION,
  controllerChangeListeners,
  makeRegistration,
  makeWorker,
  registeredListener,
  restoreDocumentVisibility,
  setDocumentVisibility,
  stubDeployedVersion,
  stubReloadableLocation,
  stubServiceWorker,
} from './updatesTestHarness';

const canvasState = vi.hoisted(() => ({ canvasEmpty: true }));
vi.mock('$lib/state/canvas.svelte', () => ({ canvasState, SETTLED_IN_STROKES: 3 }));

let pwaUpdates: ReturnType<typeof createPWAUpdates>;
let originalFetch: typeof fetch;

beforeEach(() => {
  pwaUpdates = createPWAUpdates();
  originalFetch = globalThis.fetch;
  canvasState.canvasEmpty = true;
  stubReloadableLocation();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('checkForUpdates — silent activation when the page is already current', () => {
  beforeEach(() => {
    stubDeployedVersion(CURRENT_VERSION);
  });

  it('activates the waiting worker without reloading', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('activates silently even while the canvas has ink', async () => {
    canvasState.canvasEmpty = false;
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('posts SKIP_WAITING only once while an activation is in flight', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    await pwaUpdates.checkForUpdates();

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(controllerChangeListeners(container)).toHaveLength(1);

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));
  });

  it('recovers from a stuck silent activation so a later check re-attempts', async () => {
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
      await pwaUpdates.checkForUpdates();
      expect(worker.postMessage).toHaveBeenCalledTimes(1);

      // After the grace period the lifecycle releases back to none...
      await vi.advanceTimersByTimeAsync(ACTIVATION_RECOVERY_MS);

      // ...so the next check re-decides and re-attempts instead of no-oping forever.
      await pwaUpdates.checkForUpdates();
      expect(worker.postMessage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits out an installing worker instead of deciding on a stale waiting one', async () => {
    vi.useFakeTimers();
    try {
      const staleWaiting = makeWorker();
      const installingWorker = makeWorker();
      const reg = makeRegistration({
        waiting: staleWaiting as unknown as ServiceWorker,
        installing: installingWorker as unknown as ServiceWorker,
      });
      stubServiceWorker(reg);

      // update() resolves as soon as the new worker starts installing, so a
      // stale waiting worker from an earlier deploy can share the registration
      // with it. Deciding now would compare /version.json (the new deploy)
      // against the page and silently activate the stale precache.
      await pwaUpdates.checkForUpdates();
      expect(staleWaiting.postMessage).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // The install settles: the browser discards the stale worker and the
      // new one takes the waiting slot — only then does the decision run.
      Object.defineProperty(reg, 'waiting', {
        value: installingWorker,
        configurable: true,
      });
      registeredListener(
        installingWorker.addEventListener,
        'statechange'
      )(new Event('statechange'));
      await vi.advanceTimersByTimeAsync(WAITING_SETTLE_MS);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(installingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(staleWaiting.postMessage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
});

describe('checkForUpdates — stale page defers the reload to the hidden edge', () => {
  beforeEach(() => {
    stubDeployedVersion(NEWER_VERSION);
    // The apply path runs from the visibilitychange→hidden handler, so these
    // tests model controllerchange arriving while the document is still hidden.
    setDocumentVisibility('hidden');
  });

  afterEach(() => {
    restoreDocumentVisibility();
  });

  it('never activates or reloads while the page is visible', async () => {
    setDocumentVisibility('visible');
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('applyPendingUpdate activates the waiting worker and reloads on controllerchange', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    pwaUpdates.applyPendingUpdate();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown deployed version (offline) as stale and defers the same way', async () => {
    stubDeployedVersion(null);
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    expect(worker.postMessage).not.toHaveBeenCalled();

    pwaUpdates.applyPendingUpdate();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('applyPendingUpdate does nothing while the canvas has ink', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    canvasState.canvasEmpty = false;
    pwaUpdates.applyPendingUpdate();

    expect(worker.postMessage).not.toHaveBeenCalled();

    canvasState.canvasEmpty = true;
    pwaUpdates.applyPendingUpdate();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('defers to owed when controllerchange arrives after the app is visible again', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    pwaUpdates.applyPendingUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    // The PWA was suspended right after SKIP_WAITING and resumed before the
    // new worker took control — controllerchange lands in a visible session.
    setDocumentVisibility('visible');
    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));

    expect(window.location.reload).not.toHaveBeenCalled();

    setDocumentVisibility('hidden');
    pwaUpdates.applyPendingUpdate();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('defers reload when ink appears before controllerchange, draining at the next apply', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    const container = stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    pwaUpdates.applyPendingUpdate();
    canvasState.canvasEmpty = false;

    registeredListener(
      container.addEventListener,
      'controllerchange'
    )(new Event('controllerchange'));

    expect(window.location.reload).not.toHaveBeenCalled();

    // A visible-session check never drains the owed reload — only the hidden
    // edge does, so the user is not yanked mid-session.
    canvasState.canvasEmpty = true;
    await pwaUpdates.checkForUpdates();
    expect(window.location.reload).not.toHaveBeenCalled();

    pwaUpdates.applyPendingUpdate();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('fetches the deployed version once per pending update, not on every check', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    await pwaUpdates.checkForUpdates();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('a stuck hidden apply retries at the next hidden moment', async () => {
    vi.useFakeTimers();
    try {
      const worker = makeWorker();
      const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
      stubServiceWorker(reg);

      await pwaUpdates.checkForUpdates();
      pwaUpdates.applyPendingUpdate();
      expect(worker.postMessage).toHaveBeenCalledTimes(1); // entered 'activating'

      // Still activating — a second apply must not double-post.
      pwaUpdates.applyPendingUpdate();
      expect(worker.postMessage).toHaveBeenCalledTimes(1);

      // controllerchange never arrives; recovery releases back to 'ready'...
      await vi.advanceTimersByTimeAsync(ACTIVATION_RECOVERY_MS);

      // ...so the next hidden moment retries the apply.
      pwaUpdates.applyPendingUpdate();
      expect(worker.postMessage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a pending update whose waiting worker vanished, so a later check re-decides', async () => {
    const worker = makeWorker();
    const reg = makeRegistration({ waiting: worker as unknown as ServiceWorker });
    stubServiceWorker(reg);

    await pwaUpdates.checkForUpdates();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(reg, 'waiting', { value: null, configurable: true });
    pwaUpdates.applyPendingUpdate();

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();

    // Back to 'none': a later check with a fresh waiting worker re-decides
    // (a still-pending update would skip the version fetch).
    Object.defineProperty(reg, 'waiting', { value: worker, configurable: true });
    await pwaUpdates.checkForUpdates();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('an installing worker that reaches waiting defers to the hidden edge too', async () => {
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

      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      pwaUpdates.applyPendingUpdate();
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

      registeredListener(
        container.addEventListener,
        'controllerchange'
      )(new Event('controllerchange'));

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
