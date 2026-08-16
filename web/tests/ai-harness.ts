import { expect, type Page } from '@playwright/test';
import { aiOutputFor } from './artifacts/ai-output-fixtures.ts';
import { drawCommittedStroke, gotoApp } from './helpers';

// Shared harness for the AI generation flow, used by ai-result.spec.ts (the
// result modal's presentation) and ai-report.spec.ts (the report flow). The
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
export const MOCK_REPORT_TOKEN = '9999999999999.mock-signature';

interface AiUploadRequest {
  method: string;
  contentType: string | undefined;
  bytes: number;
}

interface AiMockDelivery {
  response: AiMockResponse;
  delivered: () => void;
}

async function mockAiEndpoint(page: Page) {
  const queued: AiMockDelivery[] = [];
  const waiters: ((delivery: AiMockDelivery) => void)[] = [];
  const requests: AiUploadRequest[] = [];
  let observeFirstRequest!: (request: AiUploadRequest) => void;
  const firstRequest = new Promise<AiUploadRequest>((resolve) => {
    observeFirstRequest = resolve;
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
    firstRequest,
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

// `freeTier: true` leaves the access token unset, which is what selects the
// no-setup credential the app defaults to — the mocked endpoint answers either
// way, so the difference is purely which header the client chooses to send.
export interface AiGenerationOptions {
  freeTier?: boolean;
}

export async function prepareAiGeneration(page: Page, options: AiGenerationOptions = {}) {
  const endpoint = await mockAiEndpoint(page);
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

export async function resultBoxes(page: Page) {
  const [card, content, report, strip] = await Promise.all([
    page.locator('dialog.ai-result-modal').boundingBox(),
    page.locator('.ai-result-content').boundingBox(),
    page.getByRole('button', { name: 'Report this picture' }).boundingBox(),
    page.locator('.ai-result-disclosure').boundingBox(),
  ]);
  if (!card || !content || !report || !strip) {
    throw new Error('AI result geometry was not measurable');
  }
  return { card, content, report, strip };
}

export async function loadingBoxes(page: Page) {
  return page.evaluate(() => {
    function rectFor(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`AI loading element was not found: ${selector}`);
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }

    return {
      card: rectFor('dialog.ai-result-modal'),
      content: rectFor('.ai-result-content'),
      stage: rectFor('.ai-stage'),
      caption: rectFor('.ai-loading-caption'),
    };
  });
}

export async function revealedBoxes(page: Page) {
  return page.evaluate(() => {
    function rectFor(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`AI result element was not found: ${selector}`);
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }

    return {
      card: rectFor('dialog.ai-result-modal'),
      stage: rectFor('.ai-stage'),
    };
  });
}

// The stage glides to its new height when the keep-drawing pill leaves, so a
// height read on the frame the picture became visible is a height mid-glide.
export async function settledStageHeight(page: Page) {
  let previous = Number.NaN;
  await expect
    .poll(async () => {
      const { stage } = await revealedBoxes(page);
      const settled = stage.height === previous;
      previous = stage.height;
      return settled;
    })
    .toBe(true);
  return previous;
}

// The room the waiting card owes the keep-drawing pill — the pill's own height
// plus the gap above it — read off the card rather than restated, so the
// geometry assertions track the card's budget when it is retuned.
export function keepDrawingBlockPx(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('dialog.ai-result-modal');
    if (!card) throw new Error('the AI result card is not mounted');
    const style = getComputedStyle(card);
    const read = (name: string) => Number.parseFloat(style.getPropertyValue(name));
    return read('--keep-drawing-height') + read('--space-3');
  });
}

// The strip's placement below the card and the room the card's height budget
// keeps clear for it come from the same custom properties, so the geometry
// assertions read them off the page instead of restating their values.
export function stripTokens(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      gap: parseFloat(root.getPropertyValue('--report-strip-gap')),
      height: parseFloat(root.getPropertyValue('--report-strip-height')),
      tap: parseFloat(root.getPropertyValue('--report-strip-tap')),
    };
  });
}
