import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installWakeLock } from './wakeLock';

const release = vi.fn(async () => {});
// The Wake Lock API is absent from happy-dom, so the sentinel is a stub cast at
// this boundary rather than a constructible DOM object.
const sentinel = { release } as unknown as WakeLockSentinel;
const request = vi.fn(async () => sentinel);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('installWakeLock', () => {
  it('requests a sentinel on the first pointerdown', async () => {
    installWakeLock();

    document.dispatchEvent(new Event('pointerdown'));

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('releases the acquired sentinel on teardown', async () => {
    const teardown = installWakeLock();
    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(request).toHaveBeenCalled());

    teardown();

    expect(release).toHaveBeenCalled();
  });

  it('tears down without throwing when no sentinel was acquired', () => {
    const teardown = installWakeLock();

    expect(() => teardown()).not.toThrow();
    expect(release).not.toHaveBeenCalled();
  });
});
