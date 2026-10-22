// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ list: vi.fn(), delete: vi.fn() }));
vi.mock('./blobs', () => ({ getStore: () => storage }));
import { purgeExpiredRecordedIssues, RECORDED_ISSUE_RETENTION_MS } from './recordedIssues';

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it.each([false, true])(
  'deletes expired and malformed recordings and reports failed deletes: %s',
  async (fail) => {
    vi.useFakeTimers();
    vi.setSystemTime(RECORDED_ISSUE_RETENTION_MS + 10);
    storage.list.mockImplementation(async function* () {
      yield { blobs: [{ key: '1-abcd' }, { key: 'broken' }, { key: `${Date.now()}-abcd` }] };
    });
    storage.delete.mockImplementation(async (key: string) => {
      if (fail && key === 'broken') throw new Error('Storage unavailable');
    });
    const result = await purgeExpiredRecordedIssues().catch((error: Error) => error.message);
    expect(result).toEqual(
      fail ? 'Recorded issue retention could not delete every expired record' : { deleted: 2 }
    );
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual(['1-abcd', 'broken']);
  }
);
