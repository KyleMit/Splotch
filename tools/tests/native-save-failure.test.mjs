import { describe, expect, it, vi } from 'vitest';
import { UNSAVED_PICTURE_LIMIT, createSaveFailure } from '../../src/export/saveFailure.ts';
import { readUnsavedPictures } from '../../src/export/unsavedPictures.ts';

const browserDisk = vi.hoisted(() => new Map());
vi.mock('../../src/lib/idbDatabase.ts', () => ({
  openDatabase: async (database, store) => ({
    closed: new Promise(() => {}),
    get: async (_, key) => structuredClone(browserDisk.get(`${database}:${store}:${key}`)),
    put: async (_, value, key) =>
      browserDisk.set(`${database}:${store}:${key}`, structuredClone(value)),
  }),
}));

// A platform save the test settles one call at a time.
function heldSave() {
  const calls = [];
  const save = vi.fn(
    (png) =>
      new Promise((resolve) => {
        calls.push({ png, resolve });
      })
  );
  return { save, calls };
}

function owner(save = vi.fn(async () => 'photos')) {
  const publish = vi.fn();
  return { failure: createSaveFailure(save, publish), save, publish };
}

describe('the Save Failure Banner owner', () => {
  it('rejects obsolete saved outcomes while keeping valid refused pictures', () => {
    const obsolete = { pngBase64: 'held-png', outcome: 'unavailable' };
    const valid = { pngBase64: 'valid-png', outcome: 'failed' };
    expect(readUnsavedPictures([obsolete])).toBeNull();
    expect(readUnsavedPictures([obsolete, valid])).toEqual([valid]);
  });

  function durableStore(initial = null) {
    let record = structuredClone(initial);
    return {
      read: vi.fn(async () => structuredClone(record)),
      write: vi.fn(async (next) => {
        record = structuredClone(next);
      }),
    };
  }

  it('restores exact refused picture bytes after the app closes, then removes saved or dismissed records', async () => {
    const store = durableStore();
    const first = createSaveFailure(
      vi.fn(async () => 'denied'),
      vi.fn(),
      store
    );
    first.report('denied', 'held-png');
    await first.restore();
    const save = vi.fn(async () => 'photos');
    const relaunched = createSaveFailure(save, vi.fn(), store);
    await relaunched.restore();
    expect(relaunched.getState()).toMatchObject({ outcome: 'denied', pictureCount: 1 });
    await relaunched.retry();
    await relaunched.restore();
    expect(save).toHaveBeenCalledWith('held-png', undefined);
    const saved = createSaveFailure(save, vi.fn(), store);
    await saved.restore();
    expect(saved.getState().pictureCount).toBe(0);
    saved.report('failed', 'second-png');
    saved.dismiss();
    await saved.restore();
    const dismissed = createSaveFailure(save, vi.fn(), store);
    await dismissed.restore();
    expect(dismissed.getState().pictureCount).toBe(0);
  });

  it('merges a failure arriving during restore without overwriting the saved record', async () => {
    let read;
    const store = durableStore([{ pngBase64: 'old-png', outcome: 'denied' }]);
    store.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          read = resolve;
        })
    );
    const failure = createSaveFailure(vi.fn(), vi.fn(), store);
    const restoration = failure.restore();
    await Promise.resolve();
    failure.report('failed', 'new-png');
    read([{ pngBase64: 'old-png', outcome: 'denied' }]);
    await restoration;
    await failure.restore();
    expect(failure.getState()).toMatchObject({ outcome: 'denied', pictureCount: 2 });
    expect(store.write).toHaveBeenLastCalledWith([
      { pngBase64: 'old-png', outcome: 'denied' },
      { pngBase64: 'new-png', outcome: 'failed', format: undefined },
    ]);
  });

  it('protects an unread record until a later successful restore merges it', async () => {
    const store = durableStore([{ pngBase64: 'old-png', outcome: 'denied' }]);
    store.read.mockRejectedValue(new Error('Storage unavailable.'));
    const failure = createSaveFailure(vi.fn(), vi.fn(), store);
    failure.report('failed', 'new-png');
    await failure.restore();
    expect(store.write).not.toHaveBeenCalled();
    store.read.mockResolvedValue([{ pngBase64: 'old-png', outcome: 'denied' }]);
    await failure.restore();
    failure.report('failed', 'new-png');
    await failure.restore();
    expect(failure.getState().pictureCount).toBe(2);
    expect(store.write).toHaveBeenCalled();
  });

  it('does not resurrect restored pictures after dismissal during a read', async () => {
    let finish;
    const store = durableStore();
    store.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const failure = createSaveFailure(vi.fn(), vi.fn(), store);
    const restoration = failure.restore();
    await Promise.resolve();
    failure.dismiss();
    finish([{ pngBase64: 'old-png', outcome: 'denied' }]);
    await restoration;
    await failure.restore();
    expect(failure.getState().pictureCount).toBe(0);
    expect(store.write).toHaveBeenLastCalledWith(null);
  });
  it('holds a refused picture and retries those exact bytes, not a fresh capture', async () => {
    const { failure, save } = owner(vi.fn(async () => 'photos'));
    failure.report('failed', 'first-png');
    expect(failure.getState()).toEqual({ outcome: 'failed', pictureCount: 1, retrying: false });
    await failure.retry();
    expect(save.mock.calls).toEqual([['first-png', undefined]]);
    expect(failure.getState()).toEqual({ outcome: null, pictureCount: 0, retrying: false });
  });

  it('retries an AI picture in the format it arrived in', async () => {
    const { failure, save } = owner(vi.fn(async () => 'downloads'));
    const format = { baseName: 'splotch-ai', mime: 'image/jpeg' };
    failure.report('failed', 'ai-jpeg', format);
    await failure.retry();
    expect(save).toHaveBeenCalledWith('ai-jpeg', format);
  });

  it('is busy while a retry saves, and keeps a picture that fails again with its new outcome', async () => {
    const { save, calls } = heldSave();
    const { failure, publish } = owner(save);
    failure.report('failed', 'png');
    const retry = failure.retry();
    expect(failure.getState().retrying).toBe(true);
    void failure.retry();
    expect(save).toHaveBeenCalledOnce();
    calls[0].resolve('denied');
    await retry;
    expect(failure.getState()).toEqual({ outcome: 'denied', pictureCount: 1, retrying: false });
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it('holds identical bytes once and keeps a denial reported for either copy', () => {
    const { failure } = owner();
    failure.report('denied', 'same');
    failure.report('failed', 'same');
    expect(failure.getState()).toMatchObject({ outcome: 'denied', pictureCount: 1 });
    const other = owner().failure;
    other.report('failed', 'same');
    other.report('denied', 'same');
    expect(other.getState()).toMatchObject({ outcome: 'denied', pictureCount: 1 });
  });

  it('releases the oldest picture past the shipping limit', async () => {
    const { failure, save } = owner(vi.fn(async () => 'failed'));
    for (let index = 0; index <= UNSAVED_PICTURE_LIMIT; index++)
      failure.report('failed', `png-${index}`);
    expect(failure.getState().pictureCount).toBe(UNSAVED_PICTURE_LIMIT);
    await failure.retry();
    expect(save.mock.calls.map(([png]) => png)).toEqual(
      Array.from({ length: UNSAVED_PICTURE_LIMIT }, (_, index) => `png-${index + 1}`)
    );
  });

  it('reports a capture that produced nothing without a picture to retry', async () => {
    const { failure, save } = owner();
    failure.report('failed', null);
    expect(failure.getState()).toEqual({ outcome: 'failed', pictureCount: 0, retrying: false });
    await failure.retry();
    expect(save).not.toHaveBeenCalled();
    expect(failure.getState().outcome).toBe('failed');
  });

  it('holds and retries a picture after a native gallery failure', async () => {
    const { failure, save } = owner();
    failure.report('failed', 'png');
    expect(failure.getState()).toEqual({
      outcome: 'failed',
      pictureCount: 1,
      retrying: false,
    });
    await failure.retry();
    expect(save).toHaveBeenCalledWith('png', undefined);
    expect(failure.getState().outcome).toBeNull();
  });

  it('clears a picture-less failure seen when a retry started, and keeps one reported during it', async () => {
    const { save, calls } = heldSave();
    const { failure } = owner(save);
    failure.report('failed', null);
    failure.report('failed', 'png');
    const retry = failure.retry();
    failure.report('failed', 'later-png');
    calls[0].resolve('photos');
    await retry;
    expect(calls.map(({ png }) => png)).toEqual(['png']);
    expect(failure.getState()).toEqual({ outcome: 'failed', pictureCount: 1, retrying: false });
    void failure.retry();
    expect(calls.map(({ png }) => png)).toEqual(['png', 'later-png']);
    const fresh = owner(vi.fn(async () => 'photos')).failure;
    fresh.report('failed', null);
    fresh.report('failed', 'png');
    await fresh.retry();
    expect(fresh.getState().outcome).toBeNull();
  });

  it('lets a dismissal stand over a retry that settles after it', async () => {
    const { save, calls } = heldSave();
    const { failure } = owner(save);
    failure.report('failed', 'png');
    const retry = failure.retry();
    failure.dismiss();
    expect(failure.getState()).toEqual({ outcome: null, pictureCount: 0, retrying: false });
    calls[0].resolve('failed');
    await retry;
    expect(failure.getState()).toEqual({ outcome: null, pictureCount: 0, retrying: false });
  });
});

it('keeps refused bytes through the browser storage adapter for a new app owner', async () => {
  const { unsavedPictureStore } = await import('../../src/platform/unsavedPictures.web.ts');
  await unsavedPictureStore.write(null);
  const first = createSaveFailure(vi.fn(), vi.fn(), unsavedPictureStore);
  first.report('failed', 'web-png');
  await first.restore();
  const save = vi.fn(async () => 'downloads');
  const relaunched = createSaveFailure(save, vi.fn(), unsavedPictureStore);
  await relaunched.restore();
  expect(relaunched.getState().pictureCount).toBe(1);
  await relaunched.retry();
  await relaunched.restore();
  expect(save).toHaveBeenCalledWith('web-png', undefined);
  await expect(unsavedPictureStore.read()).resolves.toBeNull();
});
