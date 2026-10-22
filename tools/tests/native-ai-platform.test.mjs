import { rgbaPng } from './native-png-fixtures.mjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fetch as nativeFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { AI_IMAGE_DECODE_TIMEOUT_MS } from '../../src/ai/imageBounds.ts';
const fixture = vi.hoisted(() => ({
  files: new Map(),
  storage: vi.fn(),
  decode: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  pin: vi.fn(),
  referenced: vi.fn(),
  remove: vi.fn(),
  id: vi.fn(),
}));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {
    SplotchAIEnvironment: {
      installationId: fixture.id,
      aiStorage: fixture.storage,
      decodeImage: fixture.decode,
      readCredential: fixture.read,
      writeCredential: fixture.write,
      writeReferencedCredential: fixture.write,
      pinCredentialReference: fixture.pin,
      readReferencedCredential: fixture.referenced,
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
    async write(value) {
      // Expo SDK 58's write() is asynchronous: the bytes land after it returns.
      await Promise.resolve();
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
import { aiVault, aiStorage, admitAiImage, aiTransport } from '../../src/platform/ai.ts';
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
beforeEach(async () => {
  fixture.files.clear();
  vi.resetAllMocks();
  fixture.decode.mockImplementation(async (_, __, width, height) => ({ width, height }));
  fixture.id.mockResolvedValue('a'.repeat(64));
  fixture.read.mockResolvedValue(null);
  fixture.pin.mockResolvedValue('b'.repeat(64));
  fixture.referenced.mockResolvedValue('fixture-key');
  fixture.storage.mockImplementation(async (kind) =>
    JSON.stringify(kind === 'pictures' ? { pictures: [] } : { receipt: null })
  );
  await aiStorage.read();
  fixture.storage.mockClear();
});
it.each([
  ['ios', 'capacitor://localhost'],
  ['android', 'https://localhost'],
])('sends the shipping trusted Origin on %s AI reports', async (platform, origin) => {
  Platform.OS = platform;
  const policy = await readFile(
    new URL('../../netlify/securityPolicy.ts', import.meta.url),
    'utf8'
  );
  const trusted = policy.match(/CSRF_TRUSTED_ORIGINS: readonly string\[\] = \[([^\]]+)\]/)[1];
  expect(trusted).toContain(`'${origin}'`);
  await aiTransport(
    { path: '/api/report-image', method: 'POST', headers: { 'X-Report-Token': 'proof' } },
    new AbortController().signal
  );
  expect(nativeFetch.mock.calls.at(-1)[1].headers).toEqual({
    Origin: origin,
    'X-Report-Token': 'proof',
  });
});
it('resolves an absent iOS secure value as null, as Android does', async () => {
  const native = new URL('../../', import.meta.url);
  const swift = await readFile(new URL('ios/Splotch/SplotchAIEnvironment.swift', native), 'utf8');
  const kotlin = await readFile(
    new URL('android/app/src/main/java/art/splotch/app/SplotchAIEnvironment.kt', native),
    'utf8'
  );
  expect(swift).toContain('do { resolve(try operation() ?? NSNull()) }');
  expect(kotlin).toContain('promise.resolve(operation())');
  fixture.read.mockResolvedValue(undefined);
  await expect(aiVault.read('byok')).rejects.toThrow('could not be read');
  fixture.read.mockResolvedValue(null);
  await expect(aiVault.read('byok')).resolves.toBeNull();
});
it('uploads the drawing bytes without building a React Native Blob', async () => {
  // React Native's BlobManager.createFromParts throws on ArrayBuffer and ArrayBufferView parts.
  class ReactNativeBlob {
    constructor(parts = []) {
      if (parts.some((part) => part instanceof ArrayBuffer || ArrayBuffer.isView(part)))
        throw new Error(
          "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"
        );
    }
  }
  vi.stubGlobal('Blob', ReactNativeBlob);
  try {
    const body = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x57, 0x45, 0x42, 0x50]);
    await aiTransport(
      {
        path: '/api/generate-image',
        method: 'POST',
        headers: { 'Content-Type': 'image/webp' },
        body,
      },
      new AbortController().signal
    );
    const init = nativeFetch.mock.calls.at(-1)[1];
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect([...init.body]).toEqual([...body]);
    expect(init.headers['Content-Type']).toBe('image/webp');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('uses strict native secure readback for writes and removals, with no fallback on an ambiguous outcome', async () => {
  fixture.write.mockResolvedValue(true);
  await expect(aiVault.write('byok', 'fixture-key')).rejects.toThrow('not confirmed');
  fixture.read.mockResolvedValue('fixture-key');
  fixture.write.mockResolvedValue('b'.repeat(64));
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
    kind: 'prepared',
    journal,
    revision,
    originalRevision: 1,
    inputLength: rgbaPng(2, 2, 255).length,
    resultDigest: journal.result ? 'f'.repeat(64) : null,
    resultLength: journal.result ? rgbaPng(2, 2, 255).length : null,
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
    if (kind === 'readPreparedUpload')
      return JSON.stringify({ receipt: current, upload: Buffer.from(bytes).toString('base64') });
    return JSON.stringify(
      kind === 'pictures' ? { pictures: [current.journal.result] } : { receipt: current }
    );
  });
  const exactModel = '  ' + originalModel + '\n';
  const receipt = await aiStorage.prepare(journal, exactModel, bytes);
  const prepared = JSON.parse(fixture.storage.mock.calls.at(-1)[1]);
  expect(prepared.originalModel).toBe(exactModel);
  expect(Buffer.from(prepared.upload, 'base64')).toEqual(Buffer.from(bytes));
  expect(Object.isFrozen(receipt)).toBe(true);
  expect(Object.isFrozen(receipt.journal)).toBe(true);
  const pinned = await aiStorage.readPreparedUpload(receipt);
  expect(pinned).toBeInstanceOf(Uint8Array);
  expect(pinned).toEqual(new Uint8Array(bytes));
  expect((await aiStorage.read()).receipt.journal).toEqual(journal);
  const retained = await aiStorage.retain(1, bytes, 'image/png');
  expect(JSON.parse(fixture.storage.mock.calls.at(-1)[1])).toMatchObject({
    id: 1,
    nonce: 'c'.repeat(64),
    revision: 1,
  });
  const result = retained.picture;
  expect(retained.receipt.resultDigest).toBe('f'.repeat(64));
  await aiStorage.write({ ...journal, phase: 'result', result });
  expect((await aiStorage.read()).receipt.journal.result).toEqual(result);
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
  fixture.storage.mockResolvedValue(JSON.stringify({ receipt: null }));
  await aiStorage.read();
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
        kind === 'read'
          ? null
          : {
              ...committed(JSON.parse(raw).journal),
              kind: 'imported',
              inputDigest: null,
              inputLength: null,
            },
    })
  );
  const imported = await aiStorage.read();
  expect(imported.receipt.kind).toBe('imported');
  expect(imported.receipt.journal).toEqual(saved);
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

it('passes the original capture budget to native decoding without widening remote-result admission', async () => {
  const width = 2564;
  const height = 2048;
  const bytes = rgbaPng(width, height, 255);
  await admitAiImage(bytes, 'image/png', 'original');
  expect(fixture.decode).toHaveBeenLastCalledWith(
    expect.any(String),
    'image/png',
    width,
    height,
    'original'
  );
  fixture.decode.mockClear();
  await expect(admitAiImage(bytes, 'image/png')).rejects.toThrow();
  expect(fixture.decode).not.toHaveBeenCalled();
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

it('rejects a copied receipt and changed pinned bytes before returning any upload', async () => {
  const next = { ...journal, id: 101 };
  const bytes = rgbaPng(2, 2, 255);
  fixture.storage.mockResolvedValue(JSON.stringify({ receipt: committed(next) }));
  const receipt = await aiStorage.prepare(next, originalModel, bytes);
  await expect(aiStorage.readPreparedUpload({ ...receipt })).rejects.toThrow('stale');
  expect(fixture.storage).toHaveBeenCalledTimes(1);
  fixture.storage.mockResolvedValue(JSON.stringify({ receipt: committed(next) }));
  await aiStorage.read();
  const fresh = (await aiStorage.read()).receipt;
  fixture.storage.mockResolvedValue(JSON.stringify({ receipt: committed(next), upload: 'AQ==' }));
  await expect(aiStorage.readPreparedUpload(fresh)).rejects.toThrow('bytes changed');
});
it('serializes a mutation behind native readback and blocks mutation after ambiguity', async () => {
  const next = { ...journal, id: 102 };
  let release;
  fixture.storage.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const reading = aiStorage.read();
  const preparing = aiStorage.prepare(next, originalModel, rgbaPng(2, 2, 255));
  await vi.waitFor(() => expect(fixture.storage).toHaveBeenCalledOnce());
  fixture.storage.mockRejectedValue(new Error('unknown native completion'));
  release(JSON.stringify({ receipt: null }));
  await reading;
  await expect(preparing).rejects.toThrow('unknown native completion');
  const before = fixture.storage.mock.calls.length;
  await expect(aiStorage.prepare(next, originalModel, rgbaPng(2, 2, 255))).rejects.toThrow(
    'Read native recovery'
  );
  expect(fixture.storage).toHaveBeenCalledTimes(before);
  fixture.storage.mockResolvedValue(JSON.stringify({ receipt: null }));
  await aiStorage.read();
});

it('rejects a changed journal at an identical native revision', async () => {
  const next = { ...journal, id: 103 };
  fixture.storage.mockResolvedValue(JSON.stringify({ receipt: committed(next) }));
  await aiStorage.prepare(next, originalModel, rgbaPng(2, 2, 255));
  fixture.storage.mockResolvedValue(
    JSON.stringify({ receipt: committed({ ...next, phase: 'unknown' }) })
  );
  await expect(aiStorage.read()).rejects.toThrow('attempt changed');
});

it('confirms the exact generation returned by the real write caller and rejects substitution or missing references', async () => {
  fixture.write.mockResolvedValue('b'.repeat(64));
  fixture.read.mockResolvedValue('fixture-key');
  fixture.referenced.mockResolvedValue('fixture-key');
  await aiVault.write('byok', 'fixture-key');
  expect(fixture.referenced).toHaveBeenCalledWith('gemini-api-key', 'b'.repeat(64));
  fixture.referenced.mockResolvedValue('different-key');
  await expect(aiVault.write('byok', 'fixture-key')).rejects.toThrow('generation');
  fixture.write.mockResolvedValue(true);
  await expect(aiVault.write('byok', 'fixture-key')).rejects.toThrow('not confirmed');
});
it('retains an opaque reference without a credential and rejects replaced, removed or unavailable generations', async () => {
  const pinned = await aiVault.pin('managed');
  expect(pinned).toEqual({ kind: 'managed', reference: 'b'.repeat(64) });
  expect(Object.isFrozen(pinned)).toBe(true);
  expect(Object.keys(pinned)).toEqual(['kind', 'reference']);
  fixture.referenced.mockResolvedValue('fixture-code');
  expect(await aiVault.readReferenced(pinned)).toEqual({ kind: 'managed', value: 'fixture-code' });
  fixture.referenced.mockRejectedValue(new Error('replaced or removed'));
  await expect(aiVault.readReferenced(pinned)).rejects.toThrow('replaced or removed');
  fixture.pin.mockRejectedValue(new Error('locked'));
  await expect(aiVault.pin('managed')).rejects.toThrow('locked');
  expect(fixture.files.size).toBe(0);
});
it('pins the free identity only through the explicit prerequisite seam and rejects a native binding mismatch', async () => {
  const pinned = await aiVault.pin('free');
  expect(fixture.pin).toHaveBeenCalledWith('free-generation-identity');
  fixture.referenced.mockResolvedValue('a'.repeat(64));
  expect(await aiVault.readReferenced(pinned)).toEqual({
    kind: 'free',
    installationId: 'a'.repeat(64),
  });
  fixture.referenced.mockRejectedValue(new Error('free identity changed'));
  await expect(aiVault.readReferenced(pinned)).rejects.toThrow('free identity changed');
  fixture.referenced.mockResolvedValue('raw-device-id');
  await expect(aiVault.readReferenced(pinned)).rejects.toThrow('binding unavailable');
});
