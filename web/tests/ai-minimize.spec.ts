import { expect, test, type Page } from '@playwright/test';
import { invokeAiGeneration, prepareAiGeneration } from './ai-harness';
import { openDrawer } from './flows-harness';

// Getting back into a generation that was sent to the corner (ADR-0116). The
// two controls that promise to do it are the polaroid and the Magic Button that
// started the run, and only one of them was wired: the button is disabled while
// `generating`, so it never dispatched the tap, and the restore branch behind it
// had no reachable caller at all. Both routes are driven here through the real
// chrome for that reason — and so is what they land on, since a picture that
// finished while it waited must come back revealed rather than behind its own
// progress dial.
// Watch it run with:
//   npm run test:e2e:headed -- ai-minimize

const PHONE_VIEWPORT = { width: 320, height: 568 };

const modal = 'dialog.ai-result-modal';
const polaroid = '.ai-waiting-polaroid';
const magicButton = '#aiImageButton';

// The dial's remaining wedge, which shrinks from 360deg as the run fills. Read
// off the live element because it is the only published trace of where the run
// actually is.
function dialAngle(page: Page) {
  return page
    .locator('.dial')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue('--angle')));
}

test.describe('a generation minimized to the corner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
  });

  test('goes to the polaroid, and the polaroid brings it back', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();

    await page.getByLabel('Keep drawing while this is made').click();

    await expect(page.locator(polaroid)).toBeVisible();
    await expect(page.locator(modal)).toBeHidden();

    await page.locator(polaroid).click();
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator(polaroid)).toBeHidden();
  });

  test('is what the Magic Button reveals while it is still running', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    // The button lives in the collapsed action drawer, so the polaroid is the
    // route that needs no steps — but a parent who opens the drawer while a run
    // waits must not find the control that started it inert.
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

  test('comes back to the picture, not to a dial catching up to it', async ({ page }) => {
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    await endpoint.succeed();
    await expect(page.locator(polaroid)).toContainText('Ready!');

    await page.locator(polaroid).click();

    // Already revealed on arrival: the run finished in the corner, so there is
    // nothing left to animate and nothing to make the child wait through again.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  test('keeps the run where it got to while it waited', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();

    // Any measurable fill will do — the point is the comparison, not the value.
    await expect.poll(() => dialAngle(page)).toBeLessThan(355);
    const beforeMinimize = await dialAngle(page);

    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();
    await page.locator(polaroid).click();
    await expect(page.locator(modal)).toBeVisible();

    // The dial used to own the loop that filled it, so remounting it restarted
    // the run's progress from zero — telling a child who had already waited that
    // their picture was only just beginning.
    await expect.poll(() => dialAngle(page)).toBeLessThan(beforeMinimize);
  });

  test('keeps its polaroid above the chrome it is pinned beside', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    // A tie is settled by DOM order, and the banner mounts second — which left
    // the chip this replaced completely covered and the paid run unreachable.
    // The palette is the other neighbour: the print is pinned to the corner
    // beside it and its tilt grazes that edge, so it has to paint over it.
    const layers = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Number(getComputedStyle(el).zIndex) : null;
      };
      return {
        polaroid: read('.ai-waiting-polaroid'),
        banner: read('.install-banner'),
        palette: read('.color-palette'),
      };
    });
    expect(layers.polaroid).toBeGreaterThan(950);
    expect(layers.polaroid).toBeGreaterThan(layers.palette ?? 0);

    // And it actually receives the tap at its own centre.
    const box = await page.locator(polaroid).boundingBox();
    if (!box) throw new Error('the polaroid has no bounds');
    const onTop = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('.ai-waiting-polaroid') !== null,
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(onTop).toBe(true);
  });

  test('leaves every color on the palette uncovered', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    const print = await page.locator(polaroid).boundingBox();
    if (!print) throw new Error('the polaroid has no bounds');

    // Grazing the palette's edge is the intent; sitting on a swatch is not —
    // every color has to stay pickable with a picture waiting in the corner.
    const swatches = await page.locator('.color-swatch:visible').all();
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      const box = await swatch.boundingBox();
      if (!box) continue;
      const overlaps =
        box.x < print.x + print.width &&
        print.x < box.x + box.width &&
        box.y < print.y + print.height &&
        print.y < box.y + box.height;
      expect(overlaps).toBe(false);
    }
  });
});
