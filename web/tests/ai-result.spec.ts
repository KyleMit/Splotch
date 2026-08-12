import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_REQUEST_TIMEOUT_MS } from '../src/lib/ai/limits';
import { AI_LOADING_SUBTITLE, AI_LOADING_TITLE } from '../src/lib/ai/loadingCopy';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { draw, enforceProductionCsp, gotoApp } from './helpers';

// Exercises AiImageResult through the production generation flow. The endpoint
// is mocked below the client pipeline, so each case still covers canvas export,
// upload encoding, response parsing, and response application without Gemini.
// Watch it run with:
//   npm run test:e2e:headed -- ai-result

const AI_OUTPUT = readFileSync(new URL('./artifacts/ai-output.jpeg', import.meta.url));
const PREVIEW_COMMIT_TIMEOUT_MS = 10_000;

interface AiMockResponse {
  status: number;
  contentType: string;
  body: string | Buffer;
}

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
  const respond = (response: AiMockResponse) =>
    new Promise<void>((delivered) => {
      const delivery = { response, delivered };
      const waiter = waiters.shift();
      if (waiter) waiter(delivery);
      else queued.push(delivery);
    });

  await page.route('**/api/generate-image*', async (route) => {
    const request = route.request();
    requests.push({
      method: request.method(),
      contentType: request.headers()['content-type'],
      bytes: request.postDataBuffer()?.byteLength ?? 0,
    });
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
    requests,
    succeed: () => respond({ status: 200, contentType: 'image/jpeg', body: AI_OUTPUT }),
    fail: (status = 500) =>
      respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Mock generation failure' }),
      }),
  };
}

async function invokeAiGeneration(page: Page) {
  await expect
    .poll(() => page.evaluate(() => typeof window.__aiGenerate === 'function'))
    .toBe(true);
  await page.evaluate(() => {
    void window.__aiGenerate?.({ style: 'Magical' });
  });
}

async function drawPreview(page: Page) {
  const history = () => page.evaluate(() => window.__drawingDebug?.getUndoDebug());
  const committed = async () => {
    const state = await history();
    return Boolean(state && state.snapshots > 0 && state.pendingCommands === 0);
  };

  await expect
    .poll(() => page.evaluate(() => Boolean(window.__drawingDebug)), {
      timeout: PREVIEW_COMMIT_TIMEOUT_MS,
    })
    .toBe(true);
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('Drawing canvas has no bounds');
  await draw(page, [
    { x: box.width * 0.24, y: box.height * 0.45 },
    { x: box.width * 0.5, y: box.height * 0.62 },
    { x: box.width * 0.76, y: box.height * 0.4 },
  ]);
  await expect.poll(committed, { timeout: PREVIEW_COMMIT_TIMEOUT_MS }).toBe(true);
}

async function prepareAiGeneration(page: Page) {
  const endpoint = await mockAiEndpoint(page);
  await gotoApp(page, '/?ai_access_token=test-token');
  await drawPreview(page);
  return endpoint;
}

async function openAiResult(page: Page) {
  const endpoint = await prepareAiGeneration(page);
  await invokeAiGeneration(page);
  await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
  return endpoint;
}

async function revealAiResult(page: Page) {
  const endpoint = await openAiResult(page);
  await endpoint.succeed();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
}

async function resultBoxes(page: Page) {
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

async function loadingBoxes(page: Page) {
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

async function revealedBoxes(page: Page) {
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

// The strip's placement below the card and the room the card's height budget
// keeps clear for it come from the same custom properties, so the geometry
// assertions read them off the page instead of restating their values.
function stripTokens(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      gap: parseFloat(root.getPropertyValue('--report-strip-gap')),
      height: parseFloat(root.getPropertyValue('--report-strip-height')),
      tap: parseFloat(root.getPropertyValue('--report-strip-tap')),
    };
  });
}

test.describe('AI result modal', () => {
  test('uploads the live canvas as a non-empty image POST', async ({ page }) => {
    const endpoint = await openAiResult(page);

    await expect.poll(() => endpoint.requests.length).toBe(1);
    const request = endpoint.requests[0];
    if (!request) throw new Error('Generate-image request was not recorded');
    expect(request.method).toBe('POST');
    expect(request.contentType).toMatch(/^image\/(webp|png)$/);
    expect(request.bytes).toBeGreaterThan(0);

    await endpoint.fail();
  });

  test('plays the dial and reveals the result image', async ({ page }) => {
    const endpoint = await prepareAiGeneration(page);
    await expect(page.locator('.ai-loading-caption')).toHaveCount(0);
    await invokeAiGeneration(page);
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible();

    // Loading state: the progress dial sits over the real canvas export.
    await expect(page.locator('.dial')).toBeVisible();
    await expect(page.locator('.stage-img.preview')).toBeVisible();
    const loadingCaption = page.locator('.ai-loading-caption');
    await expect(loadingCaption).toContainText(AI_LOADING_TITLE);
    await expect(loadingCaption).toContainText(AI_LOADING_SUBTITLE);

    await endpoint.succeed();

    // When the mocked image arrives the dial races to full, then the result
    // cross-fades in and the download button pops in.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible();

    // The disclosure lives on the strip below the card, not in the card footer.
    const strip = page.locator('.ai-result-disclosure');
    await expect(strip).toContainText('AI-generated picture');
    const footer = page.locator('.ai-result-footer');
    await expect(footer).not.toContainText('AI-generated picture');
    await expect(footer.getByRole('button')).toHaveCount(1);
    const report = strip.getByRole('button', { name: 'Report this picture' });
    await expect(report).toBeVisible();
    await expect(report).toContainText('Report');
    await expect(report.locator('[data-icon="flag"]')).toBeVisible();

    // The dial is torn down after the reveal.
    await expect(page.locator('.dial')).toHaveCount(0);
    await expect(loadingCaption).toHaveCount(0);
  });

  for (const viewport of [
    { width: 390, height: 480, label: '390px phone portrait at 480px high' },
    { width: 844, height: 390, label: '390px phone landscape' },
    { width: 320, height: 568, label: '320px phone portrait' },
  ]) {
    for (const autoSave of [false, true]) {
      const saveMode = autoSave ? ' with auto-save' : '';
      test(`keeps loading and reveal geometry stable on ${viewport.label}${saveMode}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        if (autoSave) {
          await page.addInitScript(
            (key) => localStorage.setItem(key, 'true'),
            STORAGE_KEYS.autoSaveAi
          );
        }
        const endpoint = await openAiResult(page);

        const caption = page.locator('.ai-loading-caption');
        await expect(caption).toBeVisible();
        const loading = await loadingBoxes(page);

        expect(loading.card.y).toBeGreaterThanOrEqual(-1);
        expect(loading.card.y + loading.card.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(loading.content.y + loading.content.height).toBeLessThanOrEqual(
          loading.card.y + loading.card.height + 1
        );
        expect(loading.caption.y + loading.caption.height).toBeLessThanOrEqual(
          loading.card.y + loading.card.height + 1
        );

        await endpoint.succeed();
        await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
        const revealed = await revealedBoxes(page);
        expect(revealed.card.height).toBeCloseTo(loading.card.height, 0);
        expect(revealed.stage.height).toBeCloseTo(loading.stage.height, 0);
      });
    }
  }

  test('confirms and sends an AI picture report from the result', async ({ page }) => {
    let reportRequests = 0;
    // Under the shipped CSP, because the report reads the drawing and the result
    // back out of their object URLs — a `blob:` fetch the policy has to permit.
    // Without this the flow passes here and fails in production.
    await enforceProductionCsp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      reportRequests += 1;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reportId: 'test-report-id' }),
      });
    });
    await revealAiResult(page);

    const report = page.getByRole('button', { name: 'Report this picture' });
    // The Report control is deliberately fine print; the tap target around it
    // still has to clear the app's 44px minimum.
    const { report: reportBox, strip } = await resultBoxes(page);
    expect(reportBox.width).toBeGreaterThanOrEqual(44);
    expect(reportBox.height).toBeGreaterThanOrEqual(44);
    expect(reportBox.height).toBeGreaterThan(strip.height);

    await report.focus();
    await expect(report).toBeFocused();
    await page.keyboard.press('Enter');
    const confirm = page.locator('dialog.ai-report-confirm');
    await expect(confirm).toContainText('the report is deleted after 30 days.');
    // The confirmation names the two artifacts by showing them, and stands in
    // front of the result rather than in its footer — so the Download button is
    // still on screen behind the second scrim, and is no longer a live choice.
    await expect(confirm.locator('img')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    expect(reportRequests).toBe(0);

    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/Keep this report reference.*test-report-id/)).toBeVisible();
    await expect(confirm).not.toBeVisible();
    expect(reportRequests).toBe(1);
  });

  // The confirmation carries no close disc — Cancel is the dismissal — and it
  // stands in front of the result rather than replacing anything in it, so
  // backing out has to leave the card exactly as it was.
  test('cancelling the report confirmation returns to an untouched result', async ({ page }) => {
    let reportRequests = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      reportRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await revealAiResult(page);

    const before = await revealedBoxes(page);
    const confirm = page.locator('dialog.ai-report-confirm');
    await page.getByRole('button', { name: 'Report this picture' }).click();
    await expect(confirm).toBeVisible();
    // The picture behind it does not resize to make room, as the old inline
    // confirmation made it.
    expect((await revealedBoxes(page)).stage.height).toBeCloseTo(before.stage.height, 0);

    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).not.toBeVisible();
    await expect(page.locator('.ai-result-disclosure')).toBeVisible();
    expect((await revealedBoxes(page)).card.height).toBeCloseTo(before.card.height, 0);
    expect(reportRequests).toBe(0);
  });

  // A <dialog> hands focus back to whatever held it before showModal(), so the
  // Report control has to still be mounted and connected when the confirmation
  // goes away — otherwise dismissing drops a keyboard user on <body>, outside
  // the result dialog they were working in.
  for (const dismissal of ['Escape', 'Cancel'] as const) {
    test(`dismissing the confirmation with ${dismissal} hands focus back to Report`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(
        (key) => localStorage.setItem(key, 'never'),
        STORAGE_KEYS.parentalGateImageReportMode
      );
      await revealAiResult(page);

      const report = page.getByRole('button', { name: 'Report this picture' });
      const confirm = page.locator('dialog.ai-report-confirm');
      await report.focus();
      await page.keyboard.press('Enter');
      await expect(confirm).toBeVisible();

      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirm).not.toBeVisible();
      await expect(report).toBeFocused();
    });
  }

  // Dismissal is blocked while the request is on the wire, so the deadline is
  // the only thing that can end a send that never settles. Without it the
  // topmost dialog stays open against Cancel, the backdrop, Esc and Android
  // back alike, for as long as the browser holds the socket.
  test('a report send that never settles times out into the retry state', async ({ page }) => {
    test.setTimeout(CLIENT_REQUEST_TIMEOUT_MS * 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    // Never fulfilled, never aborted from this side: the client's own deadline
    // has to be what ends it.
    await page.route('**/api/report-image', async () => {});
    await revealAiResult(page);

    await page.getByRole('button', { name: 'Report this picture' }).click();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('button', { name: 'Sending…' })).toBeVisible();

    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible({ timeout: CLIENT_REQUEST_TIMEOUT_MS * 1.5 });
    await expect(page.locator('dialog.ai-report-confirm')).not.toBeVisible();
    await expect(page.getByRole('alert')).toContainText('taking too long');
    // The dialog that closed took the focused button with it, so the retry it
    // left behind is where a keyboard user has to land.
    await expect(retry).toBeFocused();
  });

  // The strip is anchored to the card, not the viewport corner the old flag sat
  // in — so the gap under the picture is the same on a phone-sized dialog and on
  // a desktop, where that flag drifted furthest from what it referred to.
  for (const viewport of [
    { width: 768, height: 1024, label: 'iPad portrait' },
    { width: 1440, height: 900, label: 'desktop' },
  ]) {
    test(`anchors the disclosure strip below the result card on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await revealAiResult(page);

      const { card, strip, report } = await resultBoxes(page);
      const tokens = await stripTokens(page);
      expect(strip.y - (card.y + card.height)).toBeCloseTo(tokens.gap, 0);
      expect(strip.x + strip.width / 2).toBeCloseTo(card.x + card.width / 2, 0);
      // The card's height budget is reserved off these two tokens, so either one
      // drifting from what actually renders would reserve short and clip the
      // strip — or the Report target overhanging it — off a short screen.
      expect(strip.height).toBeCloseTo(tokens.height, 0);
      expect(report.height).toBeCloseTo(tokens.tap, 0);
    });
  }

  // The strip sits on the dimmed backdrop, which is dark under either theme, so
  // its colors are literal rather than theme tokens that flip in light mode.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`paints the strip on backdrop colors in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await revealAiResult(page);

      const chrome = await page
        .getByRole('button', { name: 'Report this picture' })
        .evaluate((button) => {
          const strip = button.closest('.ai-result-disclosure') as HTMLElement;
          const icon = button.querySelector('svg') as SVGElement;
          return {
            fill: getComputedStyle(strip).backgroundColor,
            ground: getComputedStyle(strip).backdropFilter,
            text: getComputedStyle(strip).color,
            report: getComputedStyle(button).color,
            iconFill: getComputedStyle(icon).fill,
          };
        });
      expect(chrome.fill).toBe('rgba(23, 23, 29, 0.72)');
      // The fill alone leaves the drawing showing through under 12px text; the
      // brightness floor is what keeps the ink legible over light artwork.
      expect(chrome.ground).toContain('brightness');
      expect(chrome.text).toBe('rgb(179, 177, 191)');
      expect(chrome.report).toBe('rgb(224, 147, 147)');
      // Beats the modal shell's icon re-ink, which would repaint it dark on dark.
      expect(chrome.iconFill).toBe(chrome.report);
    });
  }

  for (const viewport of [
    { width: 740, height: 360 },
    { width: 700, height: 420 },
  ]) {
    test(`keeps result content inside the card at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await revealAiResult(page);

      const { card, content, report } = await resultBoxes(page);
      expect(content.y + content.height).toBeLessThanOrEqual(card.y + card.height + 1);
      // The card gives up height for the strip rather than pushing it off the
      // bottom of a short screen. Measured on the Report box, not the strip:
      // its tap target is taller than the pill and overhangs it, so the strip
      // can sit fully on screen while the bottom of a 44px target is clipped.
      expect(report.y).toBeGreaterThanOrEqual(-1);
      expect(report.y + report.height).toBeLessThanOrEqual(viewport.height + 1);
    });
  }

  test('shows the error state', async ({ page }) => {
    const endpoint = await openAiResult(page);
    await endpoint.fail();

    await expect(page.getByText(/didn't work/i)).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
    await expect(page.locator('.ai-loading-caption')).toHaveCount(0);
  });

  test('shows the safety refusal state', async ({ page }) => {
    const endpoint = await openAiResult(page);
    await endpoint.fail(422);

    await expect(page.getByText("Let's try drawing something else!")).toBeVisible();
    await expect(page.locator('.ai-result-error.safety')).toBeVisible();
    await expect(page.getByText(/try drawing something different/i)).toBeVisible();
  });

  // Action-level coverage for the scoped pinchZoom (aiPreview.ts math is unit-
  // tested; this drives the real .ai-stage wiring in Chromium): a two-finger
  // spread scales the .zoom-layer and marks the stage .zoomed, while a lone
  // finger on the un-zoomed preview passes straight through (ADR-0076).
  test('the revealed result pinch-zooms, and a lone finger passes through', async ({ page }) => {
    await revealAiResult(page);

    const result = await page.locator('.ai-stage').evaluate((node) => {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (name: string, id: number, x: number, y: number) => {
        const ev = new PointerEvent(name, {
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        });
        node.dispatchEvent(ev);
        return ev;
      };

      const layer = node.querySelector('.zoom-layer') as HTMLElement;

      // A lone finger on the un-zoomed preview must not be intercepted.
      fire('pointerdown', 9, cx, cy);
      const lonePrevented = fire('pointermove', 9, cx + 6, cy).defaultPrevented;
      fire('pointerup', 9, cx + 6, cy);
      const afterLoneTap = layer.style.transform;

      // Two fingers spreading apart zoom the picture.
      fire('pointerdown', 1, cx - 10, cy);
      fire('pointerdown', 2, cx + 10, cy);
      fire('pointermove', 1, cx - 50, cy);
      fire('pointermove', 2, cx + 50, cy);
      const transform = layer.style.transform;
      const zoomed = node.classList.contains('zoomed');

      // Pinching back to the starting spread lands on scale 1 again.
      fire('pointermove', 1, cx - 10, cy);
      fire('pointermove', 2, cx + 10, cy);
      fire('pointerup', 1, cx - 10, cy);
      fire('pointerup', 2, cx + 10, cy);
      const afterPinchBack = layer.style.transform;

      return { transform, zoomed, lonePrevented, afterLoneTap, afterPinchBack };
    });

    expect(result.lonePrevented).toBe(false);
    expect(result.zoomed).toBe(true);
    expect(result.transform).toMatch(/scale\(/);
    expect(result.transform).not.toMatch(/scale\(1\)/);
    // The rest state has one DOM representation — an empty inline transform —
    // whether it was never left or was returned to.
    expect(result.afterLoneTap).toBe('');
    expect(result.afterPinchBack).toBe('');
  });

  // AiConfetti's fall keyframes read --stage-h off .ai-stage (set by a
  // ResizeObserver in AiImageResult) instead of a fixed 540px, so the leaves
  // reach the bottom of the real stage on any viewport.
  test.describe('--stage-h tracks the stage element', () => {
    const stageHeightVar = (page: Page) =>
      page
        .locator('.ai-stage')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--stage-h').trim());

    test('reflects the stage element’s real rendered height', async ({ page }) => {
      await openAiResult(page);

      await expect
        .poll(() =>
          page.locator('.ai-stage').evaluate((el) => {
            const stageH = parseFloat(getComputedStyle(el).getPropertyValue('--stage-h'));
            return Math.abs(stageH - el.getBoundingClientRect().height);
          })
        )
        .toBeLessThan(0.5);
    });

    // The error state's {:else} unmounts .ai-stage; a retry mounts a fresh
    // element. Regression coverage for the observer staying bound to the old,
    // now-detached element instead of following aiStageEl to the new one.
    test('re-observes a fresh .ai-stage after an error-then-retry', async ({ page }) => {
      const endpoint = await openAiResult(page);
      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);

      await endpoint.fail();
      await expect(page.getByText(/didn't work/i)).toBeVisible();

      await invokeAiGeneration(page);
      await expect(page.locator('.dial')).toBeVisible();
      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);
    });
  });
});
