import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';
import type { HeldPictures, UnsavedPictureStore } from '$lib/drawing/unsavedPictureStore';
import {
  createSaveFailure,
  UNSAVED_PICTURE_LIMIT,
  type SavePicture,
  type UnsavedPicture,
} from './saveFailure.svelte';

const demandOverlay = vi.hoisted(() => vi.fn());
vi.mock('./overlayDemand', () => ({ demandOverlay }));

function picture(bytes: string, baseName = 'splotch'): UnsavedPicture {
  return { blob: new Blob([bytes], { type: 'image/png' }), baseName };
}

interface MemoryStore extends UnsavedPictureStore {
  held: HeldPictures | null;
}

function memoryStore(initial: HeldPictures | null = null) {
  const store: MemoryStore & { read: ReturnType<typeof vi.fn<MemoryStore['read']>> } = {
    held: initial,
    read: vi.fn<MemoryStore['read']>(async () => store.held),
    write: vi.fn(async (held: HeldPictures | null) => {
      store.held = held;
    }),
  };
  return store;
}

function failureWith(savePicture: SavePicture, pictureStore = memoryStore()) {
  return createSaveFailure({ savePicture, pictureStore });
}

function saverReturning(...results: SaveResult[]) {
  const queue = [...results];
  return vi.fn<SavePicture>(async () => queue.shift() ?? { status: 'photos' });
}

beforeEach(() => {
  demandOverlay.mockReset();
});

describe('reportSaveFailure', () => {
  it('shows the banner with the outcome and holds the picture', async () => {
    const failure = failureWith(saverReturning());

    await failure.reportSaveFailure('denied', picture('a'));

    expect(failure.outcome).toBe('denied');
    expect(failure.pictureCount).toBe(1);
    expect(demandOverlay).toHaveBeenCalledWith('saveFailureBanner');
  });

  it('shows the banner without a held picture when nothing was captured', async () => {
    const failure = failureWith(saverReturning());

    await failure.reportSaveFailure('failed', null);

    expect(failure.outcome).toBe('failed');
    expect(failure.pictureCount).toBe(0);
  });

  it('holds identical pictures once', async () => {
    const failure = failureWith(saverReturning());

    await failure.reportSaveFailure('denied', picture('same'));
    await failure.reportSaveFailure('denied', picture('same'));
    await failure.reportSaveFailure('denied', picture('different'));

    expect(failure.pictureCount).toBe(2);
  });

  it('releases the oldest picture past the limit', async () => {
    const save = saverReturning();
    const failure = failureWith(save);

    for (let i = 0; i <= UNSAVED_PICTURE_LIMIT; i++) {
      await failure.reportSaveFailure('failed', picture(`picture-${i}`, `name-${i}`));
    }
    await failure.retryUnsavedPictures();

    expect(save).toHaveBeenCalledTimes(UNSAVED_PICTURE_LIMIT);
    expect(save.mock.calls.map(([saved]) => saved.baseName)).not.toContain('name-0');
  });
});

describe('retryUnsavedPictures', () => {
  it('saves the held bytes rather than anything newer, then hides the banner', async () => {
    const save = saverReturning({ status: 'photos' });
    const failure = failureWith(save);
    const held = picture('the drawing that was cleared', 'splotch-ai');

    await failure.reportSaveFailure('denied', held);
    await failure.retryUnsavedPictures();

    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ blob: held.blob, baseName: 'splotch-ai' })
    );
    expect(failure.outcome).toBeNull();
    expect(failure.pictureCount).toBe(0);
  });

  it('keeps only the pictures that still did not save, reporting denial when any was denied', async () => {
    const save = saverReturning({ status: 'photos' }, { status: 'denied' }, { status: 'failed' });
    const failure = failureWith(save);

    await failure.reportSaveFailure('failed', picture('a'));
    await failure.reportSaveFailure('failed', picture('b'));
    await failure.reportSaveFailure('failed', picture('c'));
    await failure.retryUnsavedPictures();

    expect(failure.pictureCount).toBe(2);
    expect(failure.outcome).toBe('denied');

    save.mockResolvedValue({ status: 'photos' });
    await failure.retryUnsavedPictures();
    expect(failure.pictureCount).toBe(0);
    expect(failure.outcome).toBeNull();
  });

  it('reports retrying while a save is in flight and ignores a second tap', async () => {
    const pending = Promise.withResolvers<SaveResult>();
    const save = vi.fn<SavePicture>(() => pending.promise);
    const failure = failureWith(save);
    await failure.reportSaveFailure('failed', picture('a'));

    const retry = failure.retryUnsavedPictures();
    expect(failure.retrying).toBe(true);
    await failure.retryUnsavedPictures();
    expect(save).toHaveBeenCalledOnce();

    pending.resolve({ status: 'downloads' });
    await retry;
    expect(failure.retrying).toBe(false);
  });

  it('keeps a picture reported while the retry was running', async () => {
    const pending = Promise.withResolvers<SaveResult>();
    const failure = failureWith(vi.fn<SavePicture>(() => pending.promise));
    await failure.reportSaveFailure('failed', picture('a'));

    const retry = failure.retryUnsavedPictures();
    await failure.reportSaveFailure('denied', picture('b'));
    pending.resolve({ status: 'photos' });
    await retry;

    expect(failure.pictureCount).toBe(1);
    expect(failure.outcome).toBe('denied');
  });

  it('lets a dismissal win over a retry that settles afterwards', async () => {
    const pending = Promise.withResolvers<SaveResult>();
    const failure = failureWith(vi.fn<SavePicture>(() => pending.promise));
    await failure.reportSaveFailure('failed', picture('a'));

    const retry = failure.retryUnsavedPictures();
    failure.dismissSaveFailure();
    pending.resolve({ status: 'failed' });
    await retry;

    expect(failure.outcome).toBeNull();
    expect(failure.pictureCount).toBe(0);
    expect(failure.retrying).toBe(false);
  });
});

describe('dismissSaveFailure', () => {
  it('releases every held picture', async () => {
    const save = saverReturning();
    const failure = failureWith(save);
    await failure.reportSaveFailure('denied', picture('a'));

    failure.dismissSaveFailure();
    await failure.retryUnsavedPictures();

    expect(failure.outcome).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a report still hashing its picture from reopening the banner', async () => {
    const failure = failureWith(saverReturning());

    const report = failure.reportSaveFailure('failed', picture('a'));
    failure.dismissSaveFailure();
    await report;

    expect(failure.outcome).toBeNull();
    expect(failure.pictureCount).toBe(0);
  });
});

describe('unsaved pictures across a relaunch', () => {
  it('keeps the held pictures and outcome in the store, and clears it once they save', async () => {
    const store = memoryStore();
    const failure = failureWith(saverReturning({ status: 'photos' }), store);
    const held = picture('kept');

    await failure.reportSaveFailure('denied', held);
    await vi.waitFor(() =>
      expect(store.held).toMatchObject({ outcome: 'denied', pictures: [{ blob: held.blob }] })
    );

    await failure.retryUnsavedPictures();
    await vi.waitFor(() => expect(store.held).toBeNull());
  });

  it('restores the banner with the pictures a terminated session left behind', async () => {
    const earlier = picture('drawn before Settings');
    const store = memoryStore({
      outcome: 'denied',
      pictures: [{ ...earlier, signature: 'earlier' }],
    });
    const save = saverReturning({ status: 'photos' });
    const failure = failureWith(save, store);

    await failure.restoreUnsavedPictures();

    expect(failure.outcome).toBe('denied');
    expect(failure.pictureCount).toBe(1);
    expect(demandOverlay).toHaveBeenCalledWith('saveFailureBanner');

    await failure.retryUnsavedPictures();
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ blob: earlier.blob }));
    expect(failure.outcome).toBeNull();
  });

  it('keeps both the restored pictures and one reported while the store was being read', async () => {
    const read = Promise.withResolvers<HeldPictures | null>();
    const store = memoryStore();
    store.read.mockReturnValueOnce(read.promise);
    const failure = failureWith(saverReturning(), store);

    const restore = failure.restoreUnsavedPictures();
    const report = failure.reportSaveFailure('failed', picture('new'));
    read.resolve({ outcome: 'denied', pictures: [{ ...picture('old'), signature: 'old' }] });
    await Promise.all([restore, report]);

    expect(failure.pictureCount).toBe(2);
    await vi.waitFor(() => expect(store.held?.pictures).toHaveLength(2));
  });

  it('forgets the stored pictures on dismissal', async () => {
    const store = memoryStore();
    const failure = failureWith(saverReturning(), store);
    await failure.reportSaveFailure('denied', picture('a'));

    failure.dismissSaveFailure();

    await vi.waitFor(() => expect(store.held).toBeNull());
  });

  it('restores nothing when the store is empty', async () => {
    const failure = failureWith(saverReturning(), memoryStore());

    await failure.restoreUnsavedPictures();

    expect(failure.outcome).toBeNull();
    expect(demandOverlay).not.toHaveBeenCalled();
  });
});
