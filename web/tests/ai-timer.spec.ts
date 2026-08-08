import { expect, test, type Page } from '@playwright/test';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

// Exercises the AI render timer animation via the dev-only debug harness at
// /dev/ai-timer, which feeds AiImageResult.svelte the sample artifacts through
// the real generation state seam — no Gemini call. Watch it run with:
//   npm run test:e2e:headed -- ai-timer

// Playwright waits for elements but not for Svelte to hydrate, so a click fired
// right after navigation can hit the SSR'd button before its handler is wired.
// Retry the trigger until the modal actually opens.
async function triggerAiTimer(page: Page, name: RegExp) {
  await expect(async () => {
    await page.getByRole('button', { name }).click({ timeout: 1000 });
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}

test.describe('AI render timer', () => {
  test('plays the dial and reveals the result image', async ({ page }) => {
    await page.goto('/dev/ai-timer');

    await triggerAiTimer(page, /fast/i);

    // Loading state: the progress dial sits over the blurred drawing preview.
    await expect(page.locator('.dial')).toBeVisible();
    await expect(page.locator('.stage-img.preview')).toBeVisible();

    // When the (mock) image arrives the dial races to full, then the result
    // cross-fades in and the download button pops in.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
    await expect(page.getByText('AI-generated picture')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report this picture' })).toBeVisible();

    // The dial is torn down after the reveal.
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  test('confirms and sends an AI picture report from the result', async ({ page }) => {
    let reportRequests = 0;
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
    await page.goto('/dev/ai-timer');
    await triggerAiTimer(page, /fast/i);
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Report this picture' }).click();
    await expect(page.locator('.ai-report-confirmation')).toContainText(
      'The report is deleted after 30 days.'
    );
    expect(reportRequests).toBe(0);

    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/Keep this report reference.*test-report-id/)).toBeVisible();
    expect(reportRequests).toBe(1);
  });

  test('shows the error state', async ({ page }) => {
    await page.goto('/dev/ai-timer');

    await triggerAiTimer(page, /error/i);

    await expect(page.getByText(/didn't work/i)).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  // Action-level coverage for the scoped pinchZoom (aiPreview.ts math is unit-
  // tested; this drives the real .ai-stage wiring in Chromium): a two-finger
  // spread scales the .zoom-layer and marks the stage .zoomed, while a lone
  // finger on the un-zoomed preview passes straight through (ADR-0076).
  test('the revealed result pinch-zooms, and a lone finger passes through', async ({ page }) => {
    await page.goto('/dev/ai-timer');
    await triggerAiTimer(page, /fast/i);
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

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
      await page.goto('/dev/ai-timer');
      await triggerAiTimer(page, /fast/i);

      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);

      const { stageH, rectHeight } = await page.locator('.ai-stage').evaluate((el) => ({
        stageH: parseFloat(getComputedStyle(el).getPropertyValue('--stage-h')),
        rectHeight: el.getBoundingClientRect().height,
      }));
      expect(stageH).toBeCloseTo(rectHeight, 0);
    });

    // The error state's {:else} unmounts .ai-stage; a retry mounts a fresh
    // element. Regression coverage for the observer staying bound to the old,
    // now-detached element instead of following aiStageEl to the new one.
    test('re-observes a fresh .ai-stage after an error-then-retry', async ({ page }) => {
      await page.goto('/dev/ai-timer');
      await triggerAiTimer(page, /fast/i);
      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);

      // The open <dialog> is modal, so the button row below it is inert —
      // drive the error + retry via the harness's global hotkeys instead
      // (same reason `triggerAiTimer()` above only works before the dialog opens).
      await page.keyboard.press('e');
      await expect(page.getByText(/didn't work/i)).toBeVisible();

      await page.keyboard.press('p');
      await expect(page.locator('.dial')).toBeVisible();
      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);
    });
  });
});
