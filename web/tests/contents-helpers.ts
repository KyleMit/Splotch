import { expect, type Locator, type Page } from '@playwright/test';

const DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS = 1000;
const DISCLOSURE_PICK_TIMEOUT_MS = 10_000;

// Open a TocDisclosure (the narrow-screen contents row on /design and
// /changelog) and prove it is hydrated before returning. The <details> toggles
// natively, so the panel opens before the component's delegated pick handler
// exists — a row activated inside that window gets the browser's own anchor
// jump, the hazard TocDisclosure.svelte documents as accepted rather than
// fixed. The panel's `data-armed` is the hydration proof: the component wears
// it only while its own state holds the panel open and the handler is attached,
// so a natively opened <details> never passes. The open itself retries
// because hydration reconciles the natively-opened <details> back to the
// component's closed state, swallowing an early click.
export async function openHydratedContents(contents: Locator) {
  const panel = contents.locator('.panel');
  await expect(async () => {
    if (!(await panel.isVisible().catch(() => false))) {
      await contents.locator('summary').click({ timeout: DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS });
    }
    await expect(panel).toHaveAttribute('data-armed', '', {
      timeout: DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS,
    });
  }).toPass({ timeout: DISCLOSURE_PICK_TIMEOUT_MS });
}

// Scroll a TocDisclosure row to its pinned position before opening it. The
// panel's cap assumes the row is pinned; opened earlier, while the row still
// sits below the hero, the cap is deliberately generous (TocDisclosure.svelte),
// so a spec about the cap has to pin first.
export async function pinContentsRow(contents: Locator) {
  await contents.evaluate((node) => node.scrollIntoView({ block: 'start' }));
}

// The open contents panel on a viewport too short for its list: capped to the
// room under its pinned row, so its bottom edge stays on screen and the rest of
// the list is reached by scrolling the panel, never the page.
export async function expectContentsPanelCappedInsideViewport(contents: Locator) {
  const panel = contents.locator('.panel');
  await expect
    .poll(() => panel.evaluate((node) => node.scrollHeight - node.clientHeight), {
      message: 'the list has to outrun the panel for this to test anything',
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      panel.evaluate((node) => Math.round(node.getBoundingClientRect().bottom - window.innerHeight))
    )
    .toBeLessThanOrEqual(0);
}

// The other way a contents panel gets opened: before its row has scrolled to
// its pin, sitting below the hero, where the cap (sized for the pinned row)
// overshoots the fold. Scrolling the panel to its end and then some has to
// chain to the document and carry the row to its pin, at which point the
// panel fits and its last row is on screen. Containment on the panel would
// swallow that scroll and strand the last rows below the viewport.
export async function expectBottomedPanelScrollsRowToPin(page: Page, contents: Locator) {
  const panel = contents.locator('.panel');
  await expect
    .poll(() =>
      panel.evaluate((node) => Math.round(node.getBoundingClientRect().bottom - window.innerHeight))
    )
    .toBeGreaterThan(0);
  const box = (await panel.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 40, box.y + box.height / 2));
  await expect(async () => {
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(
      await panel.evaluate((node) => node.getBoundingClientRect().bottom - window.innerHeight)
    ).toBeLessThanOrEqual(0);
  }).toPass();
  await expect(contents.getByRole('link').last()).toBeInViewport();
}
