import { expect, test, type Page } from '@playwright/test';
import { SECTIONS } from '../src/routes/privacy/contents';
import { SITE_ORIGIN } from '../src/lib/siteUrl';

import {
  expectBottomedPanelScrollsRowToPin,
  expectContentsPanelCappedInsideViewport,
  openHydratedContents,
  pinContentsRow,
} from './contents-helpers';

// The privacy policy's contents rail and disclosure reuse the changelog's
// treatment; these specs cover the wiring this page owns — that the contents
// list, the section ids, and the section headings are one agreeing list, that
// the scrollspy reports the section being read, and where a picked section
// lands. The policy's *sentences* are pinned elsewhere, by
// tools/mobile/tests/privacy-consistency.test.mjs.

function renderedSections(page: Page) {
  return page.locator('.sections section').evaluateAll((sections) =>
    sections.map((section) => ({
      id: section.id,
      heading: section.querySelector('h3')?.textContent?.trim() ?? '',
    }))
  );
}

test('the contents rail links every section by its own heading', async ({ page }) => {
  await page.goto('/privacy');

  // Rendered section ids must agree with the heading and contents metadata.
  const sections = await renderedSections(page);
  expect(sections.length).toBeGreaterThan(0);

  const contents = page.getByRole('navigation', { name: 'Privacy policy contents' });
  await expect(contents.getByRole('link')).toHaveCount(sections.length);
  for (const section of sections) {
    await expect(contents.getByRole('link', { name: section.heading })).toHaveAttribute(
      'href',
      `#${section.id}`
    );
    await expect(page.locator(`#${section.id} .section-anchor`)).toHaveAttribute(
      'href',
      `#${section.id}`
    );
    await expect(page.locator(`#${section.id} .section-anchor`)).toHaveAccessibleName(
      `Copy link to “${section.heading}”`
    );
  }
});

test('copying a section link preserves the reading position and navigation history', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/feedback');
  await page.getByRole('link', { name: 'privacy policy', exact: true }).click();
  const section = SECTIONS[0];
  const anchor = page.locator(`#${section.id} .section-anchor`);
  await anchor.scrollIntoViewIfNeeded();
  await anchor.hover();
  const before = await page.evaluate(() => ({
    scroll: scrollY,
    historyLength: history.length,
    state: history.state,
  }));
  await expect(async () => {
    await anchor.click();
    await expect(page.getByRole('status')).toHaveText(`Link to “${section.label}” copied.`);
  }).toPass();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${SITE_ORIGIN}/privacy#${section.id}`
  );
  expect(
    await page.evaluate(() => ({
      scroll: scrollY,
      historyLength: history.length,
      state: history.state,
    }))
  ).toEqual(before);
  await expect(page).toHaveURL(new RegExp(`#${section.id}$`));
  await expect(anchor.locator('[data-icon="check"]')).toBeVisible();
  await expect(anchor).not.toHaveClass(/copied/);
  await page.goBack();
  await expect(page).toHaveURL(/\/feedback$/);
});

for (const clipboard of ['missing', 'rejected'] as const) {
  test(`section links fall back to fragment navigation when the clipboard is ${clipboard}`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'missing' ? undefined : { writeText: () => Promise.reject(new Error('Denied')) },
      });
    }, clipboard);
    await page.goto('/privacy');
    const section = SECTIONS[2];
    const anchor = page.locator(`#${section.id} .section-anchor`);
    await anchor.hover();
    await anchor.click();
    await expect(page).toHaveURL(new RegExp(`#${section.id}$`));
    await expect(page.getByRole('status')).toBeEmpty();
    await expect(anchor).not.toHaveClass(/copied/);
  });
}

test('a rejected recopy navigates to a section already named in the URL', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await page.goto('/privacy#counting');
  const section = SECTIONS[2];
  const anchor = page.locator(`#${section.id} .section-anchor`);
  await expect(async () => {
    await anchor.click();
    await expect(page.getByRole('status')).toHaveText(`Link to “${section.label}” copied.`);
  }).toPass();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Denied'));
    scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await anchor.dispatchEvent('click', { button: 0 });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test('the desktop section-link hit area stays outside the contents rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/privacy');
  const rail = await page.locator('.contents-rail').boundingBox();
  const anchor = await page.locator('.section-anchor').first().boundingBox();
  expect(rail).not.toBeNull();
  expect(anchor).not.toBeNull();
  expect(anchor!.x).toBeGreaterThanOrEqual(rail!.x + rail!.width);
});

test('section links reveal on keyboard focus with a full size focus ring', async ({ page }) => {
  await page.goto('/privacy');
  const anchor = page.locator('.section-anchor').first();
  await page.mouse.move(0, 0);
  await expect(anchor).toHaveCSS('opacity', '0');
  await anchor.focus();
  await expect(anchor).toHaveCSS('opacity', '1');
  await expect(anchor).toHaveCSS('outline-style', 'solid');
  const box = await anchor.boundingBox();
  expect(box?.width).toBe(44);
  expect(box?.height).toBe(44);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(anchor).toHaveCSS('transition-duration', '0s');
});

test.describe('touch section links', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('section links remain visible after headings without overflowing', async ({ page }) => {
    await page.goto('/privacy');
    const anchor = page.locator('.section-anchor').first();
    await expect(anchor).toHaveCSS('opacity', '1');
    const boxes = await page
      .locator('.section-head')
      .first()
      .evaluate((head) => ({
        heading: head.querySelector('h3')!.getBoundingClientRect().right,
        anchor: head.querySelector('a')!.getBoundingClientRect().left,
      }));
    expect(boxes.anchor).toBeGreaterThan(boxes.heading);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

test('the contents rail marks the section being read', async ({ page }) => {
  // The rail indicates a reading position, not the last thing clicked.
  await page.goto('/privacy');

  const sections = await renderedSections(page);
  const contents = page.getByRole('navigation', { name: 'Privacy policy contents' });

  // Seeded to the first section, so the rail is never blank at the top.
  await expect(contents.getByRole('link', { name: sections[0].heading })).toHaveAttribute(
    'aria-current',
    'location'
  );

  // The last section is reachable only because the page reserves scroll room
  // under it; without the reserve the scroll clamps below the spy line.
  const last = sections[sections.length - 1];
  await page.locator(`#${last.id}`).evaluate((section) => section.scrollIntoView());
  await expect(contents.getByRole('link', { name: last.heading })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await expect(contents.locator('[aria-current]')).toHaveCount(1);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The collapsed row is the phone's whole scrollspy: with no rail on screen it
  // is the only thing reporting position, and it answers "what's here" before
  // the reader has entered the details and "where am I" after — symmetrically,
  // so scrolling back to the top returns it to the count.
  test('the contents row counts the sections at the top and names the one being read', async ({
    page,
  }) => {
    await page.goto('/privacy');

    const sections = await renderedSections(page);
    const row = page.locator('.contents-disclosure summary');
    await expect(row).toContainText(`${sections.length} sections`);

    const last = sections[sections.length - 1];
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(row).toContainText(last.heading);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(row).toContainText(`${sections.length} sections`);
  });

  test('picking a section from the contents lands it clear of the pinned row', async ({ page }) => {
    await page.goto('/privacy');

    const sections = await renderedSections(page);
    const target = sections[Math.floor(sections.length / 2)];
    const contents = page.locator('.contents-disclosure');

    await openHydratedContents(contents);
    await contents.getByRole('link', { name: target.heading }).click();
    await expect(contents.locator('details')).not.toHaveAttribute('open');

    // Bounded on both sides: under the row is a heading parked out of sight,
    // and a screenful below it is the undershoot that jumping while the panel
    // is still in the flow produces.
    const gapBelowRow = () =>
      page.evaluate((id) => {
        const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
        const section = document.getElementById(id)!.getBoundingClientRect();
        return Math.round(section.top - row.bottom);
      }, target.id);
    await expect.poll(gapBelowRow).toBeLessThanOrEqual(48);
    expect(await gapBelowRow()).toBeGreaterThanOrEqual(0);
    await expect(contents.locator('summary')).toContainText(target.heading);

    // The narrow pick has to leave the same trace the wide rail's anchor does,
    // or the section can't be shared and Back doesn't undo the jump.
    await expect(page).toHaveURL(new RegExp(`#${target.id}$`));
  });
});

// The native builds ship this route as a static privacy.html, so the whole
// policy has to exist in the prerendered document, not arrive with hydration.
test('the complete policy is present in prerendered HTML', async ({ page, request }) => {
  await page.goto('/privacy');
  const sections = await renderedSections(page);
  expect(sections.length).toBeGreaterThan(0);

  const response = await request.get('/privacy');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  for (const section of sections) {
    expect(html).toContain(`id="${section.id}"`);
    expect(html).toContain(section.heading);
  }
});

// A landscape phone is where the list most outruns the room under the row. The
// cap is a CSS declaration (100dvh less the pinned block's own offsets), so it
// holds before hydration too; this pins the arithmetic — a host inset left out
// of it would hang the panel past the viewport.
test.describe('phone landscape', () => {
  test.use({ viewport: { width: 812, height: 375 } });

  test('the open contents panel scrolls inside itself, bottom edge on screen', async ({ page }) => {
    await page.goto('/privacy');
    const contents = page.locator('.contents-disclosure');
    await pinContentsRow(contents);
    await openHydratedContents(contents);
    await expectContentsPanelCappedInsideViewport(contents);
  });

  // Opened before the row has pinned, the panel overshoots the fold; a scroll
  // that bottoms it has to carry the row to its pin rather than stop there.
  test('a panel opened below its pin scrolls the row into it', async ({ page }) => {
    await page.goto('/privacy');
    const contents = page.locator('.contents-disclosure');
    await openHydratedContents(contents);
    await expectBottomedPanelScrollsRowToPin(page, contents);
  });
});

// Paragraph widths to sweep: from a narrow phone column to past the policy's own
// measure, fine enough that each link's last word lands at a line end somewhere.
const WRAP_SWEEP_MIN_PX = 160;
const WRAP_SWEEP_MAX_PX = 520;
const WRAP_SWEEP_STEP_PX = 2;

test('an outbound link never strands its external mark on a line of its own', async ({ page }) => {
  // The mark's word joiner is all that binds the blob to the label's last word;
  // without it Chromium breaks between them at about one width in fifteen.
  await page.goto('/privacy');
  const marks = page.locator('.sections a[target] [data-external-mark]');
  await expect(marks.first()).toBeAttached();

  const stranded = await marks.evaluateAll(
    (nodes, sweep) =>
      nodes.flatMap((node) => {
        const label = node.previousSibling;
        const paragraph = node.closest('p');
        const blob = node.querySelector('[data-icon="external"]');
        if (!label || !paragraph || !blob) return [`unmeasurable mark: ${node.outerHTML}`];
        const lastChar = (label.textContent ?? '').trimEnd().length - 1;
        const range = document.createRange();
        range.setStart(label, lastChar);
        range.setEnd(label, lastChar + 1);
        const failures: string[] = [];
        for (let width = sweep.min; width <= sweep.max; width += sweep.step) {
          paragraph.style.width = `${width}px`;
          const word = [...range.getClientRects()].at(-1);
          const mark = blob.getBoundingClientRect();
          if (!word || mark.top >= word.bottom || mark.bottom <= word.top) {
            failures.push(`${label.textContent?.trim()} at ${width}px`);
          }
        }
        paragraph.style.width = '';
        return failures;
      }),
    { min: WRAP_SWEEP_MIN_PX, max: WRAP_SWEEP_MAX_PX, step: WRAP_SWEEP_STEP_PX }
  );
  expect(stranded).toEqual([]);
});

test('copying a sentence leaves out the external mark but its link still announces it', async ({
  page,
}) => {
  await page.goto('/privacy');
  const link = page.getByRole('link', {
    name: 'OpenAI Services Agreement (opens outside Splotch)',
    exact: true,
  });
  await expect(link).toBeVisible();

  const copied = await link.evaluate((anchor) => {
    const range = document.createRange();
    range.selectNodeContents(anchor.closest('p') ?? anchor);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    return getSelection()?.toString() ?? '';
  });
  expect(copied).toContain('OpenAI Services Agreement');
  expect(copied).not.toContain('opens outside Splotch');
});
