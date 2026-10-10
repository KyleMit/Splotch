import { describe, expect, it, vi } from 'vitest';
import { createPngRecovery } from '../../experiments/native-architecture/src/export/pngRecovery.ts';
import {
  heldPngFilename,
  MAX_HELD_PNG_ARCHIVE_CHARACTERS,
  MAX_HELD_PNG_CHARACTERS,
  parseHeldPngs,
  serializeHeldPngs,
  serializeHeldPngStorage,
} from '../../experiments/native-architecture/src/export/heldPng.ts';
import { pngFromZlib, rgbaPng } from './native-png-fixtures.mjs';

const FIRST_PNG = rgbaPng(2, 2, 0).toString('base64');
const SECOND_PNG = rgbaPng(2, 2, 255).toString('base64');
const THIRD_PNG = rgbaPng(3, 2, 255).toString('base64');
const FOURTH_PNG = rgbaPng(4, 2, 255).toString('base64');

function picture(base64 = FIRST_PNG, id = 'png-1-a') {
  return { id, filename: heldPngFilename(id), base64 };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function fixture(snapshot = null) {
  let stored = snapshot;
  let state;
  const writes = [];
  const storage = serializeHeldPngStorage({
    read: vi.fn(async () => stored),
    write: vi.fn(async (next) => {
      writes.push(next);
      stored = next;
    }),
  });
  const delivery = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
  const changed = vi.fn((next) => {
    state = next;
  });
  const owner = createPngRecovery(storage, delivery, changed);
  return { owner, storage, delivery, changed, writes, state: () => state, stored: () => stored };
}

describe('production PNG recovery owner', () => {
  it('persists exact bytes before delivery and retains an unconfirmed sheet close under one stable name', async () => {
    const held = fixture();
    held.delivery.mockImplementation(async (record) => {
      expect(JSON.parse(held.stored()).pictures).toEqual([record]);
      throw new Error('Sharing unavailable');
    });
    await held.owner.submit(FIRST_PNG);
    const original = held.delivery.mock.calls[0][0];
    expect(original.base64).toBe(FIRST_PNG);
    expect(held.state().pictures).toEqual([
      {
        id: original.id,
        filename: original.filename,
        durable: true,
        attempt: { status: 'failed', message: 'Sharing unavailable' },
      },
    ]);
    held.delivery.mockResolvedValue('sharing-closed');
    await held.owner.retry();
    expect(held.delivery.mock.calls[1][0]).toBe(original);
    expect(JSON.parse(held.stored()).pictures).toEqual([original]);
    expect(held.state().pictures[0].attempt.status).toBe('sharing-closed');
    expect(held.state().notice).toBe('');
  });

  it('restores after owner disposal without automatically sharing and retries each remaining record independently', async () => {
    const first = fixture();
    await first.owner.submit(FIRST_PNG);
    await first.owner.submit(SECOND_PNG);
    const originals = first.delivery.mock.calls.map(([record]) => record);
    first.owner.dispose();
    const restarted = fixture(first.stored());
    await restarted.owner.restore();
    expect(restarted.delivery).not.toHaveBeenCalled();
    expect(restarted.state().pictures.map(({ id, durable }) => ({ id, durable }))).toEqual(
      originals.map(({ id }) => ({ id, durable: true }))
    );
    restarted.delivery
      .mockResolvedValueOnce('sharing-closed')
      .mockRejectedValueOnce(new Error('Still unavailable'));
    await restarted.owner.retry();
    expect(restarted.delivery.mock.calls.map(([record]) => record)).toEqual(originals);
    expect(JSON.parse(restarted.stored()).pictures).toEqual(originals);
    expect(restarted.state().pictures.map(({ attempt }) => attempt)).toEqual([
      { status: 'sharing-closed' },
      { status: 'failed', message: 'Still unavailable' },
    ]);
    await restarted.owner.dismiss(originals[0].id);
    expect(JSON.parse(restarted.stored()).pictures).toEqual([originals[1]]);
    const attempts = restarted.delivery.mock.calls.length;
    await restarted.owner.retry();
    expect(restarted.delivery.mock.calls.slice(attempts).map(([record]) => record)).toEqual([
      originals[1],
    ]);
  });

  it('deduplicates the exact PNG and refuses capacity instead of evicting an older held export', async () => {
    const held = fixture();
    await held.owner.submit(FIRST_PNG);
    const original = held.delivery.mock.calls[0][0];
    await held.owner.submit(FIRST_PNG);
    expect(held.delivery.mock.calls[1][0]).toBe(original);
    await held.owner.submit(SECOND_PNG);
    await held.owner.submit(THIRD_PNG);
    const before = held.stored();
    await expect(held.owner.submit(FOURTH_PNG)).rejects.toThrow('PNG recovery is full');
    expect(held.stored()).toBe(before);
    expect(held.state().pictures).toHaveLength(3);
    expect(held.delivery).toHaveBeenCalledTimes(4);
  });

  it('keeps a failed persistence explicitly session-only and can persist the same bytes on retry', async () => {
    let stored = null;
    let writable = false;
    let state;
    const storage = serializeHeldPngStorage({
      read: async () => stored,
      write: async (snapshot) => {
        if (!writable) throw new Error('Disk full');
        stored = snapshot;
      },
    });
    const delivery = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
    const owner = createPngRecovery(storage, delivery, (next) => {
      state = next;
    });
    await owner.submit(FIRST_PNG);
    expect(state.pictures[0].durable).toBe(false);
    expect(state.notice).toContain('only while this screen stays open');
    expect(stored).toBeNull();
    const original = delivery.mock.calls[0][0];
    writable = true;
    await owner.retry();
    expect(delivery.mock.calls[1][0]).toBe(original);
    expect(JSON.parse(stored).pictures).toEqual([original]);
    expect(state.pictures[0].durable).toBe(true);
    expect(state.notice).not.toContain('only while this screen stays open');
  });

  it('preserves unreadable data while keeping a fresh PNG in memory, then merges both on explicit retry', async () => {
    const saved = picture();
    let readable = false;
    let stored = serializeHeldPngs([saved]);
    let state;
    const write = vi.fn(async (snapshot) => {
      stored = snapshot;
    });
    const storage = serializeHeldPngStorage({
      read: async () => {
        if (!readable) throw new Error('Unavailable');
        return stored;
      },
      write,
    });
    const delivery = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
    const owner = createPngRecovery(storage, delivery, (next) => {
      state = next;
    });
    await owner.submit(SECOND_PNG);
    expect(write).not.toHaveBeenCalled();
    expect(JSON.parse(stored).pictures).toEqual([saved]);
    expect(state.status).toBe('unreadable');
    expect(state.pictures[0].durable).toBe(false);
    readable = true;
    await owner.retry();
    expect(JSON.parse(stored).pictures.map(({ base64 }) => base64)).toEqual([
      FIRST_PNG,
      SECOND_PNG,
    ]);
    expect(state.pictures.every(({ durable }) => durable)).toBe(true);
  });

  it('makes dismissal outrank late delivery and persists a tombstone that restores empty', async () => {
    const held = fixture();
    const gate = deferred();
    const entered = deferred();
    held.delivery.mockImplementation(() => {
      entered.resolve();
      return gate.promise;
    });
    const pending = held.owner.submit(FIRST_PNG);
    await entered.promise;
    await held.owner.dismiss(held.state().pictures[0].id);
    gate.reject(new Error('Late sharing failure'));
    await pending;
    expect(held.state().pictures).toEqual([]);
    expect(held.state().notice).toBe('');
    const restarted = fixture(held.stored());
    await restarted.owner.restore();
    expect(restarted.state().pictures).toEqual([]);
    expect(restarted.delivery).not.toHaveBeenCalled();
  });

  it('orders predecessor writes before a successor restore and ignores unmounted delivery completion', async () => {
    let stored = null;
    const gate = deferred();
    const entered = deferred();
    const storage = serializeHeldPngStorage({
      read: async () => stored,
      write: async (snapshot) => {
        entered.resolve();
        await gate.promise;
        stored = snapshot;
      },
    });
    const delivery = vi.fn().mockResolvedValue('sharing-closed');
    const changed = vi.fn();
    const previous = createPngRecovery(storage, delivery, changed);
    const pending = previous.submit(FIRST_PNG);
    await entered.promise;
    previous.dispose();
    const afterDispose = changed.mock.calls.length;
    let nextState;
    const next = createPngRecovery(storage, delivery, (state) => {
      nextState = state;
    });
    const restored = next.restore();
    gate.resolve();
    await Promise.all([pending, restored]);
    expect(delivery).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(afterDispose);
    expect(nextState.pictures).toHaveLength(1);
    expect(JSON.parse(stored).pictures[0].base64).toBe(FIRST_PNG);
  });

  it('reports a failed dismissal write instead of claiming the record cannot return after restart', async () => {
    let stored = null;
    let writable = true;
    let state;
    const storage = serializeHeldPngStorage({
      read: async () => stored,
      write: async (snapshot) => {
        if (!writable) throw new Error('Disk unavailable');
        stored = snapshot;
      },
    });
    const recovery = createPngRecovery(
      storage,
      async () => 'sharing-closed',
      (next) => {
        state = next;
      }
    );
    await recovery.submit(FIRST_PNG);
    const heldId = state.pictures[0].id;
    writable = false;
    await recovery.dismiss(heldId);
    expect(state.pictures).toEqual([]);
    expect(state.notice).toBe(
      'PNG recovery cleanup did not finish. A dismissed PNG may return after restart.'
    );
    const restarted = fixture(stored);
    await restarted.owner.restore();
    expect(restarted.state().pictures[0].id).toBe(heldId);
    expect(restarted.delivery).not.toHaveBeenCalled();
  });

  it('does not restore a dismissed session record from a late read or start a late retry', async () => {
    const gate = deferred();
    const entered = deferred();
    const storage = serializeHeldPngStorage({
      read: vi
        .fn()
        .mockRejectedValueOnce(new Error('Unavailable'))
        .mockImplementationOnce(() => {
          entered.resolve();
          return gate.promise;
        }),
      write: vi.fn(),
    });
    let state;
    const delivery = vi.fn().mockRejectedValue(new Error('Unavailable'));
    const recovery = createPngRecovery(storage, delivery, (next) => {
      state = next;
    });
    await recovery.submit(FIRST_PNG);
    const original = delivery.mock.calls[0][0];
    const retrying = recovery.retry();
    await entered.promise;
    await recovery.dismiss(original.id);
    gate.resolve(serializeHeldPngs([original]));
    await retrying;
    expect(state.pictures).toEqual([]);
    expect(state.status).toBe('unreadable');
    expect(delivery).toHaveBeenCalledOnce();
    expect(state.notice).toBe('Existing unreadable recovery data has not been replaced.');
  });

  it('keeps per-record results while a newer request owns the public notice', async () => {
    const held = fixture();
    const gate = deferred();
    const entered = deferred();
    held.delivery.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const older = held.owner.submit(FIRST_PNG);
    await entered.promise;
    const newer = held.owner.submit(SECOND_PNG);
    const newerNotice = held.state().notice;
    gate.resolve('sharing-closed');
    await Promise.all([older, newer]);
    expect(held.state().notice).toBe(newerNotice);
    expect(JSON.parse(held.stored()).pictures.map(({ base64 }) => base64)).toEqual([
      FIRST_PNG,
      SECOND_PNG,
    ]);
  });

  it('keeps an active peer outcome when a different held record is dismissed', async () => {
    const held = fixture();
    await held.owner.submit(FIRST_PNG);
    await held.owner.submit(SECOND_PNG);
    const originals = held.delivery.mock.calls.map(([record]) => record);
    const gate = deferred();
    const entered = deferred();
    held.delivery.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const retry = held.owner.retry();
    await entered.promise;
    await held.owner.dismiss(originals[1].id);
    gate.resolve('sharing-closed');
    await retry;
    expect(held.state().pictures).toHaveLength(1);
    expect(held.state().pictures[0].attempt.status).toBe('sharing-closed');
    expect(JSON.parse(held.stored()).pictures).toEqual([originals[0]]);
  });
});

describe('held PNG trust boundary', () => {
  it.each([
    'partial JSON',
    JSON.stringify({ version: 2, pictures: [] }),
    JSON.stringify({ version: 1, pictures: [], unexpected: true }),
    serializeHeldPngs([{ ...picture(), filename: '../outside.png' }]),
    serializeHeldPngs([{ ...picture(), base64: FIRST_PNG.slice(0, -4) }]),
    serializeHeldPngs([
      { ...picture(), base64: pngFromZlib(Buffer.from([0, 1, 2, 3])).toString('base64') },
    ]),
    serializeHeldPngs([picture(), picture(SECOND_PNG)]),
    serializeHeldPngs([picture(), picture(FIRST_PNG, 'png-2-b')]),
  ])('rejects malformed or unsupported recovery without replacing it', async (snapshot) => {
    const held = fixture(snapshot);
    await held.owner.restore();
    expect(held.state().status).toBe('unreadable');
    expect(held.writes).toEqual([]);
    expect(held.stored()).toBe(snapshot);
    expect(held.delivery).not.toHaveBeenCalled();
  });

  it('rejects oversized archives and captures without constructing a fictitious held record', async () => {
    await expect(
      parseHeldPngs(' '.repeat(MAX_HELD_PNG_ARCHIVE_CHARACTERS + 1), () => true)
    ).rejects.toThrow();
    const held = fixture();
    await expect(held.owner.submit('A'.repeat(MAX_HELD_PNG_CHARACTERS + 1))).rejects.toThrow(
      'too large'
    );
    await expect(held.owner.submit('not-a-captured-PNG')).rejects.toThrow();
    await expect(
      held.owner.submit(pngFromZlib(Buffer.from([0, 1, 2, 3])).toString('base64'))
    ).rejects.toThrow();
    expect(held.delivery).not.toHaveBeenCalled();
    expect(held.writes).toEqual([]);
    expect(held.state().pictures).toEqual([]);
  });
});
