// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AttemptCasHarness,
  ATTEMPT_TEST_INPUT,
  ATTEMPT_TEST_TIME_MS,
} from './generationAttemptsTestHarness';
import { RECOVERY_PROTOCOL } from '../../src/lib/ai/generationAttempt';
import { attemptDigest } from './generationAttemptRecord';
import {
  putImmutableAttemptBlob,
  attemptBlobMetadata,
  readAttemptBlob,
  createNetlifyAttemptStorage,
  GENERATION_ATTEMPT_STORE_NAME,
} from './generationAttemptStorage';

const mocks = vi.hoisted(() => ({
  getStore: vi.fn(),
  sdk: { getWithMetadata: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn() },
}));
vi.mock('@netlify/blobs', () => ({ getStore: mocks.getStore }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStore.mockReturnValue(mocks.sdk);
});
describe('immutable attempt blobs', () => {
  it('uses real only-if-new semantics and recovers a lost immutable-byte write reply', async () => {
    const storage = new AttemptCasHarness();
    const id = 'a'.repeat(64);
    const key = `${id}/input`;
    const metadata = attemptBlobMetadata(id, ATTEMPT_TEST_TIME_MS, ATTEMPT_TEST_INPUT);
    storage.nextWriteFaults.set(key, 'after');
    await expect(
      putImmutableAttemptBlob(storage, key, ATTEMPT_TEST_INPUT, metadata)
    ).resolves.toBeUndefined();
    await expect(
      putImmutableAttemptBlob(storage, key, ATTEMPT_TEST_INPUT, metadata)
    ).resolves.toBeUndefined();
    const changed = new Uint8Array([9, 9, 9, 9]);
    await expect(
      putImmutableAttemptBlob(
        storage,
        key,
        changed,
        attemptBlobMetadata(id, ATTEMPT_TEST_TIME_MS, changed)
      )
    ).rejects.toMatchObject({ code: 'RECOVERY_CONFLICT' });
    expect(storage.entries.get(key)?.bytes).toEqual(ATTEMPT_TEST_INPUT);
  });
  it('never blindly retries an unknown failed byte write', async () => {
    const storage = new AttemptCasHarness();
    const id = 'a'.repeat(64);
    const key = `${id}/raw`;
    storage.nextWriteFaults.set(key, 'before');
    await expect(
      putImmutableAttemptBlob(
        storage,
        key,
        ATTEMPT_TEST_INPUT,
        attemptBlobMetadata(id, ATTEMPT_TEST_TIME_MS, ATTEMPT_TEST_INPUT)
      )
    ).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' });
    expect(storage.operations.filter((entry) => entry === `write:${key}`)).toHaveLength(1);
  });
  it('requires a nonempty ETag on bytes as well as state', async () => {
    const storage = new AttemptCasHarness();
    const id = 'a'.repeat(64);
    const key = `${id}/raw`;
    storage.replace(
      key,
      ATTEMPT_TEST_INPUT,
      attemptBlobMetadata(id, ATTEMPT_TEST_TIME_MS, ATTEMPT_TEST_INPUT)
    );
    storage.missingEtags.add(key);
    await expect(readAttemptBlob(storage, key, 100)).rejects.toMatchObject({
      code: 'RECOVERY_UNAVAILABLE',
    });
  });
  it('validates immutable metadata and content digests', async () => {
    const storage = new AttemptCasHarness();
    const id = 'a'.repeat(64);
    const key = `${id}/raw`;
    storage.replace(key, ATTEMPT_TEST_INPUT, {
      protocol: RECOVERY_PROTOCOL,
      id,
      expiresAt: ATTEMPT_TEST_TIME_MS,
      digest: attemptDigest('different bytes'),
    });
    await expect(readAttemptBlob(storage, key, 100)).rejects.toMatchObject({
      code: 'RECOVERY_UNAVAILABLE',
    });
  });
});
describe('production Netlify adapter', () => {
  it('selects only the isolated strongly consistent store and preserves every condition', async () => {
    mocks.sdk.getWithMetadata.mockResolvedValue(null);
    mocks.sdk.set.mockResolvedValue({ modified: true });
    const adapter = createNetlifyAttemptStorage();
    await adapter.read('a/record');
    const metadata = attemptBlobMetadata('a'.repeat(64), ATTEMPT_TEST_TIME_MS, ATTEMPT_TEST_INPUT);
    await adapter.write('a/input', ATTEMPT_TEST_INPUT, metadata, { onlyIfNew: true });
    await adapter.write('a/record', ATTEMPT_TEST_INPUT, metadata, { onlyIfMatch: 'required-etag' });
    expect(mocks.getStore).toHaveBeenCalledWith({
      name: GENERATION_ATTEMPT_STORE_NAME,
      consistency: 'strong',
    });
    expect(mocks.sdk.set).toHaveBeenNthCalledWith(1, 'a/input', expect.any(ArrayBuffer), {
      onlyIfNew: true,
      metadata,
    });
    expect(mocks.sdk.set).toHaveBeenNthCalledWith(2, 'a/record', expect.any(ArrayBuffer), {
      onlyIfMatch: 'required-etag',
      metadata,
    });
  });
  it.each([undefined, '', '   '])(
    'rejects an existing SDK record with missing ETag %s',
    async (etag) => {
      mocks.sdk.getWithMetadata.mockResolvedValue({
        data: ATTEMPT_TEST_INPUT.buffer,
        metadata: {},
        etag,
      });
      await expect(createNetlifyAttemptStorage().read('a/record')).rejects.toMatchObject({
        code: 'RECOVERY_UNAVAILABLE',
      });
    }
  );
});
