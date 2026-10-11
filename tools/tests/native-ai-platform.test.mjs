import { rgbaPng } from './native-png-fixtures.mjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AI_IMAGE_DECODE_TIMEOUT_MS } from '../../experiments/native-architecture/src/ai/imageBounds.ts';
const fixture = vi.hoisted(() => ({
  files: new Map(),
  storage: vi.fn(),
  decode: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
  id: vi.fn(),
}));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('react-native', () => ({
  NativeModules: {
    SplotchAIEnvironment: {
      installationId: fixture.id,
      aiStorage: fixture.storage,
      decodeImage: fixture.decode,
      readCredential: fixture.read,
      writeCredential: fixture.write,
      removeCredential: fixture.remove,
    },
  },
}));
vi.mock('expo-file-system', () => {
  function uri(parts) {
    return parts
      .map((part) =>
        typeof part === 'string' ? part.replace(/\/$/, '') : part.uri.replace(/\/$/, '')
      )
      .join('/');
  }
  class File {
    constructor(...parts) {
      this.uri = uri(parts);
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return fixture.files.has(this.uri);
    }
    get size() {
      return fixture.files.get(this.uri)?.length ?? 0;
    }
    create() {
      if (this.exists) throw new Error('Exists');
      fixture.files.set(this.uri, new Uint8Array());
    }
    write(value) {
      fixture.files.set(
        this.uri,
        typeof value === 'string' ? new TextEncoder().encode(value) : value.slice()
      );
    }
    async text() {
      return new TextDecoder().decode(fixture.files.get(this.uri));
    }
    async bytes() {
      return fixture.files.get(this.uri).slice();
    }
    async move(destination) {
      fixture.files.set(destination.uri, fixture.files.get(this.uri));
      fixture.files.delete(this.uri);
      this.uri = destination.uri;
    }
    delete() {
      fixture.files.delete(this.uri);
    }
  }
  class Directory {
    constructor(...parts) {
      this.uri = uri(parts) + '/';
    }
    get exists() {
      return [...fixture.files.keys()].some((path) => path.startsWith(this.uri));
    }
    create() {}
    list() {
      return [...fixture.files.keys()]
        .filter((path) => path.startsWith(this.uri))
        .map((path) => new File(path));
    }
  }
  return { Directory, File, Paths: { document: 'file:///owned/' } };
});
import {
  aiVault,
  aiStorage,
  admitAiImage,
} from '../../experiments/native-architecture/src/platform/ai.ts';
const journal = {
  version: 1,
  id: 1,
  createdAt: 1,
  style: 'Magical',
  originalId: 'picture-1-fixture',
  phase: 'sent',
  jobId: null,
  result: null,
};
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  fixture.files.clear();
  vi.resetAllMocks();
  fixture.decode.mockImplementation(async (_, __, width, height) => ({ width, height }));
  fixture.id.mockResolvedValue('a'.repeat(64));
  fixture.read.mockResolvedValue(null);
  fixture.storage.mockImplementation(async (kind) =>
    JSON.stringify(kind === 'pictures' ? { pictures: [] } : { receipt: null })
  );
});
it('uses strict native secure readback for writes and removals, with no fallback on an ambiguous outcome', async () => {
  fixture.write.mockResolvedValue(true);
  await expect(aiVault.write('byok', 'fixture-key')).rejects.toThrow('not confirmed');
  fixture.read.mockResolvedValue('fixture-key');
  await aiVault.write('byok', 'fixture-key');
  expect(fixture.write).toHaveBeenCalledWith('gemini-api-key', 'fixture-key');
  fixture.remove.mockResolvedValue(true);
  await expect(aiVault.remove('byok')).rejects.toThrow('not confirmed');
  fixture.read.mockResolvedValue(null);
  await aiVault.remove('byok');
  fixture.read.mockRejectedValue(new Error('locked'));
  await expect(aiVault.read('managed')).rejects.toThrow('locked');
  fixture.id.mockResolvedValue('raw-platform-id');
  await expect(aiVault.installationId()).rejects.toThrow('unavailable');
  expect(fixture.files.size).toBe(0);
});
const originalModel = JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] });
function committed(journal, revision = 1) {
  return {
    journal,
    revision,
    nonce: 'c'.repeat(64),
    originalDigest: 'd'.repeat(64),
    inputDigest: 'e'.repeat(64),
  };
}
it('requires a native preparation receipt and preserves exact original and upload bytes before later revisions', async () => {
  const bytes = rgbaPng(2, 2, 255);
  let current = null;
  fixture.storage.mockImplementation(async (kind, raw) => {
    const value = JSON.parse(raw);
    if (kind === 'prepare') {
      current = committed(value.journal);
    } else if (kind === 'write') {
      current = committed(value.journal, current.revision + 1);
    } else if (kind === 'retain') {
      const result = { uri: 'file:///owned/native/result.bin', mime: value.mime };
      fixture.files.set(result.uri, bytes);
      current = committed({ ...current.journal, phase: 'result', result }, current.revision + 1);
    }
    return JSON.stringify(
      kind === 'pictures' ? { pictures: [current.journal.result] } : { receipt: current }
    );
  });
  const exactModel = '  ' + originalModel + '\n';
  await aiStorage.prepare(journal, exactModel, bytes);
  const prepared = JSON.parse(fixture.storage.mock.calls.at(-1)[1]);
  expect(prepared.originalModel).toBe(exactModel);
  expect(Buffer.from(prepared.upload, 'base64')).toEqual(Buffer.from(bytes));
  expect(await aiStorage.read()).toEqual(journal);
  const result = await aiStorage.retain(1, bytes, 'image/png');
  expect(JSON.parse(fixture.storage.mock.calls.at(-1)[1])).toMatchObject({
    id: 1,
    nonce: 'c'.repeat(64),
    revision: 1,
  });
  await aiStorage.write({ ...journal, phase: 'result', result });
  expect((await aiStorage.read()).result).toEqual(result);
  expect(await aiStorage.pictures()).toEqual([result]);
  fixture.files.delete(result.uri);
  await expect(aiStorage.read()).rejects.toThrow('missing');
});
it('refuses unconfirmed native storage without publishing through Expo', async () => {
  fixture.storage.mockRejectedValue(new Error('directory fsync failed'));
  await expect(
    aiStorage.prepare({ ...journal, id: 22 }, originalModel, rgbaPng(2, 2, 255))
  ).rejects.toThrow('fsync');
  expect(fixture.files.size).toBe(0);
  fixture.storage.mockResolvedValue(
    JSON.stringify({ receipt: { ...committed({ ...journal, id: 22 }), revision: 0 } })
  );
  await expect(
    aiStorage.prepare({ ...journal, id: 22 }, originalModel, rgbaPng(2, 2, 255))
  ).rejects.toThrow('not confirmed');
  expect(fixture.files.size).toBe(0);
});
it('rejects an escaped legacy result before any image decode or retention', async () => {
  const outside = 'file:///outside/synthetic-picture.png';
  fixture.files.set(outside, rgbaPng(2, 2, 255));
  const saved = {
    ...journal,
    id: 70,
    phase: 'result',
    result: { uri: outside, mime: 'image/png' },
  };
  fixture.files.set(
    'file:///owned/splotch-ai-pictures-v1/journal-70.json',
    new TextEncoder().encode(JSON.stringify(saved))
  );
  await expect(aiStorage.read()).rejects.toThrow('outside its owned gallery');
  expect(fixture.decode).not.toHaveBeenCalled();
  expect(fixture.files.has(outside)).toBe(true);
});
it('imports an existing unresolved ticket and original with absent upload metadata', async () => {
  const saved = { ...journal, id: 77, phase: 'pending', jobId: 'b'.repeat(64) };
  fixture.files.set(
    'file:///owned/splotch-ai-pictures-v1/journal-77.json',
    new TextEncoder().encode(JSON.stringify(saved))
  );
  fixture.files.set(
    'file:///owned/splotch-pictures/picture-1-fixture.json',
    new TextEncoder().encode(originalModel)
  );
  fixture.storage.mockImplementation(async (kind, raw) =>
    JSON.stringify({
      receipt:
        kind === 'read' ? null : { ...committed(JSON.parse(raw).journal), inputDigest: null },
    })
  );
  expect(await aiStorage.read()).toEqual(saved);
  expect(fixture.storage.mock.calls.map(([kind]) => kind)).toEqual(['read', 'importLegacy']);
  expect(JSON.parse(fixture.storage.mock.calls[1][1])).toEqual({ journal: saved, originalModel });
});
it('requires actual bounded native decode agreement before result publication and refuses older unsafe gallery bytes', async () => {
  const bytes = rgbaPng(2, 2, 255);
  fixture.decode.mockResolvedValue({ width: 2, height: 3 });
  await expect(aiStorage.retain(2, bytes, 'image/png')).rejects.toThrow();
  expect(fixture.files.size).toBe(0);
  fixture.decode.mockRejectedValue(new Error('invalid native bitstream'));
  await expect(admitAiImage(bytes, 'image/png')).rejects.toThrow('bitstream');
  expect(fixture.files.size).toBe(0);
  fixture.decode.mockResolvedValue({ width: 2, height: 2, unexpected: true });
  await expect(admitAiImage(bytes, 'image/png')).rejects.toThrow();
  const path = 'file:///owned/splotch-ai-pictures-v1/result-3.png';
  fixture.files.set(path, Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10));
  await expect(aiStorage.pictures()).rejects.toThrow();
  expect(fixture.files.has(path)).toBe(true);
});

it('fails closed when the native decoder never answers and does not publish a file', async () => {
  vi.useFakeTimers();
  fixture.decode.mockImplementation(() => new Promise(() => {}));
  const outcome = aiStorage.retain(4, rgbaPng(2, 2, 255), 'image/png');
  await Promise.all([
    expect(outcome).rejects.toThrow('did not finish'),
    vi.advanceTimersByTimeAsync(AI_IMAGE_DECODE_TIMEOUT_MS),
  ]);
  expect(fixture.files.size).toBe(0);
});
