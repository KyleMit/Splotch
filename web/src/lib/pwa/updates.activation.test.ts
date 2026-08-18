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
  });

  it('never activates or reloads while the page is visible', async () => {
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
