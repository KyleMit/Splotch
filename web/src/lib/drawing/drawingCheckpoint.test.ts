import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKPOINT_QUIET_MS,
  type ResolvedPage,
  createDrawingCheckpoint,
  isCheckpointRecord,
  type CheckpointCapture,
  type CheckpointDeps,
  type CheckpointRecord,
} from './drawingCheckpoint';

const PNG = new Uint8Array([137, 80, 78, 71]);

function record(overrides: Partial<CheckpointRecord> = {}): CheckpointRecord {
  return { bytes: PNG.slice().buffer, cssWidth: 400, cssHeight: 300, page: null, ...overrides };
}

function harness(stored: unknown = undefined) {
  let capture: CheckpointCapture = { kind: 'empty' };
  const image = { close: vi.fn() } as unknown as ImageBitmap;
  const resolved = { stillApplies: vi.fn(() => true), apply: vi.fn() };
  const applyPage = resolved.apply;
  const deps = {
    store: {
      read: vi.fn(async () => stored),
      write: vi.fn(async (_record: CheckpointRecord) => {}),
      remove: vi.fn(async () => {}),
    },
    capture: vi.fn(async () => capture),
    resolvePage: vi.fn(
      async (_page: CheckpointRecord['page'], _signal: AbortSignal): Promise<ResolvedPage | null> =>
        resolved
    ),
    pageUntouched: vi.fn(() => true),
    restoreInk: vi.fn(() => true),
    decode: vi.fn(async () => image),
  } satisfies CheckpointDeps;
  return {
    deps,
    image,
    applyPage,
    resolved,
    checkpoint: createDrawingCheckpoint(deps),
    setCapture(next: CheckpointCapture) {
      capture = next;
    },
  };
}

const ink = (page: CheckpointRecord['page'] = null): CheckpointCapture => ({
  kind: 'ink',
  png: new Blob([PNG], { type: 'image/png' }),
  cssWidth: 400,
  cssHeight: 300,
  page,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('drawing checkpoint writes', () => {
  it('writes the page once it has been quiet, with the coloring page captured with its ink', async () => {
    const { checkpoint, deps, setCapture } = harness();
    setCapture(ink({ id: 'farm-cow', orientation: 'portrait' }));

    checkpoint.changed();
    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS - 1);
    expect(deps.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(deps.capture).toHaveBeenCalledOnce();
    expect(deps.store.write).toHaveBeenCalledExactlyOnceWith({
      bytes: expect.any(ArrayBuffer),
      cssWidth: 400,
      cssHeight: 300,
      page: { id: 'farm-cow', orientation: 'portrait' },
    });
  });

  it('writes at once on a flush, and not at all when nothing changed', async () => {
    const { checkpoint, deps, setCapture } = harness();
    setCapture(ink());

    await checkpoint.flush();
    expect(deps.capture).not.toHaveBeenCalled();

    checkpoint.changed();
    await checkpoint.flush();
    expect(deps.store.write).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);
    expect(deps.store.write).toHaveBeenCalledOnce();
  });

  it('leaves the stored picture alone while a stroke is in progress', async () => {
    const { checkpoint, deps, setCapture } = harness();
    setCapture({ kind: 'busy' });

    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);

    expect(deps.store.write).not.toHaveBeenCalled();
    expect(deps.store.remove).not.toHaveBeenCalled();
  });

  it('removes the picture when a page that had ink goes blank', async () => {
    const { checkpoint, deps, setCapture } = harness();
    setCapture(ink());
    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);

    setCapture({ kind: 'empty' });
    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);

    expect(deps.store.remove).toHaveBeenCalledOnce();
  });

  it('keeps a picture it could not restore while its own page has never had ink', async () => {
    const { checkpoint, deps } = harness(record());
    deps.restoreInk.mockReturnValue(false);

    await checkpoint.restore();
    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);

    expect(deps.store.remove).not.toHaveBeenCalled();
  });

  it('runs one more write for a change made during a write', async () => {
    const { checkpoint, deps, setCapture } = harness();
    setCapture(ink());
    let finishWrite = () => {};
    deps.store.write.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishWrite = resolve))
    );

    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);
    const flushed = checkpoint.flush();
    checkpoint.changed();
    void checkpoint.flush();
    finishWrite();
    await flushed;
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.store.write).toHaveBeenCalledTimes(2);
  });

  it('waits for the restore before its first write', async () => {
    let finishRead = (_value: unknown) => {};
    const { checkpoint, deps, setCapture } = harness();
    deps.store.read.mockImplementationOnce(() => new Promise((resolve) => (finishRead = resolve)));
    setCapture({ kind: 'empty' });

    void checkpoint.restore();
    checkpoint.changed();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_QUIET_MS);
    expect(deps.capture).not.toHaveBeenCalled();

    finishRead(record());
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.capture).toHaveBeenCalledOnce();
  });
});

describe('drawing checkpoint restore', () => {
  it('restores the ink, then its coloring page, and releases the decoded image', async () => {
    const { checkpoint, deps, image, applyPage } = harness(
      record({ page: { id: 'farm-cow', orientation: 'landscape' } })
    );
    deps.restoreInk.mockImplementation(() => {
      expect(applyPage).not.toHaveBeenCalled();
      return true;
    });

    await expect(checkpoint.restore()).resolves.toBe(true);

    expect(deps.resolvePage).toHaveBeenCalledWith(
      { id: 'farm-cow', orientation: 'landscape' },
      expect.any(AbortSignal)
    );
    expect(deps.restoreInk).toHaveBeenCalledWith(image, 400, 300);
    expect(applyPage).toHaveBeenCalledOnce();
    expect(vi.mocked(image.close)).toHaveBeenCalledOnce();
  });

  it('leaves the coloring page alone when the page refuses the ink', async () => {
    const { checkpoint, deps, applyPage } = harness(
      record({ page: { id: 'farm-cow', orientation: 'portrait' } })
    );
    deps.restoreInk.mockReturnValue(false);

    await expect(checkpoint.restore()).resolves.toBe(false);
    expect(applyPage).not.toHaveBeenCalled();
  });

  it('changes nothing once a page was chosen while the record loaded', async () => {
    const { checkpoint, deps, applyPage } = harness(
      record({ page: { id: 'farm-cow', orientation: 'portrait' } })
    );
    deps.pageUntouched.mockReturnValue(false);

    await expect(checkpoint.restore()).resolves.toBe(false);
    expect(deps.restoreInk).not.toHaveBeenCalled();
    expect(applyPage).not.toHaveBeenCalled();
  });

  it('changes nothing once the coloring book was switched off while the record loaded', async () => {
    const { checkpoint, deps, resolved } = harness(
      record({ page: { id: 'farm-cow', orientation: 'portrait' } })
    );
    resolved.stillApplies.mockReturnValue(false);

    await expect(checkpoint.restore()).resolves.toBe(false);
    expect(deps.restoreInk).not.toHaveBeenCalled();
    expect(resolved.apply).not.toHaveBeenCalled();
  });

  it('changes nothing once it was disposed while the record loaded', async () => {
    let finishDecode = (_image: ImageBitmap) => {};
    const { checkpoint, deps, image } = harness(record());
    deps.decode.mockImplementationOnce(
      () => new Promise<ImageBitmap>((resolve) => (finishDecode = resolve))
    );

    const restoring = checkpoint.restore();
    await vi.advanceTimersByTimeAsync(0);
    checkpoint.dispose();
    finishDecode(image);

    await expect(restoring).resolves.toBe(false);
    expect(deps.restoreInk).not.toHaveBeenCalled();
  });

  it('retries a restore the page refused once the paper is resized', async () => {
    const { checkpoint, deps, image } = harness(record());
    deps.restoreInk.mockReturnValueOnce(false);

    await expect(checkpoint.restore()).resolves.toBe(false);
    checkpoint.paperResized();
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.restoreInk).toHaveBeenCalledTimes(2);
    expect(deps.restoreInk).toHaveBeenLastCalledWith(image, 400, 300);
    checkpoint.paperResized();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.restoreInk).toHaveBeenCalledTimes(2);
  });

  it('does not retry once the page has been touched, or when nothing was refused', async () => {
    const touched = harness(record());
    touched.deps.restoreInk.mockReturnValueOnce(false);
    await touched.checkpoint.restore();
    touched.deps.pageUntouched.mockReturnValue(false);
    touched.checkpoint.paperResized();
    await vi.advanceTimersByTimeAsync(0);
    expect(touched.deps.restoreInk).toHaveBeenCalledOnce();

    const empty = harness(undefined);
    await empty.checkpoint.restore();
    empty.checkpoint.paperResized();
    await vi.advanceTimersByTimeAsync(0);
    expect(empty.deps.store.read).toHaveBeenCalledOnce();
  });

  it('aborts the page lookup it is waiting on when disposed', async () => {
    const { checkpoint, deps } = harness(record({ page: { id: 'trex', orientation: 'portrait' } }));
    let lookupSignal: AbortSignal | undefined;
    deps.resolvePage.mockImplementationOnce(async (_page, signal) => {
      lookupSignal = signal;
      return null;
    });

    await checkpoint.restore();
    expect(lookupSignal?.aborted).toBe(false);
    checkpoint.dispose();

    expect(lookupSignal?.aborted).toBe(true);
  });

  it('brings back no ink when its coloring page is not available', async () => {
    const { checkpoint, deps } = harness(record({ page: { id: 'gone', orientation: 'portrait' } }));
    deps.resolvePage.mockResolvedValue(null);

    await expect(checkpoint.restore()).resolves.toBe(false);
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it('treats an unreadable store as nothing to restore', async () => {
    const { checkpoint, deps } = harness();
    deps.store.read.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    await expect(checkpoint.restore()).resolves.toBe(false);
    expect(deps.restoreInk).not.toHaveBeenCalled();
  });
});

describe('isCheckpointRecord', () => {
  it.each([
    ['a missing record', undefined],
    ['empty bytes', record({ bytes: new ArrayBuffer(0) })],
    ['a Blob instead of bytes', { ...record(), bytes: new Blob([PNG]) }],
    ['a fractional size', record({ cssWidth: 400.5 })],
    ['an unknown orientation', { ...record(), page: { id: 'x', orientation: 'square' } }],
  ])('rejects %s', (_case, value) => {
    expect(isCheckpointRecord(value)).toBe(false);
  });

  it('accepts what this build writes', () => {
    expect(isCheckpointRecord(record({ page: { id: 'x', orientation: 'portrait' } }))).toBe(true);
  });
});
