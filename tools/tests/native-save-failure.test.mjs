import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  UNSAVED_PICTURE_LIMIT,
  createSaveFailure,
} from '../../experiments/native-architecture/src/export/saveFailure.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

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
  it('holds a refused picture and retries those exact bytes, not a fresh capture', async () => {
    const { failure, save } = owner(vi.fn(async () => 'photos'));
    failure.report('failed', 'first-png');
    expect(failure.getState()).toEqual({ outcome: 'failed', pictureCount: 1, retrying: false });
    await failure.retry();
    expect(save.mock.calls).toEqual([['first-png']]);
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

  it('holds no picture for a gallery this app cannot write to, since every retry would fail', () => {
    const { failure } = owner();
    failure.report('unavailable', 'png');
    expect(failure.getState()).toEqual({
      outcome: 'unavailable',
      pictureCount: 0,
      retrying: false,
    });
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

  it('keeps the shipping limit on held pictures', () => {
    expect(read('web/src/lib/state/saveFailure.svelte.ts')).toContain(
      `export const UNSAVED_PICTURE_LIMIT = ${UNSAVED_PICTURE_LIMIT};`
    );
  });
});
