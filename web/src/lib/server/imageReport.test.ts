// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createIssue, deleteImageReport, saveImageReport } = vi.hoisted(() => ({
  createIssue: vi.fn(),
  deleteImageReport: vi.fn(),
  saveImageReport: vi.fn(),
}));

vi.mock('./github', () => ({ createIssue }));
vi.mock('./imageReportStore', async (original) => ({
  ...(await original<typeof import('./imageReportStore')>()),
  deleteImageReport,
  saveImageReport,
}));

import { submitImageReport } from './imageReport';

const saved = {
  reportId: 'report-id',
  keyPrefix: 'report-id/',
  keys: [
    'report-id/input.png',
    'report-id/output.png',
    'report-id/prompt.txt',
    'report-id/metadata.json',
  ],
  reportedAt: '2026-08-08T12:00:00.000Z',
  deleteAfter: '2026-09-07T12:00:00.000Z',
};

beforeEach(() => {
  createIssue.mockReset().mockResolvedValue(undefined);
  saveImageReport.mockReset().mockResolvedValue(saved);
  deleteImageReport.mockReset().mockResolvedValue(undefined);
});

describe('submitImageReport', () => {
  it('stores a closed-style report and notifies the private feedback channel with its blob key', async () => {
    const result = await submitImageReport({
      kind: null,
      drawing: new Blob(['drawing'], { type: 'image/png' }),
      output: new Blob(['output'], { type: 'image/webp' }),
      style: 'Felt',
    });

    expect(result).toEqual({ ok: true, reportId: 'report-id' });
    expect(saveImageReport).toHaveBeenCalledWith(
      expect.objectContaining({
        style: 'Felt',
        prompt: expect.stringContaining('handmade felt craft scene'),
      })
    );
    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '[AI image] Reported Felt picture',
        body: expect.stringContaining('`report-id/`'),
      })
    );
  });

  it('rejects missing images and arbitrary styles before storing anything', async () => {
    await expect(
      submitImageReport({
        kind: 'picture',
        drawing: null,
        output: new Blob(['x']),
        style: 'Anything',
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'That AI report could not be sent.',
    });
    expect(saveImageReport).not.toHaveBeenCalled();
  });

  it('categorizes a false-positive refusal and stores no generated output', async () => {
    const drawing = new Blob(['drawing'], { type: 'image/png' });

    const result = await submitImageReport({
      kind: 'false-positive-refusal',
      drawing,
      output: null,
      style: 'Felt',
    });

    expect(result).toEqual({ ok: true, reportId: 'report-id' });
    expect(saveImageReport).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'false-positive-refusal',
        input: drawing,
        output: null,
      })
    );
    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '[AI refusal] Possible false positive (Felt)',
        body: expect.stringContaining('**Category:** false-positive-refusal'),
      })
    );
  });

  it('deletes retained evidence when the private notification fails', async () => {
    createIssue.mockRejectedValue(new Error('GitHub unavailable'));

    await expect(
      submitImageReport({
        kind: 'picture',
        drawing: new Blob(['drawing'], { type: 'image/png' }),
        output: new Blob(['output'], { type: 'image/png' }),
        style: '',
      })
    ).resolves.toMatchObject({ ok: false, status: 502 });
    expect(deleteImageReport).toHaveBeenCalledWith(saved);
  });
});
