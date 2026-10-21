import { expect, type Page } from '@playwright/test';
import { FREE_GENERATION_LIMIT, type FreeGenerationGrantStatus } from '../src/lib/freeGenerations';
import { aiOutputFor } from './artifacts/ai-output-fixtures.ts';
import { drawCommittedStroke, gotoApp, seedAiEnabled, settleFlyIn } from './helpers';

// Shared harness for the AI generation flow, used by the ai-*.spec.ts files. The
// endpoint is mocked below the client pipeline, so a spec built on this still
// covers canvas export, upload encoding, response parsing, and response
// application without a live model provider.
//
// It deliberately does not extend Playwright's `test`: it overrides no fixture,
// so specs take `test` from '@playwright/test' as they do with flows-harness.

interface AiMockResponse {
  status: number;
  contentType: string;
  body: string | Buffer;
  headers?: Record<string, string>;
}

// Stands in for the token generate-image mints on a real free run. Its value is
// never verified here — the mock replaces the server that would sign it — so
// what this covers is the client carrying it from the generation response into
// the report request. The signature itself is unit-tested in reportToken.test.ts.
const MOCK_REPORT_TOKEN = '9999999999999.mock-signature';

interface AiUploadRequest {
  method: string;
  contentType: string | undefined;
  bytes: number;
}

interface AiMockDelivery {
  response: AiMockResponse;
  delivered: () => void;
}

const AI_REQUEST_OBSERVATION_TIMEOUT_MS = 10_000;

async function mockAiEndpoint(page: Page) {
  const queued: AiMockDelivery[] = [];
  const waiters: ((delivery: AiMockDelivery) => void)[] = [];
  const requests: AiUploadRequest[] = [];
  let observeFirstRequest!: (request: AiUploadRequest) => void;
  const firstRequest = new Promise<AiUploadRequest>((resolve) => {
    observeFirstRequest = resolve;
  });
  const waitForFirstRequest = () =>
    new Promise<AiUploadRequest>((resolve, reject) => {
      const timeoutId = setTimeout(
        () => reject(new Error('generate-image was never requested')),
        AI_REQUEST_OBSERVATION_TIMEOUT_MS
      );
      void firstRequest.then((request) => {
        clearTimeout(timeoutId);
        resolve(request);
      });
    });
  const respond = (response: AiMockResponse) =>
    new Promise<void>((delivered) => {
      const delivery = { response, delivered };
      const waiter = waiters.shift();
      if (waiter) waiter(delivery);
      else queued.push(delivery);
    });

  await page.route('**/api/generate-image*', async (route) => {
    const request = route.request();
    const upload = {
      method: request.method(),
      contentType: request.headers()['content-type'],
      bytes: request.postDataBuffer()?.byteLength ?? 0,
    };
    requests.push(upload);
    observeFirstRequest(upload);
    const delivery =
      queued.shift() ??
      (await new Promise<AiMockDelivery>((resolve) => {
        waiters.push(resolve);
      }));
    try {
      await route.fulfill(delivery.response);
    } finally {
      delivery.delivered();
    }
  });

  return {
    waitForFirstRequest,
    requests,
    // The picture is picked at delivery rather than at mock time because a spec
    // sets its viewport after the harness is wired, and several specs measure
    // the result geometry on a landscape screen.
    succeed: (headers?: Record<string, string>) =>
      respond({
        status: 200,
        contentType: 'image/jpeg',
        body: aiOutputFor(page.viewportSize()),
        headers,
      }),
    fail: (status = 500, headers?: Record<string, string>) =>
      respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Mock generation failure' }),
        headers: headers ?? (status === 422 ? { 'X-Report-Token': MOCK_REPORT_TOKEN } : undefined),
      }),
  };
}

// A granted allowance, or any of the route's `fail()` refusals, which the client
// treats alike.
type FreeGrantReply = { remaining: number } | 'unavailable';

function freeGrantResponse(reply: FreeGrantReply) {
  if (reply === 'unavailable') {
    return { status: 503, body: { ok: false, error: 'Free generations are unavailable' } };
  }
  const body = {
    ok: true,
    remaining: reply.remaining,
    limit: FREE_GENERATION_LIMIT,
  } satisfies FreeGenerationGrantStatus;
  return { status: 200, body };
}

// The one stub for /api/free-generation-grant. A function `reply` receives the
// 1-based request number, so a spec can answer its first request differently or
// hold a request open until it releases it.
export async function mockFreeGrant(
  page: Page,
  reply: FreeGrantReply | ((request: number) => FreeGrantReply | Promise<FreeGrantReply>)
) {
  let requests = 0;
  await page.route('**/api/free-generation-grant', async (route) => {
    requests += 1;
    const answer = typeof reply === 'function' ? await reply(requests) : reply;
    const { status, body } = freeGrantResponse(answer);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { requests: () => requests };
}

export async function invokeAiGeneration(page: Page) {
  await expect
    .poll(() => page.evaluate(() => typeof window.__aiGenerate === 'function'))
    .toBe(true);
  await page.evaluate(() => {
    void window.__aiGenerate?.({ style: 'Magical' });
  });
}

async function drawPreview(page: Page) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('Drawing canvas has no bounds');
  await drawCommittedStroke(page, [
    { x: box.width * 0.24, y: box.height * 0.45 },
    { x: box.width * 0.5, y: box.height * 0.62 },
    { x: box.width * 0.76, y: box.height * 0.4 },
  ]);
}

// `freeTier: true` leaves the access token unset, which selects the no-setup
// allowance; every harness scenario explicitly seeds the master preference.
export interface AiGenerationOptions {
  freeTier?: boolean;
}

export async function prepareAiGeneration(page: Page, options: AiGenerationOptions = {}) {
  const endpoint = await mockAiEndpoint(page);
  await seedAiEnabled(page);
  await gotoApp(page, options.freeTier ? '/' : '/?ai_access_token=test-token');
  await drawPreview(page);
  return endpoint;
}

export async function openAiResult(page: Page, options: AiGenerationOptions = {}) {
  const endpoint = await prepareAiGeneration(page, options);
  await invokeAiGeneration(page);
  await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
  return endpoint;
}

export async function revealAiResult(page: Page, options: AiGenerationOptions = {}) {
  const endpoint = await openAiResult(page, options);
  await endpoint.succeed(options.freeTier ? { 'X-Report-Token': MOCK_REPORT_TOKEN } : undefined);
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
}

// The report confirmation after its fly-in has landed — the only state in which
// a click on its buttons reaches them. AiImageReport flies the dialog in from
// the Report control's center, and modalDialog arms the launch dead zone there,
// so at the first keyframe the whole dialog (scaled to 5%) sits inside the zone
// and a pointerdown anywhere on it is swallowed by design. A real Playwright
// click does not wait that out: its stability check wants two consecutive
// frames with the same rect, and a fly-in still *pending* its start time (which
// a starved compositor hands out late) holds that first keyframe across frames.
// Captured under full-suite contention: the click dispatched 52ms after open, at
// a 17×21px dialog, 9px from the origin, and never sent. Waiting for the
// animation to finish removes the dependency on its progress (ADR-0078 §4a).
export async function landedReportConfirm(page: Page) {
  const confirm = page.locator('dialog.ai-report-confirm');
  await expect(confirm).toBeVisible();
  await settleFlyIn(confirm);
  return confirm;
}
