import { rgbaPng } from './native-png-fixtures.mjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AI_IMAGE_DECODE_TIMEOUT_MS } from '../../experiments/native-architecture/src/ai/imageBounds.ts';
const fixture = vi.hoisted(() => ({
  files: new Map(),
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
it('publishes checked recovery journals and result files and refuses missing retained results', async () => {
  await aiStorage.write(journal);
  expect(await aiStorage.read()).toEqual(journal);
  const bytes = rgbaPng(2, 2, 255);
  const result = await aiStorage.retain(1, bytes, 'image/png');
  await aiStorage.write({ ...journal, phase: 'result', result });
  expect((await aiStorage.read()).result).toEqual(result);
  expect(await aiStorage.pictures()).toEqual([result]);
  fixture.files.delete(result.uri);
  await expect(aiStorage.read()).rejects.toThrow('missing');
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
