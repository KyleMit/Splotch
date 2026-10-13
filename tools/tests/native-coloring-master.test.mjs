import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { OFFLINE_BOOKS } from '../../experiments/native-architecture/src/offlineLibrary/books.generated.ts';
import { packDirectory } from '../../experiments/native-architecture/src/offlineLibrary/store.ts';
import { describe, expect, it, vi } from 'vitest';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { coloringBookHistory } from '../../experiments/native-architecture/src/settings/coloringBook.ts';
import {
  createHistory,
  emptyDrawing,
  undoDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';

const widths = { soundEnabled: false, strokeWidth: 'medium', eraserWidth: 'medium' };
const colors = { selectedColor: 'Purple', customColors: [] };
const parent = {
  aiEnabled: false,
  parentPolicies: { ai: 'always', feedback: 'always', parentCenter: 'always' },
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
function fileSnapshot(files) {
  return new Map(
    [...files].map(([path, bytes]) => [path, { bytes: bytes.length, sha256: digest(bytes) }])
  );
}
const legacy = [
  { version: 1, soundEnabled: false },
  { version: 2, ...widths },
  { version: 3, ...widths, ...colors },
  { version: 4, ...widths, ...colors, appearance: 'system' },
  { version: 5, ...widths, ...colors, appearance: 'system', ...parent },
];
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function settingsFixture() {
  let state;
  const storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
  const owner = createSoundSettings(storage, (next) => {
    state = next;
  });
  return { owner, storage, state: () => state };
}
describe('persisted Coloring Book master', () => {
  it.each(legacy)(
    'defaults old settings $version to enabled without relaxing parental protections',
    (old) => {
      expect(parseSoundSettings(JSON.stringify(old))).toMatchObject({
        version: 13,
        coloringBookEnabled: true,
        ...parent,
      });
    }
  );
  it('persists off through the existing single writer and restores it on relaunch', async () => {
    const f = settingsFixture();
    await f.owner.load();
    await f.owner.setColoringBookEnabled(false);
    const saved = f.storage.write.mock.calls[0][0];
    expect(parseSoundSettings(saved)).toMatchObject({
      version: 13,
      coloringBookEnabled: false,
      ...parent,
    });
    const next = settingsFixture();
    next.storage.read.mockResolvedValue(saved);
    await next.owner.load();
    expect(next.state()).toMatchObject({ coloringBookEnabled: false, saved: true });
    expect(next.storage.write).not.toHaveBeenCalled();
  });
  it('keeps unread settings unwritten until an explicit successful reread', async () => {
    const f = settingsFixture();
    f.storage.read.mockRejectedValueOnce(new Error('unread'));
    await f.owner.load();
    expect(f.state()).toMatchObject({ coloringBookEnabled: false, aiEnabled: false, saved: false });
    await f.owner.setColoringBookEnabled(true);
    await f.owner.retrySave();
    expect(f.storage.write).not.toHaveBeenCalled();
    f.storage.read.mockResolvedValue(JSON.stringify(legacy[4]));
    await f.owner.retryRead();
    await f.owner.setColoringBookEnabled(false);
    expect(f.storage.write).toHaveBeenCalledOnce();
    expect(parseSoundSettings(f.storage.write.mock.calls[0][0]).coloringBookEnabled).toBe(false);
  });
  it('retains the exact failed write for retry and suppresses a concurrent writer', async () => {
    const f = settingsFixture();
    await f.owner.load();
    const write = deferred();
    f.storage.write.mockReturnValueOnce(write.promise);
    const saving = f.owner.setColoringBookEnabled(false);
    await f.owner.setEnabled(true);
    expect(f.storage.write).toHaveBeenCalledOnce();
    write.resolve();
    await saving;
    f.storage.write.mockRejectedValueOnce(new Error('disk full'));
    await f.owner.setColoringBookEnabled(true);
    const exact = f.storage.write.mock.calls[1][0];
    expect(f.state()).toMatchObject({ coloringBookEnabled: true, saved: false });
    await f.owner.retrySave();
    expect(f.storage.write.mock.calls[2][0]).toBe(exact);
  });
  it('rejects a missing, nonboolean, extra or malformed new setting', async () => {
    const f = settingsFixture();
    await f.owner.load();
    await f.owner.setColoringBookEnabled(false);
    const valid = JSON.parse(f.storage.write.mock.calls[0][0]);
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...valid, coloringBookEnabled: 'false' }))
    ).toThrow();
    const { coloringBookEnabled, ...missing } = valid;
    expect(coloringBookEnabled).toBe(false);
    expect(() => parseSoundSettings(JSON.stringify(missing))).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...valid, extra: true }))).toThrow();
  });
});
describe('drawing policy at the sole history writer', () => {
  it('clears the page while preserving exact ink, rainbow and undo references', () => {
    const drawing = {
      ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 3, 'sunshine'),
      strokes: [{ brush: 'magic', rainbow: 3, width: 22, points: [{ x: 10, y: 10 }] }],
    };
    const history = { drawing, undo: [emptyDrawing(3, 'flower')] };
    const off = coloringBookHistory(history, false);
    expect(off.drawing.pageId).toBe('blank');
    expect(off.drawing.strokes).toBe(drawing.strokes);
    expect(off.drawing.rainbow).toBe(3);
    expect(off.undo).toBe(history.undo);
    expect(history.drawing.pageId).toBe('sunshine');
    expect(coloringBookHistory(history, true)).toBe(history);
  });
  it('clamps a real Undo and saved-model reopen without rewriting their originals', () => {
    const saved = JSON.stringify(emptyDrawing(4, 'flower'));
    const history = { drawing: emptyDrawing(4), undo: [parseDrawing(JSON.parse(saved))] };
    const undone = coloringBookHistory(undoDrawing(history), false);
    expect(undone.drawing.pageId).toBe('blank');
    const reopened = coloringBookHistory(createHistory(parseDrawing(JSON.parse(saved))), false);
    expect(reopened.drawing.pageId).toBe('blank');
    expect(JSON.parse(saved).pageId).toBe('flower');
    expect(undoDrawing(history).drawing.pageId).toBe('flower');
  });
});
it('fences a late transfer after master-off without changing durable auto-download policy', async () => {
  const entered = deferred();
  const finish = deferred();
  let transferSignal;
  const platform = {
    environment: async () => ({ online: true, metered: false, freeBytes: 1e9 }),
    list: async () => [],
    read: async () => null,
    write: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    uri: (path) => path,
    verify: async () => false,
    download: vi.fn(async (_path, _file, signal) => {
      transferSignal = signal;
      entered.resolve();
      await finish.promise;
    }),
    dispose() {},
  };
  const owner = createOfflineLibrary(platform, 'full');
  await owner.initialize();
  owner.engage();
  expect(platform.download).not.toHaveBeenCalled();
  owner.setFeatureEnabled(true);
  await entered.promise;
  owner.setFeatureEnabled(false);
  expect(transferSignal.aborted).toBe(true);
  expect(owner.snapshot()).toMatchObject({ enabled: true, allowMetered: false, installed: [] });
  finish.resolve();
  await owner.settled();
  expect(owner.snapshot().installed).toEqual([]);
  expect(platform.write).not.toHaveBeenCalled();
  expect(platform.move).not.toHaveBeenCalled();
  owner.dispose();
});

it('exposes all verified retained packs again without downloading or rewriting their markers', async () => {
  const files = new Map();
  const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
  for (const book of OFFLINE_BOOKS) {
    const pack = catalogPack(book.id, 'full');
    const directory = packDirectory(pack);
    files.set(`${directory}/installed.json`, encode(pack));
    files.set(`${directory}/identity.json`, encode(pack.files));
    for (const file of pack.files) {
      const content = await readFile(
        new URL(`../../web/static${file.downloadPath}`, import.meta.url)
      );
      files.set(`${directory}/files/${file.path.split('/').at(-1)}`, content);
    }
  }
  const before = fileSnapshot(files);
  const platform = {
    environment: async () => ({ online: false, metered: false, freeBytes: 1e9 }),
    list: async () => [...new Set([...files.keys()].map((path) => path.split('/')[0]))],
    read: async (path) => files.get(path) ?? null,
    verify: async (path, expected) => {
      const value = files.get(path);
      return !!value && value.length === expected.bytes && digest(value) === expected.sha256;
    },
    write: vi.fn(async (path, bytes) => {
      files.set(path, bytes);
    }),
    move: vi.fn(async (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
    }),
    remove: vi.fn(async () => {}),
    uri: (path) => path,
    download: vi.fn(async () => {
      throw new Error('Unexpected retained-pack download');
    }),
    dispose() {},
  };
  const owner = createOfflineLibrary(platform, 'full');
  owner.setFeatureEnabled(false);
  await owner.initialize();
  expect(owner.snapshot().installed.map((pack) => pack.id)).toEqual(
    OFFLINE_BOOKS.map((book) => book.id)
  );
  owner.engage();
  owner.setFeatureEnabled(true);
  await owner.settled();
  expect(owner.snapshot().installed).toHaveLength(OFFLINE_BOOKS.length);
  expect(platform.download).not.toHaveBeenCalled();
  expect(platform.write).not.toHaveBeenCalled();
  expect(platform.move).not.toHaveBeenCalled();
  expect(fileSnapshot(files)).toEqual(before);
  owner.dispose();
});

it.each([
  [
    'same-length asset corruption',
    (files) => {
      files.get('pack/files/art')[0] ^= 1;
    },
  ],
  ['added asset', (files) => files.set('pack/files/extra', new Uint8Array([4]))],
  ['removed asset', (files) => files.delete('pack/files/art')],
  ['changed installed marker', (files) => files.set('pack/installed.json', new Uint8Array([0]))],
])('detects %s in the complete retained-file snapshot', (_label, mutate) => {
  const files = new Map([
    ['pack/files/art', new Uint8Array([1, 2, 3])],
    ['pack/installed.json', new Uint8Array([4, 5])],
  ]);
  const before = fileSnapshot(files);
  mutate(files);
  expect(fileSnapshot(files)).not.toEqual(before);
});
