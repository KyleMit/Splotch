import { expect, test } from '@playwright/test';

import releases from '../src/lib/releases.json' with { type: 'json' };
import { colorContrast } from '../src/lib/design/colorContrast';
import { SHORT_PAGE_HEIGHT_PX } from '../src/lib/breakpoints';

import {
  expectBottomedPanelScrollsRowToPin,
  expectContentsPanelCappedInsideViewport,
  openHydratedContents,
  pinContentsRow,
} from './contents-helpers';

test.describe('short touch screens', () => {
  test.use({ hasTouch: true });

  test('short screens compress the hero and open on release content', async ({ page }) => {
    for (const viewport of [
      { width: 956, height: 440 },
      { width: 812, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/changelog');
      await expect(page.locator('.lede')).toBeHidden();
      await expect(page.locator('.release').first().getByRole('heading').first()).toBeInViewport();
      const compactHeight = (await page.locator('.hero').boundingBox())!.height;
      await page.setViewportSize({ width: viewport.width, height: SHORT_PAGE_HEIGHT_PX + 1 });
      await expect(page.locator('.lede')).toBeVisible();
      expect((await page.locator('.hero').boundingBox())!.height).toBeGreaterThan(compactHeight);
    }
  });
});

test('short desktop viewports disclose the changelog introduction', async ({ page }) => {
  await page.setViewportSize({ width: 683, height: 360 });
  await page.goto('/changelog');
  await page.getByRole('button', { name: 'About this page' }).click();
  await expect(page.locator('.lede')).toBeVisible();
});

test('the changelog lede keeps its closing phrase together', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/changelog');
  await page.evaluate(() => document.fonts.ready);
  const phraseLines = await page.locator('.lede').evaluate((lede) => {
    const text = [...lede.childNodes].find((node) => node.textContent?.includes('shipped'))!;
    const start = text.textContent!.indexOf('shipped');
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, text.textContent!.trimEnd().length);
    return range.getClientRects().length;
  });
  expect(phraseLines).toBe(1);
});

test('the changelog renders every release with its notes', async ({ page }) => {
  await page.goto('/changelog');

  await page.locator('.release-older summary').click();
  const history = page.locator('.release-history');
  await expect(history.locator('.release')).toHaveCount(releases.length);
  for (const release of releases) {
    const article = history.locator(`#${release.id}`);
    await expect(
      article.getByRole('heading', { name: `Version ${release.version}` })
    ).toBeVisible();
    await expect(article.locator('.release-notes li').first()).toBeVisible();
  }
});

test('the changelog table of contents links to every release', async ({ page }) => {
  await page.goto('/changelog');

  const contents = page.getByRole('navigation', { name: 'Changelog contents' });
  await expect(contents.getByRole('link')).toHaveCount(releases.length);
  for (const release of releases) {
    await expect(
      contents.getByRole('link', { name: `Version ${release.version}` })
    ).toHaveAttribute('href', `#${release.id}`);
  }
});

test('the contents rail marks the release being read', async ({ page }) => {
  // The rail has to indicate a reading position, not the last thing clicked —
  // marking a click target is the one thing this treatment is chosen not to do.
  await page.goto('/changelog');

  const contents = page.getByRole('navigation', { name: 'Changelog contents' });
  const railLink = (version: string) => contents.getByRole('link', { name: `Version ${version}` });

  // Seeded to the newest release, so the rail is never blank at the top.
  await expect(railLink(releases[0].version)).toHaveAttribute('aria-current', 'location');

  // The oldest release: nothing below it, so the release the reading line lands
  // in is unambiguous however tall any one release's notes happen to be.
  await page.locator('.release-older summary').click();
  const oldest = releases[releases.length - 1];
  await page.locator(`#${oldest.id}`).evaluate((article) => article.scrollIntoView());
  await expect(railLink(oldest.version)).toHaveAttribute('aria-current', 'location');
  await expect(contents.locator('[aria-current]')).toHaveCount(1);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the contents collapses behind one row so the newest release clears the fold', async ({
    page,
  }) => {
    await page.goto('/changelog');

    const contents = page.locator('.contents-disclosure');
    // The count is derived from the manifest, never written into the copy.
    await expect(contents.locator('summary')).toContainText(`${releases.length} releases`);
    await expect(
      page.getByRole('heading', { name: `Version ${releases[0].version}` })
    ).toBeInViewport();

    // It is only ever opened deliberately, and then it carries every anchor.
    await openHydratedContents(contents);
    await expect(contents.getByRole('link')).toHaveCount(releases.length);
  });

  // The collapsed row is the phone's whole scrollspy: with no rail on screen it
  // is the only thing reporting position, and it has to answer "what's here"
  // before the reader has gone anywhere and "where am I" after — symmetrically,
  // so scrolling back to the hero returns it to the count.
  test('the contents row counts the releases at the hero and names the one being read', async ({
    page,
  }) => {
    await page.goto('/changelog');
    const row = page.locator('.contents-disclosure summary');
    await expect(row).toContainText(`${releases.length} releases`);

    // The oldest release, at max scroll: nothing follows it, so it is the one a
    // spy keyed on "has it climbed into the band" can only reach if the page
    // reserves room under it.
    await page.locator('.release-older summary').click();
    const oldest = releases[releases.length - 1];
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(row).toContainText(`Version ${oldest.version}`);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(row).toContainText(`${releases.length} releases`);
  });

  // The row is in the flow above every release it links to, so the panel's
  // height has to leave the document before the target's position means
  // anything — jumping while open lands a full panel-height short.
  test('picking a release from the contents lands it clear of the pinned row', async ({ page }) => {
    await page.goto('/changelog');
    const contents = page.locator('.contents-disclosure');

    const target = releases[4];
    const targetLink = contents.getByRole('link', { name: `Version ${target.version}` });
    const targetUrl = new RegExp(`#${target.id}$`);
    await openHydratedContents(contents);
    await targetLink.click();
    await expect(contents.locator('details')).not.toHaveAttribute('open');
    await expect(page.locator('.release-older')).toHaveAttribute('open');
    await expect(page.locator(`#${target.id}`)).toHaveAttribute('data-arrived');

    // Bounded on both sides: under the row is a heading parked out of sight,
    // and a screenful below it is the undershoot that measuring the row where
    // it happens to sit — rather than where it comes to rest pinned — produces.
    const gapBelowRow = () =>
      page.evaluate((id) => {
        const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
        const release = document.getElementById(id)!.getBoundingClientRect();
        return Math.round(release.top - row.bottom);
      }, target.id);
    await expect.poll(gapBelowRow).toBeLessThanOrEqual(48);
    expect(await gapBelowRow()).toBeGreaterThanOrEqual(0);
    await expect(contents.locator('summary')).toContainText(`Version ${target.version}`);

    // The narrow pick has to leave the same trace the wide rail's anchor does,
    // or the release can't be shared and Back doesn't undo the jump.
    await expect(page).toHaveURL(targetUrl);
  });
});

// The jumps the contents doesn't compute for itself — a deep link, and the
// browser's own hash navigation — ride on scroll-margin-top, which below the
// breakpoint has a pinned row to clear rather than only the rail's offset. Only
// the narrow treatment can occlude a release; the wide rail is a side column.
test.describe('phone deep link', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('parks its release clear of the pinned contents row', async ({ page }) => {
    const target = releases[4];
    await page.goto(`/changelog#${target.id}`);

    await expect
      .poll(() =>
        page.evaluate((id) => {
          const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
          const release = document.getElementById(id)!.getBoundingClientRect();
          return Math.round(release.top - row.bottom);
        }, target.id)
      )
      .toBeGreaterThanOrEqual(0);
  });
});

test('the complete changelog is present in prerendered HTML', async ({ request }) => {
  const response = await request.get('/changelog');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();

  for (const release of releases) {
    expect(html).toContain(`id="${release.id}"`);
    expect(html).toContain(`Version ${release.version}`);
  }
});

// A landscape phone is where the list most outruns the room under the row. The
// cap is a CSS declaration (100dvh less the pinned block's own offsets), so it
// holds before hydration too; this pins the arithmetic — a host inset left out
// of it would hang the panel past the viewport.
test.describe('phone landscape', () => {
  test.use({ viewport: { width: 812, height: 375 } });

  test('the open contents panel scrolls inside itself, bottom edge on screen', async ({ page }) => {
    await page.goto('/changelog');
    const contents = page.locator('.contents-disclosure');
    await pinContentsRow(contents);
    await openHydratedContents(contents);
    await expectContentsPanelCappedInsideViewport(contents);
  });

  // Opened before the row has pinned, the panel overshoots the fold; a scroll
  // that bottoms it has to carry the row to its pin rather than stop there.
  test('a panel opened below its pin scrolls the row into it', async ({ page }) => {
    await page.goto('/changelog');
    const contents = page.locator('.contents-disclosure');
    await openHydratedContents(contents);
    await expectBottomedPanelScrollsRowToPin(page, contents);
  });
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`an initial folded link opens and lands at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const target = releases.at(-1)!;
    await page.goto(`/changelog#${target.id}`);
    await expect(page.locator('.release-older')).toHaveAttribute('open');
    await expect(page.locator(`#${target.id}`)).toHaveAttribute('data-arrived');
    await expect
      .poll(() =>
        page
          .locator(`#${target.id}`)
          .evaluate((article) => Math.round(article.getBoundingClientRect().top))
      )
      .toBeLessThanOrEqual(120);
    expect(
      await page.locator(`#${target.id}`).evaluate((article) => article.getBoundingClientRect().top)
    ).toBeGreaterThanOrEqual(0);
    await expect(page.locator(`#${target.id} h2`)).toBeInViewport();
  });
}

test('the older fold opens from keyboard and hands focus into the revealed history', async ({
  page,
  browserName,
}) => {
  await page.goto('/changelog');
  const summary = page.locator('.release-older summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(page.locator('.release-older')).toHaveAttribute('open');
  await expect(page.locator('.release-older h2').first()).toBeFocused();
  await expect(summary).toBeHidden();
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.locator('.back-to-top')).toBeFocused();
});

test('rail, hash and history navigation reveal and land before highlighting', async ({ page }) => {
  await page.goto('/changelog');
  const contents = page.getByRole('navigation', { name: 'Changelog contents' });
  const target = releases[4];
  await contents.getByRole('link', { name: `Version ${target.version}` }).click();
  await expect(page.locator(`#${target.id}`)).toHaveAttribute('data-arrived');
  await expect
    .poll(() =>
      page
        .locator(`#${target.id}`)
        .evaluate((article) => Math.round(article.getBoundingClientRect().top))
    )
    .toBe(24);
  const newest = releases[0];
  await contents.getByRole('link', { name: `Version ${newest.version}` }).click();
  await expect(page.locator(`#${newest.id}`)).toHaveAttribute('data-arrived');
  await page.goBack();
  await expect(page.locator(`#${target.id}`)).toHaveAttribute('data-arrived');
  await expect
    .poll(() =>
      page
        .locator(`#${target.id}`)
        .evaluate((article) => Math.round(article.getBoundingClientRect().top))
    )
    .toBe(24);
  await page.goForward();
  await expect(page.locator(`#${newest.id}`)).toHaveAttribute('data-arrived');
  await page.evaluate((id) => {
    window.location.hash = id;
  }, releases.at(-1)!.id);
  await expect(page.locator(`#${releases.at(-1)!.id}`)).toHaveAttribute('data-arrived');
  await expect(page.locator('[data-arrived]')).toHaveCount(1);
});

test('hydration fills relative dates while prerendered placeholders stay empty', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/changelog')).text();
  expect(html).not.toMatch(/class="release-ago"[^>]*>[^<]/);
  await page.goto('/changelog');
  await expect(page.locator('.release-latest')).toHaveText('Latest');
  await expect(page.locator('.release-latest')).toHaveCount(1);
  await expect(page.locator('.release-ago').first()).not.toHaveText('');
  await expect(page.locator('.release-ago').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(
    page.locator('.release').first().locator('.release-section-icon').first()
  ).toBeHidden();
  await expect(
    page.locator('.release').first().locator('.release-section-heading').first()
  ).toHaveCSS('clip-path', 'polygon(3% 0px, 100% 8%, 97% 100%, 0px 90%)');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the tape and active highlighter text hold AA contrast in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/changelog');
    await expect(page.locator('.release-ago').first()).not.toHaveText('');
    const samples = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const rgb = (fill: string, ground = 'white') => {
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r} ${g} ${b})`;
      };
      const tape = [
        ...document.querySelectorAll(
          '.release:first-child .release-section-heading, .release-latest'
        ),
      ].map((el) => {
        const style = getComputedStyle(el);
        return { text: el.textContent!, ink: rgb(style.color), ground: rgb(style.backgroundColor) };
      });
      const label = document.querySelector('.contents-rail .active [data-toc-label]')!;
      tape.push({
        text: 'active rail highlighter',
        ink: rgb(getComputedStyle(label).color),
        ground: rgb(
          getComputedStyle(label, '::before').backgroundColor,
          getComputedStyle(label).getPropertyValue('--page-sheet')
        ),
      });
      return tape;
    });
    const brandText = await page.locator('.contents-rail').evaluate((rail) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--brand-text)';
      rail.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(page.locator('.contents-rail .active .toc-meta')).toHaveCSS('color', brandText);
    expect(samples).toHaveLength(5);
    for (const sample of samples)
      expect(
        colorContrast(sample.ink, sample.ground, sample.ground),
        sample.text
      ).toBeGreaterThanOrEqual(4.5);
  });
}

test('rapid fragment changes leave only the latest arrival and reduced motion keeps it still', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/changelog');
  await expect(page.locator('.release-ago').first()).not.toHaveText('');
  await page.evaluate((id) => {
    window.location.hash = id;
  }, releases[4].id);
  const firstArrival = page.locator(`#${releases[4].id}`);
  await expect(firstArrival).toHaveAttribute('data-arrived');
  const timing = await firstArrival.evaluate((el) => {
    const style = getComputedStyle(el, '::after');
    return {
      cssLifetimeMs:
        (parseFloat(style.animationDuration) + parseFloat(style.animationDelay)) * 1000,
      ownerLifetimeMs: parseFloat(style.getPropertyValue('--release-arrival-duration')),
    };
  });
  expect(timing.cssLifetimeMs).toBe(timing.ownerLifetimeMs);
  expect(timing.ownerLifetimeMs).toBe(2400);
  const changedLifetimeMs = await firstArrival.evaluate((el) => {
    const host = el.closest<HTMLElement>('.releases')!;
    const original = host.style.getPropertyValue('--release-arrival-duration');
    host.style.setProperty('--release-arrival-duration', '3000ms');
    const style = getComputedStyle(el, '::after');
    const lifetime = Math.round(
      (parseFloat(style.animationDuration) + parseFloat(style.animationDelay)) * 1000
    );
    host.style.setProperty('--release-arrival-duration', original);
    return lifetime;
  });
  expect(changedLifetimeMs).toBe(3000);
  await page.evaluate(
    (ids) => {
      document.documentElement.setAttribute('data-reduce-motion', '');
      for (const id of ids) window.location.hash = id;
    },
    [releases[4].id, releases[6].id, releases[1].id]
  );
  const target = page.locator(`#${releases[1].id}`);
  await expect(target).toHaveAttribute('data-arrived');
  await expect(page.locator('[data-arrived]')).toHaveCount(1);
  expect(await target.evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe('none');
  await expect(target).not.toHaveAttribute('data-arrived');
});

test('forced colors keep both changelog chevrons visible against the system canvas', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/changelog');
  const canvasText = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'CanvasText';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  for (const selector of ['.older-icon svg', '.back-to-top .back-icon svg']) {
    const glyph = page.locator(selector);
    await expect(glyph).toBeVisible();
    await expect(glyph).toHaveCSS('fill', canvasText);
  }
});

test('picking the current rail release repeats arrival without adding a history entry', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const target = releases[3];
  await page.goto(`/changelog#${target.id}`);
  const article = page.locator(`#${target.id}`);
  await expect(article).toHaveAttribute('data-arrived');
  await expect(article).not.toHaveAttribute('data-arrived');
  const historyLength = await page.evaluate(() => history.length);
  await page
    .getByRole('navigation', { name: 'Changelog contents' })
    .getByRole('link', { name: `Version ${target.version}` })
    .click();
  await expect(article).toHaveAttribute('data-arrived');
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(await article.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(24);
  await expect
    .poll(() =>
      article.evaluate((el) =>
        el.hasAttribute('data-arrived') ? Number(getComputedStyle(el, '::after').opacity) : 1
      )
    )
    .toBeLessThan(0.9);
  await expect(article).toHaveAttribute('data-arrived');
  await page
    .getByRole('navigation', { name: 'Changelog contents' })
    .getByRole('link', { name: `Version ${target.version}` })
    .click();
  await expect
    .poll(() =>
      article.evaluate((el) =>
        el.hasAttribute('data-arrived') ? Number(getComputedStyle(el, '::after').opacity) : 0
      )
    )
    .toBeGreaterThan(0.9);
  await expect(article).toHaveAttribute('data-arrived');
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});
