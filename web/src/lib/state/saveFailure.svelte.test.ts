import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';
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

function saverReturning(...results: SaveResult[]) {
  const queue = [...results];
  return vi.fn<SavePicture>(async () => queue.shift() ?? { status: 'photos' });
}

beforeEach(() => {
  demandOverlay.mockReset();
});

describe('reportSaveFailure', () => {
  it('shows the banner with the outcome and holds the picture', async () => {
    const failure = createSaveFailure(saverReturning());

    await failure.reportSaveFailure('denied', picture('a'));

    expect(failure.outcome).toBe('denied');
    expect(failure.pictureCount).toBe(1);
    expect(demandOverlay).toHaveBeenCalledWith('saveFailureBanner');
  });

  it('shows the banner without a held picture when nothing was captured', async () => {
    const failure = createSaveFailure(saverReturning());

    await failure.reportSaveFailure('failed', null);

    expect(failure.outcome).toBe('failed');
    expect(failure.pictureCount).toBe(0);
  });

  it('holds identical pictures once', async () => {
    const failure = createSaveFailure(saverReturning());

    await failure.reportSaveFailure('denied', picture('same'));
    await failure.reportSaveFailure('denied', picture('same'));
    await failure.reportSaveFailure('denied', picture('different'));

    expect(failure.pictureCount).toBe(2);
  });

  it('releases the oldest picture past the limit', async () => {
    const save = saverReturning();
    const failure = createSaveFailure(save);

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
    const failure = createSaveFailure(save);
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
    const failure = createSaveFailure(save);

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
    const failure = createSaveFailure(save);
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
    const failure = createSaveFailure(vi.fn<SavePicture>(() => pending.promise));
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
    const failure = createSaveFailure(vi.fn<SavePicture>(() => pending.promise));
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
    const failure = createSaveFailure(save);
    await failure.reportSaveFailure('denied', picture('a'));

    failure.dismissSaveFailure();
    await failure.retryUnsavedPictures();

    expect(failure.outcome).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a report still hashing its picture from reopening the banner', async () => {
    const failure = createSaveFailure(saverReturning());

    const report = failure.reportSaveFailure('failed', picture('a'));
    failure.dismissSaveFailure();
    await report;

    expect(failure.outcome).toBeNull();
    expect(failure.pictureCount).toBe(0);
  });
});
