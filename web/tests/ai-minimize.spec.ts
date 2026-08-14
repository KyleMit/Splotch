import { expect, test } from '@playwright/test';
import { invokeAiGeneration, prepareAiGeneration } from './ai-harness';
import { openDrawer } from './flows-harness';

// Getting back into a generation that was sent to the corner (ADR-0116). The
// two controls that promise to do it are the chip and the Magic Button that
// started the run, and only one of them was wired: the button is disabled while
// `generating`, so it never dispatched the tap, and the restore branch behind it
// had no reachable caller at all. Both routes are driven here through the real
// chrome for that reason.
// Watch it run with:
//   npm run test:e2e:headed -- ai-minimize

const PHONE_VIEWPORT = { width: 320, height: 568 };

const modal = 'dialog.ai-result-modal';
const chip = '.ai-waiting-chip';
const magicButton = '#aiImageButton';

test.describe('a generation minimized to the corner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
  });

  test('goes to the chip, and the chip brings it back', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();

    await page.getByLabel('Keep drawing while this is made').click();

    await expect(page.locator(chip)).toBeVisible();
    await expect(page.locator(modal)).toBeHidden();

    await page.locator(chip).click();
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator(chip)).toBeHidden();
  });

  test('is what the Magic Button reveals while it is still running', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(chip)).toBeVisible();

    // The button lives in the collapsed action drawer, so the chip is the route
    // that needs no steps — but a parent who opens the drawer while a run waits
    // must not find the control that started it inert.
    await openDrawer(page);

    // The whole finding: while `generating` this button was disabled, so the tap
    // never left the DOM and the restore branch behind it was dead code.
    const button = page.locator(magicButton);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-label', 'Show the picture being made');
    await expect(button).toHaveAttribute('aria-busy', 'false');

    await button.click();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('keeps its chip above the Install Banner that shares the corner', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(chip)).toBeVisible();

    // A tie is settled by DOM order, and the banner mounts second — which left
    // the chip completely covered and the paid run unreachable. The banner also
    // stands down while a run is minimized; this asserts the layer that does not
    // depend on it doing so.
    const layers = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Number(getComputedStyle(el).zIndex) : null;
      };
      return { chip: read('.ai-waiting-chip'), banner: read('.install-banner') };
    });
    expect(layers.chip).toBeGreaterThan(950);

    // And it actually receives the tap at its own centre.
    const box = await page.locator(chip).boundingBox();
    if (!box) throw new Error('the chip has no bounds');
    const onTop = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('.ai-waiting-chip') !== null,
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(onTop).toBe(true);
  });
});
