import { expect, test, type Page } from '@playwright/test';

// Tier-2 accessibility (ADR-0076): a low-vision parent can pinch to enlarge the
// Parent Center's reading content, while the drawing page itself stays
// zoom-locked. The pinchTextZoom action drives CSS `zoom` on a `.pc-zoom` wrapper
// inside the scrolling pane; one finger still scrolls natively, two fingers
// resize. The gesture math is unit-tested (pinchTextZoom.svelte.test.ts); this
// asserts the wiring — a synthesized two-finger spread enlarges the pane, and the
// zoom resets when the overlay closes so no enlarged state leaks to the next open.

async function openParentCenter(page: Page) {
  const modal = page.locator('#parentHelpModal');
  await expect(async () => {
    if (!(await modal.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 });
    }
    await expect(modal).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });
}

// Read the inline CSS `zoom` the action sets (blank/absent ⇒ normal size ⇒ 1).
async function paneZoom(page: Page): Promise<number> {
  return page.locator('.pc-zoom').evaluate((el) => {
    const z = (el as HTMLElement).style.zoom;
    return z === '' ? 1 : Number(z);
  });
}

// Synthesize a two-finger pinch on the scroll pane: two touch pointers land
// close together, then spread apart by `factor`, which the action turns into a
// proportional zoom.
async function pinchOutwards(page: Page, factor: number) {
  await page
    .locator('.pc-pane, .pc-scroll')
    .first()
    .evaluate((node, f) => {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (type: string, id: number, x: number, y: number) =>
        node.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          })
        );
      // Start 20px apart, centered on the pane.
      fire('pointerdown', 1, cx - 10, cy);
      fire('pointerdown', 2, cx + 10, cy);
      // Spread to 20*factor px apart.
      fire('pointermove', 1, cx - 10 * f, cy);
      fire('pointermove', 2, cx + 10 * f, cy);
      fire('pointerup', 1, cx - 10 * f, cy);
      fire('pointerup', 2, cx + 10 * f, cy);
    }, factor);
}

test('pinching the Parent Center pane enlarges it, and closing resets the zoom', async ({
  page,
}) => {
  await page.goto('/');
  await openParentCenter(page);

  // Starts at normal size.
  expect(await paneZoom(page)).toBe(1);

  // A 2× finger spread enlarges the reading content.
  await pinchOutwards(page, 2);
  expect(await paneZoom(page)).toBeGreaterThan(1);

  // Closing the overlay returns it to normal, so the next parent doesn't inherit
  // an enlarged pane.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#parentHelpModal')).toBeHidden();
  await openParentCenter(page);
  expect(await paneZoom(page)).toBe(1);
});
