// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  set: vi.fn(),
  setJSON: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@netlify/blobs', () => ({ getStore: () => store }));

import {
  IMAGE_REPORT_RETENTION_DAYS,
  purgeExpiredImageReports,
  saveImageReport,
} from './imageReportStore';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
  store.set.mockReset().mockResolvedValue({ modified: true });
  store.setJSON.mockReset().mockResolvedValue({ modified: true });
  store.list.mockReset();
  store.delete.mockReset().mockResolvedValue(undefined);
});

describe('saveImageReport', () => {
  it('stores the drawing, prompt, output, and retention metadata under one report key', async () => {
    const saved = await saveImageReport({
      input: new Blob(['drawing'], { type: 'image/png' }),
      output: new Blob(['result'], { type: 'image/jpeg' }),
      prompt: 'Resolved prompt',
      style: 'Crayon',
    });

    expect(saved.keyPrefix).toMatch(/^1786190400000-[0-9a-f-]+\/$/);
    expect(saved.keys).toEqual([
      `${saved.keyPrefix}input.png`,
      `${saved.keyPrefix}output.jpg`,
      `${saved.keyPrefix}prompt.txt`,
      `${saved.keyPrefix}metadata.json`,
    ]);
    expect(saved.reportedAt).toBe('2026-08-08T12:00:00.000Z');
    expect(saved.deleteAfter).toBe('2026-09-07T12:00:00.000Z');
    expect(store.set).toHaveBeenCalledTimes(3);
    expect(store.set.mock.calls.map(([key]) => key)).toEqual([
      `${saved.keyPrefix}input.png`,
      `${saved.keyPrefix}output.jpg`,
      `${saved.keyPrefix}prompt.txt`,
    ]);
    expect(store.setJSON).toHaveBeenCalledWith(
      `${saved.keyPrefix}metadata.json`,
      {
        version: 1,
        reportedAt: saved.reportedAt,
        deleteAfter: saved.deleteAfter,
        style: 'Crayon',
        inputContentType: 'image/png',
        outputContentType: 'image/jpeg',
      },
      { onlyIfNew: true }
    );
  });
});

describe('purgeExpiredImageReports', () => {
  it('deletes every object older than the retention window and leaves newer reports alone', async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expired = `${now - (IMAGE_REPORT_RETENTION_DAYS + 1) * dayMs}-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
    const current = `${now - (IMAGE_REPORT_RETENTION_DAYS - 1) * dayMs}-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`;
    store.list.mockReturnValue(
      (async function* () {
        yield {
          blobs: [
            { key: `${expired}/input.png` },
            { key: `${expired}/metadata.json` },
            { key: `${current}/input.png` },
            { key: 'unrelated-key' },
          ],
        };
      })()
    );

    await expect(purgeExpiredImageReports()).resolves.toEqual({
      deletedBlobs: 2,
      expiredReports: 1,
    });
    expect(store.delete.mock.calls.map(([key]) => key)).toEqual([
      `${expired}/input.png`,
      `${expired}/metadata.json`,
    ]);
  });
});
