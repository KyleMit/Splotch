import { expect, test, type Page } from '@playwright/test';

// Exercises the AI render timer animation via the dev-only debug harness at
// /dev/ai-timer, which feeds AiImageResult.svelte the sample artifacts through
// the real generation state seam — no Gemini call. Watch it run with:
//   npm run test:e2e:headed -- ai-timer

// Playwright waits for elements but not for Svelte to hydrate, so a click fired
// right after navigation can hit the SSR'd button before its handler is wired.
// Retry the trigger until the modal actually opens.
async function trigger(page: Page, name: RegExp) {
  await expect(async () => {
    await page.getByRole('button', { name }).click({ timeout: 1000 });
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}

test.describe('AI render timer', () => {
  test('plays the dial and reveals the result image', async ({ page }) => {
    await page.goto('/dev/ai-timer');

    await trigger(page, /fast/i);

    // Loading state: the progress dial sits over the blurred drawing preview.
    await expect(page.locator('.dial')).toBeVisible();
    await expect(page.locator('.stage-img.preview')).toBeVisible();

    // When the (mock) image arrives the dial races to full, then the result
    // cross-fades in and the download button pops in.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible();

    // The dial is torn down after the reveal.
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  test('shows the error state', async ({ page }) => {
    await page.goto('/dev/ai-timer');

    await trigger(page, /error/i);

    await expect(page.getByText(/didn't work/i)).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  // Action-level coverage for the scoped pinchZoom (aiPreview.ts math is unit-
  // tested; this drives the real .ai-stage wiring in Chromium): a two-finger
  // spread scales the .zoom-layer and marks the stage .zoomed, while a lone
  // finger on the un-zoomed preview passes straight through (ADR-0076).
  test('the revealed result pinch-zooms, and a lone finger passes through', async ({ page }) => {
    await page.goto('/dev/ai-timer');
    await trigger(page, /fast/i);
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

      // A lone finger on the un-zoomed preview must not be intercepted.
      fire('pointerdown', 9, cx, cy);
      const lonePrevented = fire('pointermove', 9, cx + 6, cy).defaultPrevented;
      fire('pointerup', 9, cx + 6, cy);

      // Two fingers spreading apart zoom the picture.
      fire('pointerdown', 1, cx - 10, cy);
      fire('pointerdown', 2, cx + 10, cy);
      fire('pointermove', 1, cx - 50, cy);
      fire('pointermove', 2, cx + 50, cy);
      const transform = (node.querySelector('.zoom-layer') as HTMLElement).style.transform;
      const zoomed = node.classList.contains('zoomed');
      fire('pointerup', 1, cx - 50, cy);
      fire('pointerup', 2, cx + 50, cy);

      return { transform, zoomed, lonePrevented };
    });

    expect(result.lonePrevented).toBe(false);
    expect(result.zoomed).toBe(true);
    expect(result.transform).toMatch(/scale\(/);
    expect(result.transform).not.toMatch(/scale\(1\)/);
  });
});
