import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKPOINT_QUIET_MS,
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
  const deps = {
    store: {
      read: vi.fn(async () => stored),
      write: vi.fn(async (_record: CheckpointRecord) => {}),
      remove: vi.fn(async () => {}),
    },
    capture: vi.fn(async () => capture),
    currentPage: vi.fn((): CheckpointRecord['page'] => null),
    restorePage: vi.fn(() => true),
    restoreInk: vi.fn(() => true),
    decode: vi.fn(async () => image),
  } satisfies CheckpointDeps;
  return {
    deps,
    image,
    checkpoint: createDrawingCheckpoint(deps),
    setCapture(next: CheckpointCapture) {
      capture = next;
    },
  };
}

const ink = (): CheckpointCapture => ({
  kind: 'ink',
  png: new Blob([PNG], { type: 'image/png' }),
  cssWidth: 400,
  cssHeight: 300,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('drawing checkpoint writes', () => {
  it('writes the page once it has been quiet, with its coloring page', async () => {
    const { checkpoint, deps, setCapture } = harness();
    setCapture(ink());
    deps.currentPage.mockReturnValue({ id: 'farm-cow', orientation: 'portrait' });

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
  it('restores the coloring page, then the ink, and releases the decoded image', async () => {
    const { checkpoint, deps, image } = harness(
      record({ page: { id: 'farm-cow', orientation: 'landscape' } })
    );

    await expect(checkpoint.restore()).resolves.toBe(true);

    expect(deps.restorePage).toHaveBeenCalledWith({ id: 'farm-cow', orientation: 'landscape' });
    expect(deps.restoreInk).toHaveBeenCalledWith(image, 400, 300);
    expect(vi.mocked(image.close)).toHaveBeenCalledOnce();
  });

  it('brings back no ink when its coloring page is not available', async () => {
    const { checkpoint, deps } = harness(record({ page: { id: 'gone', orientation: 'portrait' } }));
    deps.restorePage.mockReturnValue(false);

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
