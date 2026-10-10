import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPngRecovery } from '../../experiments/native-architecture/src/export/pngRecovery.ts';
import {
  heldPngFilename,
  serializeHeldPngs,
} from '../../experiments/native-architecture/src/export/heldPng.ts';
import { pngRecoveryPlatform } from '../../experiments/native-architecture/src/platform/pngRecovery.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

const sdk = vi.hoisted(() => ({
  contents: new Map(),
  sizes: new Map(),
  directories: new Set(),
  deleted: [],
  cacheDeletionFailure: false,
  pendingReadback: false,
  pruneFailure: false,
  write: vi.fn(),
  readback: vi.fn(),
  available: vi.fn(),
  share: vi.fn(),
  move: vi.fn(),
}));

vi.mock('expo-file-system', () => {
  class Directory {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return sdk.directories.has(this.uri);
    }
    create() {
      sdk.directories.add(this.uri);
    }
    list() {
      const child = (uri) =>
        uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/');
      return [
        ...[...sdk.directories].filter(child).map((uri) => new Directory(uri)),
        ...[...sdk.contents.keys()].filter(child).map((uri) => new File(uri)),
      ];
    }
    delete() {
      sdk.deleted.push(this.uri);
      if (sdk.cacheDeletionFailure) throw new Error('Cache deletion failed');
      for (const uri of sdk.contents.keys())
        if (uri.startsWith(`${this.uri}/`)) sdk.contents.delete(uri);
      for (const uri of sdk.directories)
        if (uri === this.uri || uri.startsWith(`${this.uri}/`)) sdk.directories.delete(uri);
    }
    rename(name) {
      const oldUri = this.uri;
      const newUri = `${oldUri.slice(0, oldUri.lastIndexOf('/'))}/${name}`;
      for (const [uri, contents] of [...sdk.contents]) {
        if (uri.startsWith(`${oldUri}/`)) {
          sdk.contents.delete(uri);
          sdk.contents.set(`${newUri}${uri.slice(oldUri.length)}`, contents);
        }
      }
      sdk.directories.delete(oldUri);
      sdk.directories.add(newUri);
      this.uri = newUri;
    }
  }
  class File {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return sdk.contents.has(this.uri);
    }
    get size() {
      return (
        sdk.sizes.get(this.uri) ??
        (this.name.endsWith('.png')
          ? Buffer.from(sdk.contents.get(this.uri) ?? '', 'base64').length
          : (sdk.contents.get(this.uri)?.length ?? 0))
      );
    }
    create() {
      if (this.exists) throw new Error('File exists');
      sdk.contents.set(this.uri, '');
    }
    write(contents) {
      sdk.contents.set(this.uri, contents);
    }
    async text() {
      if (sdk.pendingReadback && this.name.endsWith('.pending')) return 'partial write';
      return sdk.contents.get(this.uri);
    }
    async base64() {
      await sdk.readback();
      return sdk.contents.get(this.uri);
    }
    /** @returns {ReturnType<import('expo-file-system').File['move']>} */
    async move(destination) {
      await sdk.move();
      const contents = sdk.contents.get(this.uri);
      sdk.contents.delete(this.uri);
      sdk.contents.set(destination.uri, contents);
      this.uri = destination.uri;
    }
    delete() {
      sdk.deleted.push(this.uri);
      if (sdk.pruneFailure && this.name.endsWith('.json')) throw new Error('Cannot prune');
      sdk.contents.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: 'document', cache: 'cache' } };
});
vi.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: async (uri, base64) => {
    await sdk.write(uri, base64);
    sdk.contents.set(uri, base64);
  },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: sdk.available, shareAsync: sdk.share }));

const PNG = rgbaPng(2, 2, 255).toString('base64');
const RECORD = { id: 'png-1-a', filename: heldPngFilename('png-1-a'), base64: PNG };
const DIRECTORY = 'document/splotch-png-recovery-v1';
const CACHE = 'cache/splotch-png-delivery-v1';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const CACHE_TIME = 1_800_000_000_000;
let now;
const cacheFiles = () => [...sdk.contents.keys()].filter((uri) => uri.startsWith(`${CACHE}/`));

function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function owner() {
  let state;
  const changed = vi.fn((next) => {
    state = next;
  });
  return {
    recovery: createPngRecovery(pngRecoveryPlatform.storage, pngRecoveryPlatform.deliver, changed),
    state: () => state,
    changed,
  };
}

beforeEach(() => {
  now = CACHE_TIME;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  sdk.contents.clear();
  sdk.sizes.clear();
  sdk.directories.clear();
  sdk.deleted.length = 0;
  sdk.cacheDeletionFailure = false;
  sdk.pendingReadback = false;
  sdk.pruneFailure = false;
  sdk.write.mockReset().mockResolvedValue(undefined);
  sdk.readback.mockReset().mockResolvedValue(undefined);
  sdk.available.mockReset().mockResolvedValue(true);
  sdk.share.mockReset().mockResolvedValue(undefined);
  sdk.move.mockReset().mockResolvedValue(undefined);
});

describe('actual native PNG recovery adapter boundary', () => {
  it('waits for a verified archive move before delivery and uses exact stable cache bytes and filename', async () => {
    const gate = deferred();
    const entered = deferred();
    sdk.move.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    sdk.share.mockImplementationOnce(async (uri) => {
      expect(sdk.contents.get(uri)).toBe(PNG);
    });
    const held = owner();
    const pending = held.recovery.submit(PNG);
    await entered.promise;
    expect(sdk.write).not.toHaveBeenCalled();
    expect(sdk.share).not.toHaveBeenCalled();
    gate.resolve();
    await pending;
    const archive = JSON.parse(await pngRecoveryPlatform.storage.read());
    const record = archive.pictures[0];
    expect(record.base64).toBe(PNG);
    const cacheUri = sdk.share.mock.calls[0][0];
    expect(cacheUri).toMatch(new RegExp(`^${CACHE}/attempt-\\d+-\\d+/${record.filename}$`));
    expect(sdk.share).toHaveBeenCalledWith(cacheUri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Save your picture',
    });
    expect(held.state().pictures[0].attempt.status).toBe('sharing-closed');
    expect(archive.pictures).toHaveLength(1);
    expect(cacheFiles()).toHaveLength(1);
  });

  it.each(['write', 'readback', 'available'])(
    'cancels late sharing after %s preparation when a record is dismissed or the owner is replaced',
    async (phase) => {
      for (const interruption of ['dismiss', 'unmount', 'successor']) {
        sdk.contents.clear();
        sdk.share.mockClear();
        const gate = deferred();
        const entered = deferred();
        sdk[phase].mockImplementationOnce(() => {
          entered.resolve();
          return gate.promise;
        });
        const held = owner();
        const pending = held.recovery.submit(PNG);
        await entered.promise;
        let successor;
        if (interruption === 'dismiss') await held.recovery.dismiss(held.state().pictures[0].id);
        else {
          held.recovery.dispose();
          if (interruption === 'successor') {
            successor = owner();
            await successor.recovery.restore();
          }
        }
        expect(successor?.state().pictures.length ?? null).toBe(
          interruption === 'successor' ? 1 : null
        );
        const updates = held.changed.mock.calls.length;
        gate.resolve(true);
        await pending;
        expect(sdk.share, `${phase}/${interruption}`).not.toHaveBeenCalled();
        expect(held.state().pictures).toHaveLength(interruption === 'dismiss' ? 0 : 1);
        expect(held.changed).toHaveBeenCalledTimes(updates + (interruption === 'dismiss' ? 1 : 0));
        successor?.recovery.dispose();
      }
    }
  );

  it('keeps the tombstone authoritative over an old revision and an interrupted pending file', async () => {
    sdk.contents.set(`${DIRECTORY}/archive-1.json`, serializeHeldPngs([RECORD]));
    sdk.contents.set(`${DIRECTORY}/archive-2.pending`, 'partial JSON');
    sdk.pruneFailure = true;
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([]));
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([]));
    expect(sdk.contents.has(`${DIRECTORY}/archive-1.json`)).toBe(true);
    const restored = owner();
    await restored.recovery.restore();
    expect(restored.state().pictures).toEqual([]);
    expect(sdk.share).not.toHaveBeenCalled();
  });

  it('fails incomplete archive readback without deleting a published record', async () => {
    sdk.contents.set(`${DIRECTORY}/archive-1.json`, serializeHeldPngs([RECORD]));
    sdk.pendingReadback = true;
    await expect(pngRecoveryPlatform.storage.write(serializeHeldPngs([]))).rejects.toThrow(
      'incomplete'
    );
    expect(sdk.deleted).toContain(`${DIRECTORY}/archive-2.pending`);
    expect(sdk.deleted).not.toContain(`${DIRECTORY}/archive-1.json`);
    expect(await pngRecoveryPlatform.storage.read()).toBe(serializeHeldPngs([RECORD]));
  });

  it('bounds journal growth when old revisions cannot be pruned and can recover after deletion works', async () => {
    sdk.pruneFailure = true;
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([RECORD]));
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([RECORD]));
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([]));
    await expect(pngRecoveryPlatform.storage.write(serializeHeldPngs([]))).rejects.toThrow(
      'Cannot prune'
    );
    expect([...sdk.contents.keys()].filter((name) => name.endsWith('.json'))).toHaveLength(3);
    expect(JSON.parse(await pngRecoveryPlatform.storage.read()).pictures).toEqual([]);
    sdk.pruneFailure = false;
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([]));
    expect([...sdk.contents.keys()].filter((name) => name.endsWith('.json'))).toHaveLength(2);
  });

  it('ignores completion from an already-open system sheet after explicit dismissal', async () => {
    const gate = deferred();
    const entered = deferred();
    sdk.share.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const held = owner();
    const pending = held.recovery.submit(PNG);
    await entered.promise;
    await held.recovery.dismiss(held.state().pictures[0].id);
    gate.resolve();
    await pending;
    expect(held.state().pictures).toEqual([]);
    expect(held.state().notice).toBe('');
    expect(JSON.parse(await pngRecoveryPlatform.storage.read()).pictures).toEqual([]);
    expect(cacheFiles()).toHaveLength(1);
  });

  it('never prunes an active successor file after expiry when the predecessor sheet settles for the same PNG', async () => {
    const first = deferred();
    const firstEntered = deferred();
    const second = deferred();
    const secondEntered = deferred();
    sdk.share
      .mockImplementationOnce(() => {
        firstEntered.resolve();
        return first.promise;
      })
      .mockImplementationOnce(() => {
        secondEntered.resolve();
        return second.promise;
      });
    const predecessor = owner();
    const oldExport = predecessor.recovery.submit(PNG);
    await firstEntered.promise;
    predecessor.recovery.dispose();
    const successor = owner();
    await successor.recovery.restore();
    const retry = successor.recovery.retry();
    await secondEntered.promise;
    const [oldUri, newUri] = sdk.share.mock.calls.map(([uri]) => uri);
    expect(oldUri).not.toBe(newUri);
    expect(oldUri.split('/').at(-1)).toBe(newUri.split('/').at(-1));
    now += RETENTION_MS;
    await pngRecoveryPlatform.deliver(RECORD, () => true);
    expect(sdk.contents.get(oldUri)).toBe(PNG);
    expect(sdk.contents.get(newUri)).toBe(PNG);
    first.resolve();
    await oldExport;
    expect(sdk.contents.get(newUri)).toBe(PNG);
    second.resolve();
    await retry;
    expect(cacheFiles()).toHaveLength(3);
    expect(successor.state().pictures[0].attempt.status).toBe('sharing-closed');
  });

  it('retains offered files across repeated export and dismissal beyond the held-record limit', async () => {
    const held = owner();
    for (let attempt = 0; attempt < 5; attempt++) {
      await held.recovery.submit(PNG);
      await held.recovery.dismiss(held.state().pictures[0].id);
      expect(cacheFiles()).toHaveLength(attempt + 1);
      expect(held.state().pictures).toEqual([]);
    }
    expect(sdk.share).toHaveBeenCalledTimes(5);
    expect(sdk.deleted.filter((uri) => uri.startsWith(CACHE))).toEqual([]);
  });

  it('starts retention at offer time after very delayed preparation, across restart and a fresh allocation', async () => {
    const gate = deferred();
    const entered = deferred();
    sdk.available.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const pending = pngRecoveryPlatform.deliver(RECORD, () => true);
    await entered.promise;
    now += RETENTION_MS * 2;
    gate.resolve(true);
    await pending;
    const offeredUri = sdk.share.mock.calls[0][0];
    vi.resetModules();
    const { pngRecoveryPlatform: restarted } =
      await import('../../experiments/native-architecture/src/platform/pngRecovery.ts');
    await restarted.deliver(RECORD, () => true);
    expect(sdk.contents.get(offeredUri)).toBe(PNG);
    now += RETENTION_MS - 1;
    await restarted.deliver(RECORD, () => true);
    expect(sdk.contents.get(offeredUri)).toBe(PNG);
    now++;
    await restarted.deliver(RECORD, () => true);
    expect(sdk.contents.has(offeredUri)).toBe(false);
  });

  it('reports expired-cache cleanup failure and refuses another allocation until cleanup works', async () => {
    const expired = `${CACHE}/attempt-${CACHE_TIME - RETENTION_MS}-9000`;
    sdk.directories.add(expired);
    sdk.contents.set(`${expired}/${RECORD.filename}`, PNG);
    sdk.cacheDeletionFailure = true;
    const held = owner();
    await held.recovery.submit(PNG);
    expect(held.state().pictures[0].attempt).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('cache could not be cleared'),
    });
    expect(cacheFiles()).toHaveLength(1);
    expect(sdk.write).not.toHaveBeenCalled();
    await held.recovery.retry();
    expect(sdk.write).not.toHaveBeenCalled();
    sdk.cacheDeletionFailure = false;
    await held.recovery.retry();
    expect(sdk.deleted).toContain(expired);
    expect(sdk.share).toHaveBeenCalledOnce();
    expect(cacheFiles()).toHaveLength(1);
  });

  it('retains chooser cancellation and failure files while pre-share failures can clear immediately', async () => {
    sdk.share.mockRejectedValueOnce(new Error('Chooser failed'));
    await expect(pngRecoveryPlatform.deliver(RECORD, () => true)).rejects.toThrow('Chooser failed');
    expect(cacheFiles()).toHaveLength(1);
    sdk.available.mockResolvedValueOnce(false);
    await expect(pngRecoveryPlatform.deliver(RECORD, () => true)).rejects.toThrow('unavailable');
    expect(cacheFiles()).toHaveLength(1);
    await pngRecoveryPlatform.deliver(RECORD, () => true);
    expect(cacheFiles()).toHaveLength(2);
  });

  it('refuses a thirty-third retained attempt, keeps eligible files, then prunes only at the age boundary', async () => {
    for (let attempt = 0; attempt < 32; attempt++)
      await pngRecoveryPlatform.deliver(RECORD, () => true);
    expect(cacheFiles()).toHaveLength(32);
    now += RETENTION_MS - 1;
    await expect(pngRecoveryPlatform.deliver(RECORD, () => true)).rejects.toThrow(
      'storage is full'
    );
    expect(cacheFiles()).toHaveLength(32);
    expect(sdk.deleted.filter((uri) => uri.startsWith(CACHE))).toEqual([]);
    now++;
    await pngRecoveryPlatform.deliver(RECORD, () => true);
    expect(cacheFiles()).toHaveLength(1);
    expect(sdk.share).toHaveBeenCalledTimes(33);
  });

  it('enforces total retained PNG bytes even below the attempt-count limit', async () => {
    const retained = `${CACHE}/attempt-${CACHE_TIME}-9000`;
    sdk.directories.add(retained);
    const uri = `${retained}/${RECORD.filename}`;
    sdk.contents.set(uri, PNG);
    sdk.sizes.set(uri, 24 * 1024 * 1024);
    await expect(pngRecoveryPlatform.deliver(RECORD, () => true)).rejects.toThrow(
      'storage is full'
    );
    expect(sdk.contents.get(uri)).toBe(PNG);
    expect(sdk.write).not.toHaveBeenCalled();
    now += RETENTION_MS;
    await pngRecoveryPlatform.deliver(RECORD, () => true);
    expect(sdk.deleted).toContain(retained);
    expect(cacheFiles()).toHaveLength(1);
  });

  it('honors recent interrupted files across restart while clearing only expired attempts', async () => {
    const recent = `${CACHE}/attempt-${CACHE_TIME}-9000`;
    const expired = `${CACHE}/attempt-${CACHE_TIME - RETENTION_MS}-9001`;
    for (const directory of [recent, expired]) {
      sdk.directories.add(directory);
      sdk.contents.set(`${directory}/${RECORD.filename}`, PNG);
    }
    vi.resetModules();
    const { pngRecoveryPlatform: restarted } =
      await import('../../experiments/native-architecture/src/platform/pngRecovery.ts');
    await restarted.deliver(RECORD, () => true);
    expect(sdk.deleted).toContain(expired);
    expect(sdk.deleted).not.toContain(recent);
    expect(sdk.contents.get(`${recent}/${RECORD.filename}`)).toBe(PNG);
    expect(cacheFiles()).toHaveLength(2);
  });
});
