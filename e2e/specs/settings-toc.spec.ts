import type { ElementHandle, Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// The wide Settings shell's table of contents: one continuously scrolling pane whose position drives
// the highlight in the sidebar, and a sidebar whose taps drive that position. Everything here runs
// on the default desktop window, where the section column already overflows.

// The settings activity dots start on the sixth session, so five finished ones are seeded.
const ACTIVITY_SESSIONS_KEY = 'splotch-settings-activity-session-count';
const SEEDED_SESSIONS = '5';
// A section's heading lands this near the top of the pane when a tap jumps to it.
const SECTION_LANDED_MAX_PX = 24;
// The reading line sits between these two distances under the pane's top edge: a section parked
// above the first is current, one parked below the second is not yet.
const ABOVE_READING_LINE_PX = 118;
const BELOW_READING_LINE_PX = 142;
const JUMP_SETTLE_MS = 1_500;
const GLIDE_MIN_POSITIONS = 3;
// One attempt of a retried step, short enough that the retry loop gets several.
const RETRY_STEP_MS = 1_000;

const navRow = (nav: Locator, section: string) =>
  nav.getByRole('button', { name: new RegExp(`^${section}`) });

async function openWideSettings(page: Page) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [ACTIVITY_SESSIONS_KEY, SEEDED_SESSIONS]
  );
  await openDrawingScreen(page);
  const dialog = await openSettings(page);
  const nav = dialog.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav).toBeVisible();
  const pane = await dialog.getByTestId('scroll-cue').evaluateHandle((cue) => {
    const found = [...(cue.parentElement?.querySelectorAll('*') ?? [])].find((element) =>
      /(auto|scroll)/.test(getComputedStyle(element).overflowY)
    );
    if (!found) throw new Error('The pane has no scroller');
    return found;
  });
  return { dialog, nav, pane: pane as ElementHandle<HTMLElement> };
}

// react-native-web gives its scrollers an RN-style scrollTo, so the position is set directly.
function scrollPaneTo(pane: ElementHandle<HTMLElement>, position: 'top' | 'end') {
  return pane.evaluate((node, target) => {
    node.scrollTop = target === 'end' ? node.scrollHeight : 0;
  }, position);
}

// Parks a section's top edge an exact distance under the pane's top edge, so a case states where
// the reading line is rather than where some arbitrary scroll offset landed.
function parkSection(pane: ElementHandle<HTMLElement>, section: string, offsetPx: number) {
  return pane.evaluate(
    (node, { section, offsetPx }) => {
      const heading = [...node.querySelectorAll('h3')].find(
        (candidate) => candidate.textContent === section
      );
      const region = heading?.closest('section, [role="region"]');
      if (!region) throw new Error(`No ${section} section`);
      node.scrollTop +=
        region.getBoundingClientRect().top - node.getBoundingClientRect().top - offsetPx;
    },
    { section, offsetPx }
  );
}

function headingOffset(pane: ElementHandle<HTMLElement>, section: string) {
  return pane.evaluate((node, name) => {
    const heading = [...node.querySelectorAll('h3')].find(
      (candidate) => candidate.textContent === name
    );
    if (!heading) throw new Error(`No ${name} heading`);
    return heading.getBoundingClientRect().top - node.getBoundingClientRect().top;
  }, section);
}

test('the first section is seen on open and a selected one clears its dot', async ({ page }) => {
  const { nav } = await openWideSettings(page);

  await expect(navRow(nav, 'Appearance')).toHaveAccessibleName('Appearance');
  await expect(navRow(nav, 'AI Art')).toHaveAccessibleName('AI Art, new');

  await navRow(nav, 'AI Art').click();

  await expect(navRow(nav, 'AI Art')).toHaveAccessibleName('AI Art');
  await expect(navRow(nav, 'AI Art')).toHaveAttribute('aria-current', 'location');
});

test('a distant jump leaves the sections it passes unseen', async ({ page }) => {
  const { nav } = await openWideSettings(page);

  await navRow(nav, 'AI Art').click();
  await expect(navRow(nav, 'AI Art')).toHaveAttribute('aria-current', 'location');

  for (const section of ['Sound', 'Tool Drawer', 'Coloring'])
    await expect(navRow(nav, section)).toHaveAccessibleName(`${section}, new`);
});

test('scrolling the pane marks the section it elects as seen', async ({ page }) => {
  const { nav, pane } = await openWideSettings(page);

  // The pane measures its sections as they mount, so the park is retried until the reading line
  // has the heights it needs.
  await expect(async () => {
    await parkSection(pane, 'Tool Drawer', ABOVE_READING_LINE_PX);
    await expect(navRow(nav, 'Tool Drawer')).toHaveAttribute('aria-current', 'location', {
      timeout: RETRY_STEP_MS,
    });
  }).toPass();
  await expect(navRow(nav, 'Tool Drawer')).toHaveAccessibleName('Tool Drawer');
});

test('a jump scrolls the pane and never the card itself', async ({ page }) => {
  const { dialog, nav, pane } = await openWideSettings(page);
  // The header and its Close button stay inside the card; a jump that scrolled the card would drag
  // them out of its top, with nothing else in the window the wiser.
  const chromeInsideCard = () =>
    dialog.evaluate((node) => {
      const card = node.getBoundingClientRect();
      return [...node.querySelectorAll('h2, button[aria-label="Close"]')].every(
        (element) => element.getBoundingClientRect().top >= card.top - 0.5
      );
    });
  expect(await chromeInsideCard()).toBe(true);

  await navRow(nav, 'Coloring').click();

  await expect.poll(() => headingOffset(pane, 'Coloring')).toBeLessThan(SECTION_LANDED_MAX_PX);
  expect(await chromeInsideCard()).toBe(true);
});

test('the last section is highlighted at the very bottom of the pane', async ({ page }) => {
  const { nav, pane } = await openWideSettings(page);

  await scrollPaneTo(pane, 'end');

  // The final section is usually too short to reach the reading line on its own, so the end of the
  // scroll is what elects it.
  await expect(navRow(nav, 'About')).toHaveAttribute('aria-current', 'location');
  await expect(nav.locator('[aria-current="location"]')).toHaveCount(1);
});

// A tap can only highlight a row already on screen; the pane's scroll can elect one the parent never
// scrolled the column to. The column overflows on every window shorter than about 800px, this one
// included, so a highlight nobody brings back is simply invisible.
test('a highlight the pane elected is scrolled into the section column', async ({ page }) => {
  const { nav, pane } = await openWideSettings(page);
  const column = (row: Locator) =>
    row.evaluateHandle((node) => {
      const scroller = [...document.querySelectorAll('[role="dialog"] *')]
        .filter(
          (candidate) =>
            candidate.contains(node) && /(auto|scroll)/.test(getComputedStyle(candidate).overflowY)
        )
        .at(-1);
      if (!scroller) throw new Error('The section row has no scrolling column');
      return scroller;
    });
  const about = navRow(nav, 'About');
  const sectionColumn = await column(about);
  expect(await sectionColumn.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

  await scrollPaneTo(pane, 'end');

  await expect(about).toHaveAttribute('aria-current', 'location');
  await expect
    .poll(() =>
      about.evaluate((row, scroller) => {
        const [rowBox, columnBox] = [row.getBoundingClientRect(), scroller.getBoundingClientRect()];
        return rowBox.top >= columnBox.top - 0.5 && rowBox.bottom <= columnBox.bottom + 0.5;
      }, sectionColumn)
    )
    .toBe(true);
});

// The highlight has to flip as a section approaches the reading position, not after it has scrolled
// away. Bracketed rather than pinned to the exact inset, so retuning inside the band stays a design
// decision.
test('the reading line sits inside the 120-140px band', async ({ page }) => {
  const { nav, pane } = await openWideSettings(page);

  await expect(async () => {
    await parkSection(pane, 'Tool Drawer', BELOW_READING_LINE_PX);
    await expect(navRow(nav, 'Sound')).toHaveAttribute('aria-current', 'location', {
      timeout: RETRY_STEP_MS,
    });
  }).toPass();
  await expect(navRow(nav, 'Tool Drawer')).not.toHaveAttribute('aria-current', 'location');

  await expect(async () => {
    await parkSection(pane, 'Tool Drawer', ABOVE_READING_LINE_PX);
    await expect(navRow(nav, 'Tool Drawer')).toHaveAttribute('aria-current', 'location', {
      timeout: RETRY_STEP_MS,
    });
  }).toPass();
});

// The pane travels thousands of pixels on a jump, so it glides rather than teleports, and it honours
// a parent who asked the system for less motion.
function scrollPositionsDuringJump(pane: ElementHandle<HTMLElement>) {
  return pane.evaluate(
    (node, settleMs) =>
      new Promise<number[]>((resolve) => {
        const seen = new Set<number>();
        const record = () => seen.add(Math.round(node.scrollTop));
        node.addEventListener('scroll', record);
        setTimeout(() => {
          node.removeEventListener('scroll', record);
          resolve([...seen]);
        }, settleMs);
      }),
    JUMP_SETTLE_MS
  );
}

test('a jump glides through intermediate scroll positions', async ({ page }) => {
  const { nav, pane } = await openWideSettings(page);

  const recording = scrollPositionsDuringJump(pane);
  await navRow(nav, 'About').click();

  expect((await recording).length).toBeGreaterThan(GLIDE_MIN_POSITIONS);
});

test('a jump under reduced motion lands in one step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { nav, pane } = await openWideSettings(page);

  const recording = scrollPositionsDuringJump(pane);
  await navRow(nav, 'About').click();

  expect(await recording).toHaveLength(1);
});
