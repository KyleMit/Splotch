// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { AiImageProvider } from '$lib/server/ai/provider';
import type {
  completeFreeGeneration,
  failFreeGeneration,
  reserveDailyFreeGeneration,
  reserveFreeGeneration,
} from '$lib/server/freeGenerationGrants';
import type { authorizeGenerationRequest } from '$lib/server/generationAuthorization';
import type {
  clientAcceptsBackgroundGeneration,
  freeSettlement,
  startBackgroundGeneration,
} from '$lib/server/generationStart';
import type { issueReportToken } from '$lib/server/reportToken';
import type { recordByokUsage, recordTokenUsage } from '$lib/server/usage';

// Typed against the functions they replace, so a changed server result shape
// fails type-check here instead of these tests feeding the route a stale one.
const mocks = vi.hoisted(() => ({
  authorize: vi.fn<typeof authorizeGenerationRequest>(),
  reserveGrant: vi.fn<typeof reserveFreeGeneration>(),
  reserveDaily: vi.fn<typeof reserveDailyFreeGeneration>(),
  failGrant: vi.fn<typeof failFreeGeneration>(),
  completeGrant: vi.fn<typeof completeFreeGeneration>(),
  generateImage: vi.fn<AiImageProvider['generateImage']>(),
  issueReportToken: vi.fn<typeof issueReportToken>(),
  recordByokUsage: vi.fn<typeof recordByokUsage>(),
  recordTokenUsage: vi.fn<typeof recordTokenUsage>(),
  acceptsBackground: vi.fn<typeof clientAcceptsBackgroundGeneration>(),
  freeSettlement: vi.fn<typeof freeSettlement>(),
  startBackground: vi.fn<typeof startBackgroundGeneration>(),
}));

vi.mock('$lib/server/generationAuthorization', () => ({
  authorizeGenerationRequest: mocks.authorize,
}));
vi.mock('$lib/server/freeGenerationGrants', () => ({
  reserveFreeGeneration: mocks.reserveGrant,
  reserveDailyFreeGeneration: mocks.reserveDaily,
  failFreeGeneration: mocks.failGrant,
  completeFreeGeneration: mocks.completeGrant,
}));
vi.mock('$lib/server/ai/provider', () => ({
  aiProvider: { generateImage: mocks.generateImage },
}));
vi.mock('$lib/server/usage', () => ({
  recordByokUsage: mocks.recordByokUsage,
  recordTokenUsage: mocks.recordTokenUsage,
}));
vi.mock('$lib/server/generationStart', () => ({
  clientAcceptsBackgroundGeneration: mocks.acceptsBackground,
  freeSettlement: mocks.freeSettlement,
  startBackgroundGeneration: mocks.startBackground,
  synchronousDeadlineMs: () => 1_000,
}));
vi.mock('$lib/server/reportToken', () => ({
  issueReportToken: mocks.issueReportToken,
}));

import { FREE_GENERATIONS_REMAINING_HEADER, REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
import { GENERATION_ACCEPTED_STATUS, SAFETY_REFUSAL_STATUS } from '$lib/ai/generationResult';
import { FREE_GRANT_EXHAUSTED_CODE } from '$lib/freeGenerations';
import { POST } from './+server';

function handle(request: Request) {
  return POST({
    request,
    url: new URL(request.url),
    getClientAddress: () => '198.51.100.1',
    platform: undefined,
  } as unknown as Parameters<typeof POST>[0]);
}

function post(style?: string) {
  const url = new URL('http://localhost/api/generate-image');
  if (style !== undefined) url.searchParams.set('style', style);
  return handle(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array([1]),
    })
  );
}

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    authorized: true,
    kind: 'free',
    effectiveKey: 'project-key',
    installationId: 'a'.repeat(64),
  });
  mocks.reserveGrant.mockResolvedValue({ reserved: true, reservationId: 'reservation-1' });
  mocks.reserveDaily.mockResolvedValue({ reserved: false, remaining: 0 });
  mocks.failGrant.mockResolvedValue(undefined);
  mocks.issueReportToken.mockReturnValue('signed-report-token');
  mocks.acceptsBackground.mockReturnValue(false);
  mocks.startBackground.mockResolvedValue(null);
  mocks.recordTokenUsage.mockResolvedValue(undefined);
});

describe('POST /api/generate-image', () => {
  it('keys a live Sticker image before delivery and charges the free creation', async () => {
    mocks.reserveDaily.mockResolvedValue({ reserved: true, remaining: 400 });
    mocks.completeGrant.mockResolvedValue({ remaining: 9 });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: (await stickerPng(true)).toString('base64'),
      mimeType: 'image/png',
    });

    const response = await post('Sticker');
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(data[3]).toBe(0);
    expect(data[(32 * info.width + 32) * info.channels + 3]).toBe(255);
    expect(mocks.completeGrant).toHaveBeenCalledExactlyOnceWith('a'.repeat(64), 'reservation-1');
  });

  it('rejects a blank Sticker image and releases the free creation', async () => {
    mocks.reserveDaily.mockResolvedValue({ reserved: true, remaining: 400 });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: (await stickerPng(false)).toString('base64'),
      mimeType: 'image/png',
    });

    const response = await post('Sticker');

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'The sticker picture could not be used. Please try again.',
    });
    expect(mocks.failGrant).toHaveBeenCalledExactlyOnceWith(
      'a'.repeat(64),
      'upstream',
      'reservation-1'
    );
    expect(mocks.completeGrant).not.toHaveBeenCalled();
  });

  it('keeps the legacy multipart request contract', async () => {
    mocks.authorize.mockResolvedValue({
      authorized: true,
      kind: 'managed',
      effectiveKey: 'project-key',
      managedToken: 'daycare-club',
    });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: Buffer.from('generated').toString('base64'),
      mimeType: 'image/png',
    });
    const body = new FormData();
    body.set('token', 'daycare-club');
    body.set('style', 'Felt');
    body.set('image', new Blob(['drawing'], { type: 'image/png' }));

    const response = await handle(
      new Request('http://localhost/api/generate-image', { method: 'POST', body })
    );

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith({
      apiKey: null,
      token: 'daycare-club',
      installationId: null,
      clientAddress: '198.51.100.1',
    });
    expect(mocks.generateImage).toHaveBeenCalledWith({
      apiKey: 'project-key',
      image: { bytes: Buffer.from('drawing'), mimeType: 'image/png' },
      prompt: expect.any(String),
      deadlineMs: 1_000,
    });
  });

  it('rejects an oversized legacy multipart envelope before authorization', async () => {
    const boundary = 'splotch-test-boundary';
    const body = [
      `--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\ndaycare-club\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="drawing.png"\r\nContent-Type: image/png\r\n\r\ndrawing\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="unused"\r\n\r\n`,
      'x'.repeat(16 * 1024 * 1024),
      `\r\n--${boundary}--\r\n`,
    ].join('');

    const response = await handle(
      new Request('http://localhost/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      })
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: 'Image is too large' });
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it('rejects a malformed legacy multipart envelope before authorization', async () => {
    const response = await handle(
      new Request('http://localhost/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: 'not a multipart envelope',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Expected multipart form data',
    });
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, string>]>([
    ['no Content-Type', {}],
    ['an empty Content-Type', { 'Content-Type': '' }],
    ['a disallowed Content-Type', { 'Content-Type': 'image/gif' }],
  ])('refuses a raw image body with %s before reserving a creation', async (_label, headers) => {
    const response = await handle(
      new Request('http://localhost/api/generate-image', {
        method: 'POST',
        headers,
        body: new Uint8Array([1]),
      })
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ ok: false, error: 'Unsupported image type' });
    expect(mocks.reserveGrant).not.toHaveBeenCalled();
    expect(mocks.startBackground).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it('refuses a legacy multipart image part with an empty type', async () => {
    const boundary = 'splotch-test-boundary';
    const body = [
      `--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\ndaycare-club\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="drawing.png"\r\nContent-Type: \r\n\r\ndrawing\r\n`,
      `--${boundary}--\r\n`,
    ].join('');
    const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
    const parsedImage = (await new Response(body, { headers }).formData()).get('image');
    expect(parsedImage instanceof Blob && parsedImage.type).toBe('');

    const response = await handle(
      new Request('http://localhost/api/generate-image', { method: 'POST', headers, body })
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ ok: false, error: 'Unsupported image type' });
    expect(mocks.reserveGrant).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  // The code is what sends a parent to BYOK setup, and a used-up grant costs
  // nothing: no provider call, no daily-ceiling spend, and no failure booked
  // against a slot it never reserved.
  it('answers a used-up free grant 403 before spending anything', async () => {
    mocks.reserveGrant.mockResolvedValue({ reserved: false, remaining: 0 });

    const response = await post();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: FREE_GRANT_EXHAUSTED_CODE,
      error: expect.any(String),
      remaining: 0,
    });
    expect(mocks.reserveDaily).not.toHaveBeenCalled();
    expect(mocks.failGrant).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.startBackground).not.toHaveBeenCalled();
  });

  it('routes the daily ceiling to setup and records its own failure kind', async () => {
    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'FREE_DAILY_LIMIT_EXHAUSTED',
      error: 'Free creations are unavailable today. Add your own OpenAI key to keep creating.',
    });
    expect(mocks.failGrant).toHaveBeenCalledWith('a'.repeat(64), 'daily-limit', 'reservation-1');
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it('still delivers the image when the allowance ledger cannot be updated', async () => {
    mocks.reserveDaily.mockResolvedValue({ reserved: true, remaining: 400 });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: Buffer.from('generated').toString('base64'),
      mimeType: 'image/png',
    });
    mocks.completeGrant.mockRejectedValue(new Error('Free generation grant is busy'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBeNull();
    await expect(response.text()).resolves.toBe('generated');
    expect(mocks.failGrant).not.toHaveBeenCalled();
  });

  it('returns a report token with a free-tier safety refusal without retaining the drawing', async () => {
    mocks.reserveDaily.mockResolvedValue({ reserved: true, remaining: 400 });
    mocks.generateImage.mockResolvedValue({ kind: 'refusal', reason: 'IMAGE_SAFETY' });

    const response = await post();

    expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
    expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('signed-report-token');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Drawing was blocked for safety: IMAGE_SAFETY',
    });
    expect(mocks.failGrant).toHaveBeenCalledWith('a'.repeat(64), 'safety', 'reservation-1');
    expect(mocks.completeGrant).not.toHaveBeenCalled();
    expect(mocks.issueReportToken).toHaveBeenCalledWith(
      { kind: 'free', credential: 'a'.repeat(64) },
      { kind: 'false-positive-refusal', refusalReason: 'IMAGE_SAFETY' }
    );
  });

  it.each([
    {
      kind: 'managed' as const,
      effectiveKey: 'project-key',
      managedToken: 'daycare-club',
      binding: { kind: 'managed', credential: 'daycare-club' },
    },
    {
      kind: 'byok' as const,
      effectiveKey: 'parent-key',
      binding: { kind: 'byok', credential: 'parent-key' },
    },
  ])('returns a signed refusal context for $kind generation', async (authorization) => {
    mocks.authorize.mockResolvedValue({ authorized: true, ...authorization });
    mocks.generateImage.mockResolvedValue({ kind: 'refusal', reason: 'PROHIBITED_CONTENT' });

    const response = await post();

    expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
    expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('signed-report-token');
    expect(mocks.issueReportToken).toHaveBeenCalledWith(authorization.binding, {
      kind: 'false-positive-refusal',
      refusalReason: 'PROHIBITED_CONTENT',
    });
    expect(mocks.recordTokenUsage.mock.calls).toEqual(
      authorization.kind === 'managed'
        ? [['daycare-club', { style: null, outcome: 'refused' }]]
        : []
    );
    expect(mocks.recordByokUsage.mock.calls).toEqual(
      authorization.kind === 'byok' ? [[null, 'refused']] : []
    );
  });

  it('records a managed success with only normalized style and outcome categories', async () => {
    mocks.authorize.mockResolvedValue({
      authorized: true,
      kind: 'managed',
      effectiveKey: 'project-key',
      managedToken: 'daycare-club',
    });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: Buffer.from('generated').toString('base64'),
      mimeType: 'image/png',
    });

    const response = await post('Felt');

    expect(response.status).toBe(200);
    expect(mocks.recordTokenUsage).toHaveBeenCalledWith('daycare-club', {
      style: 'Felt',
      outcome: 'succeeded',
    });
  });

  it('records a provider error as failed without retaining its message', async () => {
    mocks.authorize.mockResolvedValue({
      authorized: true,
      kind: 'managed',
      effectiveKey: 'project-key',
      managedToken: 'daycare-club',
    });
    mocks.generateImage.mockResolvedValue({ kind: 'error', reason: 'provider detail' });

    const response = await post('Crayon');

    expect(response.status).toBe(502);
    expect(mocks.recordTokenUsage).toHaveBeenCalledWith('daycare-club', {
      style: 'Crayon',
      outcome: 'failed',
    });
    expect(JSON.stringify(mocks.recordTokenUsage.mock.calls)).not.toContain('provider detail');
  });

  it('records a handed-off background generation as accepted', async () => {
    mocks.authorize.mockResolvedValue({
      authorized: true,
      kind: 'managed',
      effectiveKey: 'project-key',
      managedToken: 'daycare-club',
    });
    mocks.acceptsBackground.mockReturnValue(true);
    mocks.startBackground.mockResolvedValue({ jobId: 'job-1', pollAfterMs: 4_000 });
    const bufferToString = vi.spyOn(Buffer.prototype, 'toString');

    try {
      const response = await post('Paper');

      expect(response.status).toBe(GENERATION_ACCEPTED_STATUS);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        jobId: 'job-1',
        pollAfterMs: 4_000,
      });
      expect(bufferToString.mock.calls.filter(([encoding]) => encoding === 'base64')).toHaveLength(
        0
      );
    } finally {
      bufferToString.mockRestore();
    }
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.recordTokenUsage).toHaveBeenCalledWith('daycare-club', {
      style: 'Paper',
      outcome: 'accepted',
    });
  });

  // The provider seam takes bytes, so the synchronous fallback hands the
  // validated input straight through. The drawing is up to MAX_IMAGE_BYTES and
  // this path runs inside the function whose deadline ladder (ADR-0063) exists
  // because it is tight on time and memory, so a round trip through base64 and
  // back is worth pinning at zero rather than at "once".
  it('hands the validated input to the provider without re-encoding it', async () => {
    const generatedData = Buffer.from('generated').toString('base64');
    mocks.authorize.mockResolvedValue({
      authorized: true,
      kind: 'managed',
      effectiveKey: 'project-key',
      managedToken: 'daycare-club',
    });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: generatedData,
      mimeType: 'image/png',
    });
    mocks.acceptsBackground.mockReturnValue(true);
    const bufferToString = vi.spyOn(Buffer.prototype, 'toString');

    try {
      const response = await post();

      expect(response.status).toBe(200);
      expect(bufferToString.mock.calls.filter(([encoding]) => encoding === 'base64')).toHaveLength(
        0
      );
    } finally {
      bufferToString.mockRestore();
    }
    expect(mocks.generateImage).toHaveBeenCalledWith({
      apiKey: 'project-key',
      image: { bytes: Buffer.from('AQ==', 'base64'), mimeType: 'image/png' },
      prompt: expect.any(String),
      deadlineMs: 1_000,
    });
  });
});
