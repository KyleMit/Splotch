import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installWakeLock } from './wakeLock';

const release = vi.fn(async () => {});
// The Wake Lock API is absent from happy-dom, so the sentinel is a stub typed
// as a plain mutable object — `released` is read-only on the real
// `WakeLockSentinel`, but tests need to flip it to simulate a system release —
// and cast to `WakeLockSentinel` only at the mock's return boundary.
const sentinel = { release, released: false };
const request = vi.fn(async () => sentinel as unknown as WakeLockSentinel);

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

// Tracks the most recent install so afterEach can always tear it down —
// otherwise a test that forgets to (or asserts before) calling its own
// teardown leaves document-level listeners attached for every later test.
let activeTeardown: (() => void) | null = null;
function install(): () => void {
  activeTeardown = installWakeLock();
  return activeTeardown;
}

beforeEach(() => {
  vi.clearAllMocks();
  sentinel.released = false;
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
});

afterEach(() => {
  activeTeardown?.();
  activeTeardown = null;
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('installWakeLock', () => {
  it('requests a sentinel on the first pointerdown', async () => {
    install();

    document.dispatchEvent(new Event('pointerdown'));

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('releases the acquired sentinel on teardown', async () => {
    const teardown = install();
    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(request).toHaveBeenCalled());

    teardown();

    expect(release).toHaveBeenCalled();
  });

  it('releases a sentinel whose request resolves after teardown', async () => {
    let resolveRequest: (sentinel: WakeLockSentinel) => void = () => {};
    request.mockReturnValueOnce(
      new Promise<WakeLockSentinel>((resolve) => {
        resolveRequest = resolve;
      })
    );
    const teardown = install();
    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    teardown();
    resolveRequest(sentinel as unknown as WakeLockSentinel);

    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('tears down without throwing when no sentinel was acquired', () => {
    const teardown = install();

    expect(() => teardown()).not.toThrow();
    expect(release).not.toHaveBeenCalled();
  });

  it('retries on a later pointerdown after the first request is rejected', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    install();

    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('re-acquires the lock on visibilitychange after the system released it while hidden', async () => {
    install();
    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    sentinel.released = true;
    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does not request a wake lock on visibilitychange before any pointerdown', () => {
    install();

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(request).not.toHaveBeenCalled();
  });
});
