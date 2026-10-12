import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '$lib/storageKeys';

const storage = vi.hoisted(() => ({ readString: vi.fn(), writeString: vi.fn() }));
vi.mock('$lib/storage', () => storage);

async function freshModule() {
  vi.resetModules();
  return (await import('./webInstallationId')).webInstallationId;
}

beforeEach(() => {
  storage.readString.mockReset().mockReturnValue(null);
  storage.writeString.mockReset();
});

describe('webInstallationId', () => {
  it('returns the id the seam already holds', async () => {
    storage.readString.mockReturnValue('stored-id');

    expect(await (await freshModule())()).toBe('stored-id');
    expect(storage.writeString).not.toHaveBeenCalled();
  });

  it('persists a new id through the seam under its declared key', async () => {
    const created = await (await freshModule())();

    expect(storage.writeString).toHaveBeenCalledWith(
      STORAGE_KEYS.freeGenerationInstallation,
      created
    );
  });

  // A refused write is the whole point of the held value: without it every page load derives a
  // new identity and draws a fresh free-generation grant with it.
  it('keeps one identity for the session when the write is refused', async () => {
    const build = await freshModule();

    const first = build();
    const second = build();

    expect(second).toBe(first);
    expect(storage.writeString).toHaveBeenCalledOnce();
  });
});
