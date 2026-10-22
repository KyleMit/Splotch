// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  start: vi.fn(),
  reserve: vi.fn(),
  provider: vi.fn(),
  grant: vi.fn(),
  rate: vi.fn(),
  job: vi.fn(),
  jobImage: vi.fn(),
  discard: vi.fn(),
  verify: vi.fn(),
  code: vi.fn(),
}));
vi.mock('./ai/provider', () => ({
  aiProvider: { generateImage: fixture.provider, verifyKey: fixture.verify },
}));
vi.mock('./config', () => ({ config: { openAiApiKey: () => 'fixture-project-key' } }));
vi.mock('./rateLimit', () => ({ rateLimit: fixture.rate, peekRateLimit: fixture.rate }));
vi.mock('./generationAuthorization', () => ({
  authorizeGenerationRequest: async (input: { installationId: string }) => ({
    authorized: true,
    kind: 'free',
    effectiveKey: 'fixture-project-key',
    installationId: input.installationId,
  }),
}));
vi.mock('./freeGenerationGrants', () => ({
  reserveFreeGeneration: fixture.reserve,
  reserveDailyFreeGeneration: async () => ({ reserved: true }),
  completeFreeGeneration: async () => ({ remaining: 9 }),
  failFreeGeneration: vi.fn(),
  getDailyFreeGenerationStatus: async () => ({ available: true }),
  getFreeGenerationGrantStatus: fixture.grant,
}));
vi.mock('./usage', () => ({ recordByokUsage: vi.fn(), recordTokenUsage: vi.fn() }));
vi.mock('./generationStart', async (original) => ({
  ...(await original<typeof import('./generationStart')>()),
  startBackgroundGeneration: fixture.start,
}));
vi.mock('./generationJobs', async (original) => ({
  ...(await original<typeof import('./generationJobs')>()),
  readJob: fixture.job,
  readJobImage: fixture.jobImage,
  discardJob: fixture.discard,
}));
vi.mock('./reportToken', () => ({ issueReportToken: () => null }));
vi.mock('./tokens', () => ({ checkAccessToken: fixture.code }));
import { GET as pollHandler } from './api/generationResult';
import { POST as verifyKeyHandler } from './api/verifyKey';
import { POST as verifyCodeHandler } from './api/verifyAccessCode';
import { POST } from './api/generateImage';
import { GET } from './api/freeGenerationGrant';
import { aiTransport } from '../../src/platform/ai.web';
import { requestAi, type AiRequest } from '../../src/ai/transport';
const PNG_FIXTURE = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADklEQVR4nGP4DwUMMAYAj4IP8TylVlEAAAAASUVORK5CYII=',
    'base64'
  )
);
const ID = 'a'.repeat(64),
  JOB = 'b'.repeat(64);
const wire: { input: string; init: RequestInit }[] = [];
const PAGE_ORIGIN = 'https://deploy-preview.example';

beforeEach(() => {
  wire.length = 0;
  fixture.rate.mockReturnValue({ limited: false });
  fixture.job.mockResolvedValue({ status: 'pending', context: { free: null, style: null } });
  fixture.jobImage.mockResolvedValue(PNG_FIXTURE.slice());
  fixture.discard.mockResolvedValue(null);
  fixture.verify.mockResolvedValue({ ok: true });
  fixture.code.mockResolvedValue({ verdict: 'allowed', spendsGuess: false });
  fixture.grant.mockResolvedValue({ remaining: 10 });
  fixture.reserve.mockResolvedValue({ reserved: true, reservationId: 'fixture-reservation' });
  fixture.start.mockResolvedValue({ jobId: JOB, pollAfterMs: 3000 });
  fixture.provider.mockImplementation(() => {
    throw new Error('A controlled fixture must never call the provider');
  });
  // The web transport calls a path on the page's own origin, as a browser resolves it.
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    wire.push({ input, init });
    const url = new URL(input, PAGE_ORIGIN);
    const request = new Request(url, init);
    if (url.pathname === '/api/free-generation-grant')
      return GET({ request, getClientAddress: () => '203.0.113.10' } as unknown as Parameters<
        typeof GET
      >[0]);
    if (url.pathname === '/api/generate-image')
      return POST({ request, url, getClientAddress: () => '203.0.113.10' } as unknown as Parameters<
        typeof POST
      >[0]);
    const event = { request, url, getClientAddress: () => '203.0.113.10' };
    if (url.pathname === '/api/generation-result')
      return pollHandler(event as unknown as Parameters<typeof pollHandler>[0]);
    if (url.pathname === '/api/verify-key')
      return verifyKeyHandler(event as unknown as Parameters<typeof verifyKeyHandler>[0]);
    if (url.pathname === '/api/verify-access-code')
      return verifyCodeHandler(event as unknown as Parameters<typeof verifyCodeHandler>[0]);
    throw new Error('Unexpected fixture destination');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('native AI transport through real controlled hosted handlers', () => {
  it('reads the authoritative grant and starts one raw PNG background job with canonical headers', async () => {
    const grant: AiRequest = {
      path: '/api/free-generation-grant',
      method: 'GET',
      headers: { 'X-Installation-Id': ID },
    };
    expect(await requestAi(aiTransport, grant, () => {})).toEqual({ kind: 'grant', remaining: 10 });
    const body = PNG_FIXTURE.slice();
    const start: AiRequest = {
      path: '/api/generate-image',
      method: 'POST',
      query: 'style=Clay',
      headers: { 'X-Installation-Id': ID, 'X-Async-Generation': '1', 'Content-Type': 'image/png' },
      body,
    };
    expect(await requestAi(aiTransport, start, () => {})).toEqual({
      kind: 'ticket',
      jobId: JOB,
      pollAfterMs: 3000,
    });
    expect(fixture.start).toHaveBeenCalledOnce();
    expect(fixture.start.mock.calls[0][2]).toEqual({ bytes: body.buffer, mimeType: 'image/png' });
    expect(wire[1].init).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(fixture.provider).not.toHaveBeenCalled();
  });
  it('surfaces actual free exhaustion without starting a background job or provider', async () => {
    fixture.reserve.mockResolvedValue({ reserved: false });
    const reply = await requestAi(
      aiTransport,
      {
        path: '/api/generate-image',
        method: 'POST',
        headers: { 'X-Installation-Id': ID, 'Content-Type': 'image/png' },
        body: Uint8Array.of(1),
      },
      () => {}
    );
    expect(reply).toMatchObject({ kind: 'failure', reason: 'exhausted' });
    expect(fixture.start).not.toHaveBeenCalled();
    expect(fixture.provider).not.toHaveBeenCalled();
  });
});

it('collects through the actual result handler and distinguishes pending, unavailable, safety and delivered images', async () => {
  const request: AiRequest = {
    path: '/api/generation-result',
    method: 'GET',
    query: `job=${JOB}`,
    headers: { 'X-Installation-Id': ID },
  };
  expect(await requestAi(aiTransport, request, () => {})).toEqual({
    kind: 'pending',
    delayMs: 3000,
  });
  fixture.job.mockResolvedValue({ status: 'unavailable' });
  expect(await requestAi(aiTransport, request, () => {})).toEqual({
    kind: 'pending',
    delayMs: 3000,
  });
  fixture.job.mockResolvedValue({
    status: 'refusal',
    reason: 'fixture-safety',
    context: { free: null, style: null },
  });
  expect(await requestAi(aiTransport, request, () => {})).toMatchObject({
    kind: 'failure',
    reason: 'safety',
  });
  fixture.job.mockResolvedValue({
    status: 'image',
    mimeType: 'image/png',
    context: { free: { installationId: ID, reservationId: 'fixture-reservation' }, style: null },
  });
  expect(await requestAi(aiTransport, request, () => {})).toMatchObject({
    kind: 'image',
    remaining: 9,
  });
  expect(fixture.discard).toHaveBeenCalledWith(JOB);
  expect(fixture.provider).not.toHaveBeenCalled();
});
it('verifies fixture credentials through actual setup handlers and preserves unavailable key checks as unavailable', async () => {
  const key: AiRequest = {
    path: '/api/verify-key',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"apiKey":"fixture-key"}',
  };
  expect(await requestAi(aiTransport, key, () => {})).toEqual({ kind: 'verified' });
  expect(fixture.verify).toHaveBeenCalledWith('fixture-key');
  fixture.verify.mockResolvedValue({
    ok: false,
    kind: 'unreachable',
    reason: 'fixture-unreachable',
  });
  expect(await requestAi(aiTransport, key, () => {})).toMatchObject({
    kind: 'failure',
    reason: 'unavailable',
  });
  expect(
    await requestAi(
      aiTransport,
      {
        path: '/api/verify-access-code',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"code":"fixture-code"}',
      },
      () => {}
    )
  ).toEqual({ kind: 'verified', accessCode: 'fixture-code' });
  expect(fixture.code).toHaveBeenCalledWith('fixture-code');
  expect(fixture.provider).not.toHaveBeenCalled();
});

it('preserves an unreadable allowlist as an unavailable native credential check', async () => {
  fixture.code.mockResolvedValue({ verdict: 'unavailable', spendsGuess: false });

  expect(
    await requestAi(
      aiTransport,
      {
        path: '/api/verify-access-code',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"code":"fixture-code"}',
      },
      () => {}
    )
  ).toEqual({
    kind: 'failure',
    reason: 'unavailable',
    message: "We couldn't check that key just now. Please try again.",
    status: 503,
    detail: "We couldn't check that key just now. Please try again.",
  });
  expect(fixture.code).toHaveBeenCalledWith('fixture-code');
  expect(fixture.provider).not.toHaveBeenCalled();
});
