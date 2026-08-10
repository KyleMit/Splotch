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

// The strip's placement below the card and the room the card's height budget
// keeps clear for it come from the same two custom properties, so the geometry
// assertions read them off the page instead of restating their values.
function stripTokens(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      gap: parseFloat(root.getPropertyValue('--report-strip-gap')),
      height: parseFloat(root.getPropertyValue('--report-strip-height')),
    };
  });
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
  });

  test('confirms and sends an AI picture report from the result', async ({ page }) => {
    let reportRequests = 0;
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
    await page.goto('/dev/ai-timer');
    await triggerAiTimer(page, /fast/i);
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

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
    await expect(page.locator('.ai-report-confirmation')).toContainText(
      'The report is deleted after 30 days.'
    );
    expect(reportRequests).toBe(0);

    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/Keep this report reference.*test-report-id/)).toBeVisible();
    expect(reportRequests).toBe(1);
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
      await page.goto('/dev/ai-timer');
      await triggerAiTimer(page, /fast/i);
      await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

      const { card, strip } = await resultBoxes(page);
      const tokens = await stripTokens(page);
      expect(strip.y - (card.y + card.height)).toBeCloseTo(tokens.gap, 0);
      expect(strip.x + strip.width / 2).toBeCloseTo(card.x + card.width / 2, 0);
      // The card's height budget reserves --report-strip-height for the strip;
      // a strip that outgrew it would be reserved short and clip off-screen.
      expect(strip.height).toBeCloseTo(tokens.height, 0);
    });
  }

  // The strip sits on the dimmed backdrop, which is dark under either theme, so
  // its colors are literal rather than theme tokens that flip in light mode.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`paints the strip on backdrop colors in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/dev/ai-timer');
      await triggerAiTimer(page, /fast/i);
      await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

      const chrome = await page
        .getByRole('button', { name: 'Report this picture' })
        .evaluate((button) => {
          const strip = button.closest('.ai-result-disclosure') as HTMLElement;
          const icon = button.querySelector('svg') as SVGElement;
          return {
            fill: getComputedStyle(strip).backgroundColor,
            text: getComputedStyle(strip).color,
            report: getComputedStyle(button).color,
            iconFill: getComputedStyle(icon).fill,
          };
        });
      expect(chrome.fill).toBe('rgba(23, 23, 29, 0.55)');
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
      await page.goto('/dev/ai-timer');
      await triggerAiTimer(page, /fast/i);
      await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

      const { card, content, strip } = await resultBoxes(page);
      expect(content.y + content.height).toBeLessThanOrEqual(card.y + card.height + 1);
      // The card gives up height for the strip rather than pushing it off the
      // bottom of a short screen.
      expect(strip.y + strip.height).toBeLessThanOrEqual(viewport.height + 1);
    });
  }

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
