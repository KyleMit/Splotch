import { expect, test, type Page } from '@playwright/test';

import {
  activeNavRowInsideColumn,
  gotoApp,
  headingOffsetFromPaneTop,
  openSettingsModal,
  seedCompletedSettingsActivitySessions,
  SECTION_LANDED_MAX_PX,
} from './helpers';

// The wide Settings shell's table of contents (ADR-0061): one continuously
// scrolling pane whose position drives the sidebar highlight, and a sidebar
// whose clicks drive that position. Everything here runs on the default desktop
// viewport, where the section column already overflows.

const ABOVE_SCROLLSPY_BAND_PX = 118;
const BELOW_SCROLLSPY_BAND_PX = 142;

// Park a section's heading an exact distance below the pane's top edge, so a
// spec can state where the scrollspy's reading line is rather than where some
// arbitrary scroll offset happened to land.
async function parkHeadingBelowPaneTop(page: Page, section: string, offsetPx: number) {
  await page.locator('.settings-pane').evaluate(
    (pane, { section, offsetPx }) => {
      const el = pane.querySelector(`.settings-section[data-section="${section}"]`)!;
      pane.scrollTop +=
        el.getBoundingClientRect().top - pane.getBoundingClientRect().top - offsetPx;
    },
    { section, offsetPx }
  );
}

test('the default section is seen on open and a selected section clears before highlighting', async ({
  page,
}) => {
  await seedCompletedSettingsActivitySessions(page, 5);
  await gotoApp(page);
  await openSettingsModal(page);

  const nav = page.locator('.settings-nav');
  const appearance = nav.locator('.toc-row[data-section="appearance"]');
  const ai = nav.locator('.toc-row[data-section="ai"]');
  await expect(appearance.locator('.section-activity-dot')).not.toHaveClass(/unseen/);
  await expect(appearance).not.toHaveAccessibleName(/new/);
  await expect(ai.locator('.section-activity-dot')).toHaveClass(/unseen/);
  await expect(ai).toHaveAccessibleName(/AI Art.*new/);

  await ai.click();

  await expect(ai.locator('.section-activity-dot')).not.toHaveClass(/unseen/);
  await expect(ai.locator('.section-activity-dot')).toHaveCSS('opacity', '0');
  await expect(ai).toHaveClass(/active/);
  expect(await ai.evaluate((row) => getComputedStyle(row).transitionDelay)).toContain('0.2s');
});

test('a distant nav jump leaves intermediate sections unseen', async ({ page }) => {
  await seedCompletedSettingsActivitySessions(page, 5);
  await gotoApp(page);
  await openSettingsModal(page);

  const nav = page.locator('.settings-nav');
  await nav.locator('.toc-row[data-section="ai"]').click();
  await expect(nav.locator('.toc-row[data-section="ai"]')).toHaveClass(/active/);

  for (const section of ['sound', 'controls', 'coloring']) {
    await expect(
      nav.locator(`.toc-row[data-section="${section}"] .section-activity-dot`)
    ).toHaveClass(/unseen/);
  }
});

test('scrolling the pane marks the elected section seen', async ({ page }) => {
  await seedCompletedSettingsActivitySessions(page, 5);
  await gotoApp(page);
  await openSettingsModal(page);

  const controls = page.locator('.settings-nav .toc-row[data-section="controls"]');
  await parkHeadingBelowPaneTop(page, 'controls', ABOVE_SCROLLSPY_BAND_PX);

  await expect(controls).toHaveClass(/active/);
  await expect(controls.locator('.section-activity-dot')).not.toHaveClass(/unseen/);
});

test('a jump scrolls the pane and never the card itself', async ({ page }) => {
  // `scrollIntoView` moves every scrollable ancestor, and both the card and the
  // dialog are `overflow: hidden` boxes — so a jump built on it dragged the
  // Settings header and the close button clean out of the top of the card, with
  // nothing in the suite the wiser. Read off the card's own edge rather than
  // pixel literals.
  await gotoApp(page);
  const modal = await openSettingsModal(page);

  const chromeInsideCard = () =>
    modal.evaluate((dialog) => {
      const card = dialog.getBoundingClientRect();
      const top = (selector: string) => dialog.querySelector(selector)!.getBoundingClientRect().top;
      return Math.min(top('.settings-header'), top('.settings-close')) >= card.top - 0.5;
    });

  // The landing scroll every open performs is enough to break this on its own.
  expect(await chromeInsideCard()).toBe(true);

  await page.locator('.settings-nav').getByRole('button', { name: 'Coloring' }).click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'coloring'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);
  expect(await chromeInsideCard()).toBe(true);
});

test('scrolling to the very bottom highlights the last section', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  const nav = page.locator('.settings-nav');
  await page.locator('.settings-pane').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

  // The final section is usually too short to reach the reading line on its own,
  // so the end of the scroll is what elects it.
  await expect(nav.locator('.toc-row').last()).toHaveClass(/active/);
  await expect(nav.locator('.toc-row.active')).toHaveCount(1);
});

test('a highlight the pane elected is scrolled into the column', async ({ page }) => {
  // A click can only ever highlight a row already on screen; the pane's scroll
  // can elect one the parent never scrolled the column to. The column overflows
  // on every viewport shorter than ~800px, this one included, so a highlight
  // nobody brings back is simply invisible.
  await gotoApp(page);
  await openSettingsModal(page);

  const nav = page.locator('.settings-nav');
  expect(await nav.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.locator('.settings-pane').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

  await expect(nav.locator('.toc-row').last()).toHaveClass(/active/);
  await expect.poll(() => activeNavRowInsideColumn(page)).toBe(true);
});

test('the scrollspy reading line sits inside the 120-140px band', async ({ page }) => {
  // The issue names the band and the reason for it: the highlight has to flip as
  // a heading approaches the reading position, not after it has scrolled away.
  // Bracketed rather than pinned to the exact inset, so retuning inside the band
  // stays a design decision — a heading parked above the band's floor must be
  // current, one parked below its ceiling must not be.
  await gotoApp(page);
  await openSettingsModal(page);
  const nav = page.locator('.settings-nav');

  await parkHeadingBelowPaneTop(page, 'controls', BELOW_SCROLLSPY_BAND_PX);
  await expect(nav.getByRole('button', { name: 'Sound' })).toHaveClass(/active/);
  await expect(nav.getByRole('button', { name: 'Tool Drawer' })).not.toHaveClass(/active/);

  await parkHeadingBelowPaneTop(page, 'controls', ABOVE_SCROLLSPY_BAND_PX);
  await expect(nav.getByRole('button', { name: 'Tool Drawer' })).toHaveClass(/active/);
});

// The pane travels thousands of pixels on a jump, so it glides rather than
// teleports — and honours a parent who asked the OS for less motion, which
// Chrome does not do for programmatic smooth scrolls on its own.
async function scrollStepsDuringJump(page: Page, section: string) {
  return page.evaluate(
    ({ section, settleMs }) =>
      new Promise<number[]>((resolve) => {
        const pane = document.querySelector('.settings-pane')!;
        const steps: number[] = [];
        const record = () => steps.push(pane.scrollTop);
        pane.addEventListener('scroll', record);
        document.querySelector<HTMLElement>(`.settings-nav [data-section="${section}"]`)!.click();
        setTimeout(() => {
          pane.removeEventListener('scroll', record);
          resolve(steps);
        }, settleMs);
      }),
    { section, settleMs: 1500 }
  );
}

test('a jump glides through intermediate scroll positions', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  const steps = await scrollStepsDuringJump(page, 'about');
  expect(steps.length).toBeGreaterThan(3);
  expect(steps.at(-1)).toBeGreaterThan(steps[0]!);
});

test('a jump under reduced motion lands in one step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await openSettingsModal(page);

  const steps = await scrollStepsDuringJump(page, 'about');
  expect(steps).toHaveLength(1);
});
