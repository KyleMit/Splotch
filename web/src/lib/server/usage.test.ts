// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));

import { recordTokenUsage, getUsage, type TokenUsage } from './usage';

const usageOf = (count: number): TokenUsage => ({
  count,
  firstUsed: '2026-01-01T00:00:00.000Z',
  lastUsed: '2026-06-01T00:00:00.000Z',
  lastStyle: 'crayon',
  lastPrompt: 'a cat',
});

function makeStore() {
  return {
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    setJSON: vi.fn().mockResolvedValue({ modified: true, etag: 'new' }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recordTokenUsage', () => {
  it('creates the first tally with onlyIfNew so a concurrent first write cannot be lost', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue(null);
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage('tok', { style: 'crayon', prompt: 'a cat' });

    expect(store.setJSON).toHaveBeenCalledTimes(1);
    const [key, value, condition] = store.setJSON.mock.calls[0];
    expect(key).toBe('tok');
    expect(value).toMatchObject({ count: 1, lastStyle: 'crayon', lastPrompt: 'a cat' });
    expect(value.firstUsed).toBe(value.lastUsed);
    expect(condition).toEqual({ onlyIfNew: true });
  });

  it('increments an existing tally with onlyIfMatch on the etag it read', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue({ data: usageOf(4), etag: 'v4', metadata: {} });
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage('tok', { style: null, prompt: 'a dog' });

    const [, value, condition] = store.setJSON.mock.calls[0];
    expect(value).toMatchObject({
      count: 5,
      firstUsed: '2026-01-01T00:00:00.000Z',
      lastStyle: null,
      lastPrompt: 'a dog',
    });
    expect(condition).toEqual({ onlyIfMatch: 'v4' });
  });

  it('retries a conflicting write against the freshly read value', async () => {
    const store = makeStore();
    store.getWithMetadata
      .mockResolvedValueOnce({ data: usageOf(4), etag: 'v4', metadata: {} })
      .mockResolvedValueOnce({ data: usageOf(5), etag: 'v5', metadata: {} });
    store.setJSON
      .mockResolvedValueOnce({ modified: false })
      .mockResolvedValueOnce({ modified: true, etag: 'v6' });
    getStoreMock.mockReturnValue(store);

    await recordTokenUsage('tok', { style: null, prompt: 'a dog' });

    expect(store.setJSON).toHaveBeenCalledTimes(2);
    const [, value, condition] = store.setJSON.mock.calls[1];
    expect(value.count).toBe(6);
    expect(condition).toEqual({ onlyIfMatch: 'v5' });
  });

  it('concedes after repeated conflicts without throwing', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue({ data: usageOf(4), etag: 'v4', metadata: {} });
    store.setJSON.mockResolvedValue({ modified: false });
    getStoreMock.mockReturnValue(store);

    await expect(recordTokenUsage('tok', { style: null, prompt: 'p' })).resolves.toBeUndefined();
    expect(store.setJSON).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('conceded'));
  });

  it('never throws when Blobs is unavailable', async () => {
    getStoreMock.mockImplementation(() => {
      throw new Error('MissingBlobsEnvironment');
    });

    await expect(recordTokenUsage('tok', { style: null, prompt: 'p' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('never throws when the write fails', async () => {
    const store = makeStore();
    store.getWithMetadata.mockResolvedValue(null);
    store.setJSON.mockRejectedValue(new Error('boom'));
    getStoreMock.mockReturnValue(store);

    await expect(recordTokenUsage('tok', { style: null, prompt: 'p' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      '[ai-usage] failed to persist usage to Netlify Blobs:',
      'boom'
    );
  });
});

describe('getUsage', () => {
  it('maps tokens to their usage and omits tokens with none recorded', async () => {
    const store = makeStore();
    store.get.mockImplementation(async (key: string) => (key === 'used' ? usageOf(2) : null));
    getStoreMock.mockReturnValue(store);

    expect(await getUsage(['used', 'unused'])).toEqual({ used: usageOf(2) });
  });

  it('omits entries whose stored value is malformed', async () => {
    const store = makeStore();
    store.get.mockResolvedValue({ count: 'not-a-number' });
    getStoreMock.mockReturnValue(store);

    expect(await getUsage(['tok'])).toEqual({});
  });

  it('returns an empty map when Blobs is unavailable', async () => {
    getStoreMock.mockImplementation(() => {
      throw new Error('MissingBlobsEnvironment');
    });

    expect(await getUsage(['tok'])).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('drops only the failing token when a single read rejects', async () => {
    const store = makeStore();
    store.get.mockImplementation(async (key: string) => {
      if (key === 'bad') throw new Error('read failed');
      return usageOf(1);
    });
    getStoreMock.mockReturnValue(store);

    expect(await getUsage(['good', 'bad'])).toEqual({ good: usageOf(1) });
  });
});
