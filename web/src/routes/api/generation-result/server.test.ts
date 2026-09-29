// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { completeFreeGeneration, failFreeGeneration } from '$lib/server/freeGenerationGrants';
import type {
  discardJob,
  GenerationJobContext,
  readJob,
  readJobImage,
} from '$lib/server/generationJobs';
import type { rateLimit } from '$lib/server/rateLimit';
import type { issueReportToken } from '$lib/server/reportToken';

// Typed against the functions they replace, so a changed server result shape
// fails type-check here instead of these tests feeding the route a stale one.
const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn<typeof rateLimit>(),
  readJob: vi.fn<typeof readJob>(),
  discardJob: vi.fn<typeof discardJob>(),
  readJobImage: vi.fn<typeof readJobImage>(),
  completeFreeGeneration: vi.fn<typeof completeFreeGeneration>(),
  failFreeGeneration: vi.fn<typeof failFreeGeneration>(),
  issueReportToken: vi.fn<typeof issueReportToken>(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit: mocks.rateLimit }));
// The id-shape check stays real, so the malformed-id cases below exercise the
// validator that sits beside the code minting ids.
vi.mock('$lib/server/generationJobs', async (importOriginal) => ({
  isJobId: (await importOriginal<typeof import('$lib/server/generationJobs')>()).isJobId,
  readJob: mocks.readJob,
  discardJob: mocks.discardJob,
  readJobImage: mocks.readJobImage,
}));
vi.mock('$lib/server/freeGenerationGrants', () => ({
  completeFreeGeneration: mocks.completeFreeGeneration,
  failFreeGeneration: mocks.failFreeGeneration,
}));
vi.mock('$lib/server/reportToken', () => ({ issueReportToken: mocks.issueReportToken }));

import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '$lib/apiHeaders';
import { GENERATION_UNAVAILABLE_CODE, SAFETY_REFUSAL_STATUS } from '$lib/ai/generationResult';
import { GET } from './+server';

const jobId = 'a'.repeat(64);
const installationId = 'c'.repeat(64);
const reservationId = 'reservation-1';
const freeContext: GenerationJobContext = {
  free: { installationId, reservationId },
  style: 'Crayon',
};
const paidContext: GenerationJobContext = { free: null, style: null };
const pictureBytes = new Uint8Array([137, 80, 78, 71]);

async function stickerPng(subject: boolean): Promise<Buffer> {
  const background = sharp({
    create: { width: 64, height: 64, channels: 3, background: '#f604f9' },
  });
  if (!subject) return background.png().toBuffer();
  const sticker = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  return background
    .composite([{ input: sticker, left: 16, top: 16 }])
    .png()
    .toBuffer();
}

function get(headers: Record<string, string> = {}, job = jobId) {
  const request = new Request(
    `http://localhost/api/generation-result?job=${encodeURIComponent(job)}`,
    { headers }
  );
  return GET({
    request,
    url: new URL(request.url),
    getClientAddress: () => '198.51.100.2',
  } as unknown as Parameters<typeof GET>[0]);
}

function expectNothingSettled() {
  expect(mocks.completeFreeGeneration).not.toHaveBeenCalled();
  expect(mocks.failFreeGeneration).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockReturnValue({ limited: false, retryAfter: 0 });
  mocks.readJob.mockResolvedValue({
    status: 'refusal',
    reason: 'IMAGE_SAFETY',
    context: paidContext,
  });
  mocks.discardJob.mockResolvedValue(undefined);
  mocks.readJobImage.mockResolvedValue(pictureBytes);
  mocks.completeFreeGeneration.mockResolvedValue({ remaining: 7 });
  mocks.failFreeGeneration.mockResolvedValue(undefined);
  mocks.issueReportToken.mockReturnValue('signed-report-token');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/generation-result', () => {
  it('keys a collected Sticker image before returning and settling it', async () => {
    mocks.readJob.mockResolvedValue({
      status: 'image',
      mimeType: 'image/png',
      context: { ...freeContext, style: 'Sticker' },
    });
    mocks.readJobImage.mockResolvedValue(await stickerPng(true));

    const response = await get();
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(response.status).toBe(200);
    expect(data[3]).toBe(0);
    expect(data[(32 * info.width + 32) * info.channels + 3]).toBe(255);
    expect(mocks.completeFreeGeneration).toHaveBeenCalledExactlyOnceWith(
      installationId,
      reservationId
    );
  });

  it('rejects a blank collected Sticker image without spending its reservation', async () => {
    mocks.readJob.mockResolvedValue({
      status: 'image',
      mimeType: 'image/png',
      context: { ...freeContext, style: 'Sticker' },
    });
    mocks.readJobImage.mockResolvedValue(await stickerPng(false));

    const response = await get();

    expect(response.status).toBe(502);
    expect(mocks.failFreeGeneration).toHaveBeenCalledExactlyOnceWith(
      installationId,
      'upstream',
      reservationId
    );
    expect(mocks.completeFreeGeneration).not.toHaveBeenCalled();
    expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
  });

  it('returns the shared safety refusal status for a background result', async () => {
    const response = await get({ [API_KEY_HEADER]: 'parent-key' });

    expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
    expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('signed-report-token');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Drawing was blocked for safety: IMAGE_SAFETY',
    });
    expect(mocks.discardJob).toHaveBeenCalledWith(jobId);
    expect(mocks.issueReportToken).toHaveBeenCalledWith(
      { kind: 'byok', credential: 'parent-key' },
      { kind: 'false-positive-refusal', refusalReason: 'IMAGE_SAFETY' }
    );
  });

  it('answers 429 before reading any job once the caller is throttled', async () => {
    mocks.rateLimit.mockReturnValue({ limited: true, retryAfter: 12 });

    const response = await get();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(mocks.readJob).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['uppercase hex', 'A'.repeat(64)],
    ['non-hex', 'g'.repeat(64)],
    ['a path', `../${'a'.repeat(61)}`],
    ['a blob key suffix', `${'a'.repeat(64)}/status.json`],
  ])('rejects a job id that is %s without a store lookup', async (_label, job) => {
    const response = await get({}, job);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'Unknown generation' });
    expect(mocks.readJob).not.toHaveBeenCalled();
    expect(mocks.discardJob).not.toHaveBeenCalled();
  });

  it('answers 202 with no body while the job is pending, settling and discarding nothing', async () => {
    mocks.readJob.mockResolvedValue({ status: 'pending', context: freeContext });

    const response = await get();

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expectNothingSettled();
    expect(mocks.discardJob).not.toHaveBeenCalled();
  });

  it('answers the retryable unavailable code when the job store cannot be read', async () => {
    mocks.readJob.mockResolvedValue({ status: 'unavailable' });

    const response = await get();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: GENERATION_UNAVAILABLE_CODE,
    });
    expectNothingSettled();
    expect(mocks.discardJob).not.toHaveBeenCalled();
  });

  it('discards an expired or unknown job and answers 404 without settling anything', async () => {
    mocks.readJob.mockResolvedValue({ status: 'expired' });

    const response = await get();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'That creation is no longer available',
    });
    expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
    expectNothingSettled();
  });

  describe('a free-tier job', () => {
    it('charges the reservation exactly once when the picture is collected', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/webp',
        context: freeContext,
      });

      const response = await get();

      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(pictureBytes);
      expect(response.headers.get('Content-Type')).toBe('image/webp');
      expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBe('7');
      expect(mocks.completeFreeGeneration).toHaveBeenCalledExactlyOnceWith(
        installationId,
        reservationId
      );
      expect(mocks.failFreeGeneration).not.toHaveBeenCalled();
    });

    it('reads the picture before it settles, and settles before it discards', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/png',
        context: freeContext,
      });

      await get();

      const [read] = mocks.readJobImage.mock.invocationCallOrder;
      const [settle] = mocks.completeFreeGeneration.mock.invocationCallOrder;
      const [discard] = mocks.discardJob.mock.invocationCallOrder;
      expect(read).toBeLessThan(settle);
      expect(settle).toBeLessThan(discard);
    });

    it('mints the picture report token off the job, not a header the poll could forge', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/png',
        context: freeContext,
      });

      const response = await get({ [INSTALLATION_ID_HEADER]: 'd'.repeat(64) });

      expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('signed-report-token');
      expect(mocks.issueReportToken).toHaveBeenCalledExactlyOnceWith({
        kind: 'free',
        credential: installationId,
      });
    });

    it('releases the reservation as a safety failure on a refusal', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'refusal',
        reason: 'IMAGE_SAFETY',
        context: freeContext,
      });

      const response = await get();

      expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
      expect(mocks.failFreeGeneration).toHaveBeenCalledExactlyOnceWith(
        installationId,
        'safety',
        reservationId
      );
      expect(mocks.completeFreeGeneration).not.toHaveBeenCalled();
      expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
      expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('signed-report-token');
      expect(mocks.issueReportToken).toHaveBeenCalledWith(
        { kind: 'free', credential: installationId },
        { kind: 'false-positive-refusal', refusalReason: 'IMAGE_SAFETY' }
      );
    });

    it('releases the reservation as an upstream failure on an error, with no report token', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'error',
        reason: 'The model did not answer',
        context: freeContext,
      });

      const response = await get();

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'The model did not answer',
      });
      expect(mocks.failFreeGeneration).toHaveBeenCalledExactlyOnceWith(
        installationId,
        'upstream',
        reservationId
      );
      expect(mocks.completeFreeGeneration).not.toHaveBeenCalled();
      expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
      expect(mocks.issueReportToken).not.toHaveBeenCalled();
    });

    it('still hands over a finished picture when the ledger cannot record it', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/png',
        context: freeContext,
      });
      mocks.completeFreeGeneration.mockRejectedValue(
        new Error('Free generation reservation expired')
      );

      const response = await get();

      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(pictureBytes);
      expect(response.headers.has(FREE_GENERATIONS_REMAINING_HEADER)).toBe(false);
      expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
      expect(warn).toHaveBeenCalledWith(
        '[generation-result] failed to record the settled generation:',
        'Free generation reservation expired'
      );
    });

    it.each([
      ['refusal', SAFETY_REFUSAL_STATUS, { status: 'refusal', reason: 'IMAGE_SAFETY' } as const],
      ['error', 502, { status: 'error', reason: 'upstream' } as const],
    ])(
      'still answers the %s and discards the job when the release cannot be recorded',
      async (_label, status, outcome) => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        mocks.readJob.mockResolvedValue({ ...outcome, context: freeContext });
        mocks.failFreeGeneration.mockRejectedValue(new Error('Free generation grant is busy'));

        const response = await get();

        expect(response.status).toBe(status);
        expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
      }
    );

    it('neither settles nor discards when the picture cannot be read, so the next poll can collect it', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/png',
        context: freeContext,
      });
      mocks.readJobImage.mockRejectedValue(new Error('blob store timeout'));

      const response = await get();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ code: GENERATION_UNAVAILABLE_CODE });
      expectNothingSettled();
      expect(mocks.discardJob).not.toHaveBeenCalled();
    });

    it('neither settles nor discards when the picture bytes are gone', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/png',
        context: freeContext,
      });
      mocks.readJobImage.mockResolvedValue(null);

      const response = await get();

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'That creation could not be collected',
      });
      expectNothingSettled();
      expect(mocks.discardJob).not.toHaveBeenCalled();
    });
  });

  describe('a job with no free reservation', () => {
    it('hands over the picture without touching the ledger or minting a picture token', async () => {
      mocks.readJob.mockResolvedValue({
        status: 'image',
        mimeType: 'image/png',
        context: paidContext,
      });

      const response = await get({ [ACCESS_TOKEN_HEADER]: 'daycare-club' });

      expect(response.status).toBe(200);
      expect(response.headers.has(FREE_GENERATIONS_REMAINING_HEADER)).toBe(false);
      expect(response.headers.has(REPORT_TOKEN_HEADER)).toBe(false);
      expect(mocks.issueReportToken).not.toHaveBeenCalled();
      expectNothingSettled();
      expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
    });

    it.each([
      ['refusal', { status: 'refusal', reason: 'IMAGE_SAFETY' } as const],
      ['error', { status: 'error', reason: 'upstream' } as const],
    ])('settles nothing on a %s', async (_label, outcome) => {
      mocks.readJob.mockResolvedValue({ ...outcome, context: paidContext });

      await get({ [API_KEY_HEADER]: 'parent-key' });

      expectNothingSettled();
      expect(mocks.discardJob).toHaveBeenCalledExactlyOnceWith(jobId);
    });

    it.each([
      [
        'an API key over an access token',
        { [API_KEY_HEADER]: ' parent-key ', [ACCESS_TOKEN_HEADER]: 'daycare-club' },
        { kind: 'byok', credential: 'parent-key' },
      ],
      [
        'an access token over an installation id',
        { [ACCESS_TOKEN_HEADER]: 'daycare-club', [INSTALLATION_ID_HEADER]: installationId },
        { kind: 'managed', credential: 'daycare-club' },
      ],
    ])('binds a refusal report token to %s', async (_label, headers, binding) => {
      await get(headers);

      expect(mocks.issueReportToken).toHaveBeenCalledWith(binding, {
        kind: 'false-positive-refusal',
        refusalReason: 'IMAGE_SAFETY',
      });
    });

    // A free token is the whole proof /api/report-image asks of the free tier,
    // and nothing checked this header: the job id authorized the poll, and the
    // job was not a free one.
    it.each([
      ['no credential', {}],
      ['only an installation id nobody checked', { [INSTALLATION_ID_HEADER]: installationId }],
    ])(
      'sends a refusal without a report token when the poll carries %s',
      async (_label, headers) => {
        const response = await get(headers);

        expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
        expect(response.headers.has(REPORT_TOKEN_HEADER)).toBe(false);
        expect(mocks.issueReportToken).not.toHaveBeenCalled();
      }
    );

    it('omits the report token header when no token can be minted', async () => {
      mocks.issueReportToken.mockReturnValue(null);

      const response = await get({ [API_KEY_HEADER]: 'parent-key' });

      expect(response.headers.has(REPORT_TOKEN_HEADER)).toBe(false);
    });
  });
});
