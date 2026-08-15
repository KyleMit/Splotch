import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openHubSection, openSettingsModal } from './helpers';

// The phone Settings shell used to truncate the very text that carries its
// meaning: hub summaries ellipsized on one line ("Choose when grown-up c…"),
// advanced-control chips cut back to their icons ("Screen…", "Magic …"), and a
// save-folder row with no room left to name the destination (issue #905). The
// fix reflows rather than shrinks, so what these pin is that nothing in the
// phone shell is clipped and that the Drawing Tools list changes skin between
// the two widths instead of trimming an option name.
//
// The two viewports are the narrowest and widest phones in the responsive page
// inventory — the block crosses the width where two chips fit across the gap
// between them, so running both keeps that crossover honest from either side.
const PHONE_VIEWPORTS = [
  { device: 'iPhone 13 mini', width: 375, height: 812, toolSkin: 'rows', toolColumns: 1 },
  { device: 'iPhone 16 Pro Max', width: 440, height: 956, toolSkin: 'chips', toolColumns: 2 },
] as const;

async function openHub(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await expect(modal).not.toHaveClass(/wide|compact/);
  await expect(page.locator('.hub-list')).toBeVisible();
  return modal;
}

// Text whose box can't hold it, whichever way it was cut: an ellipsized line
// overflows horizontally, a clamped block vertically. Reported with the visible
// text so a failure names the label that lost its meaning.
function clippedText(page: Page, selector: string): Promise<string[]> {
  return page
    .locator(selector)
    .evaluateAll((els) =>
      els
        .filter(
          (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
        )
        .map((el) => el.textContent?.trim() ?? '')
    );
}

// One client rect per line box the *text* occupies, so a label that broke
// across lines reports > 1. Measured off a Range around the contents, never off
// the element: a flex item is blockified, so its own getClientRects() is a
// single border box no matter how many lines the text takes — an element-level
// count reports 1 for a label rendering at twice its line height, and the
// assertion below would pass through exactly the wrapping it exists to catch.
function wrappedText(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => {
        const line = document.createRange();
        line.selectNodeContents(el);
        return line.getClientRects().length > 1;
      })
      .map((el) => el.textContent?.trim() ?? '')
  );
}

for (const { device, width, height, toolSkin, toolColumns } of PHONE_VIEWPORTS) {
  test(`hub summaries read in full (${device})`, async ({ page }) => {
    await openHub(page, width, height);

    const subtitles = page.locator('.hub-subtitle');
    await expect(subtitles).toHaveCount(await page.locator('.hub-row').count());
    // The longest summary is the one the inventory caught mid-word.
    await expect(subtitles.filter({ hasText: 'Choose when grown-up checks appear' })).toHaveCount(
      1
    );
    expect(await clippedText(page, '.hub-subtitle')).toEqual([]);
  });

  test(`the Drawing Tools list keeps its option names (${device})`, async ({ page }) => {
    await openHub(page, width, height);
    await openHubSection(page, 'controls', '#advancedControlsToggle');

    // The tools list is what Advanced Controls reveals; it ships on, so this
    // asserts the state rather than toggling into it — a blind click would
    // reveal nothing and leave the assertions below racing the slide-away.
    await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'true');

    // Chips buy a second column and nothing else, so the narrow phone — which
    // has only one column to give — gets the plain toggle rows instead.
    const usingChips = toolSkin === 'chips';
    await expect(page.locator('.control-chips')).toHaveCount(usingChips ? 1 : 0);
    await expect(page.locator('.tool-rows')).toHaveCount(usingChips ? 0 : 1);
    const optionSelector = usingChips ? '.control-chips .option' : '.tool-rows .setting';
    const labelSelector = usingChips ? '.control-chips .option-label' : '.tool-rows .setting-label';

    // One per entry in DRAWING_TOOLS, stated rather than imported: that module
    // reaches the rune-based settings store, which a spec can't load (the same
    // reason settings-mount.spec.ts reads its count off the DOM).
    await expect(page.locator(labelSelector)).toHaveCount(5);
    expect(await clippedText(page, optionSelector)).toEqual([]);
    // Every name on one line: this list holds short labels, and the fallback
    // that keeps a long one readable — wrapping — would break these mid-word
    // ("Stroke wid/th") rather than at a space.
    expect(await wrappedText(page, labelSelector)).toEqual([]);

    // Which is what the chips' width floor buys: the labels only fit beside
    // their 26px icons while each chip gets enough of the row. Counted for both
    // skins off the case's own expectation, so the narrow phone's single column
    // is a stated fact rather than the half this check skipped.
    const columns = await page
      .locator(optionSelector)
      .evaluateAll(
        (options) =>
          new Set(options.map((option) => Math.round(option.getBoundingClientRect().x))).size
      );
    expect(columns).toBe(toolColumns);

    // Reflowed, not shrunk: the options stay full tap targets under either skin.
    const shortestOption = await page
      .locator(optionSelector)
      .evaluateAll((options) =>
        Math.min(...options.map((option) => option.getBoundingClientRect().height))
      );
    expect(shortestOption).toBeGreaterThanOrEqual(44);
  });
}

// The two skins render different elements for the same tool, so crossing the
// width mid-session destroys whatever the parent had focused — a keyboard user
// resizing the window, or zooming the browser, would otherwise land back on
// <body> and have to tab in from the top again. Driven in both directions
// because only one of them is the swap the parent is looking at.
test('a tool keeps focus when the block crosses into the other skin', async ({ page }) => {
  const [narrow, wide] = PHONE_VIEWPORTS;
  await openHub(page, wide.width, wide.height);
  await openHubSection(page, 'controls', '#advancedControlsToggle');
  await expect(page.locator('.control-chips')).toHaveCount(1);

  const focusedId = () => page.evaluate(() => document.activeElement?.id ?? '');

  await page.locator('#magicBrushToggle').focus();
  expect(await focusedId()).toBe('magicBrushToggle');

  // Chips out, rows in. The skin assertion comes first so a swap that never
  // happened can't pass this as retained focus.
  await page.setViewportSize({ width: narrow.width, height: narrow.height });
  await expect(page.locator('.tool-rows')).toHaveCount(1);
  await expect.poll(focusedId).toBe('magicBrushToggle');

  await page.setViewportSize({ width: wide.width, height: wide.height });
  await expect(page.locator('.control-chips')).toHaveCount(1);
  await expect.poll(focusedId).toBe('magicBrushToggle');
});

test('the save-folder row seats its label and its action without collision', async ({ page }) => {
  const { width, height } = PHONE_VIEWPORTS[0];
  await openHub(page, width, height);
  await openHubSection(page, 'saving', '#saveOnDeleteToggle');

  // The row is desktop-Chromium only (File System Access API), which is what
  // this project runs — the emulated phone viewport is exactly the case the
  // page inventory captured.
  const row = page.locator('.folder-location');
  await expect(row).toBeVisible();
  expect(await clippedText(page, '.folder-title')).toEqual([]);

  const boxes = await row.evaluate((el) => {
    const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
    return {
      row: el.getBoundingClientRect(),
      label: rect('.folder-title'),
      action: rect('button'),
    };
  });
  const overlaps =
    boxes.label.right > boxes.action.left + 0.5 && boxes.label.bottom > boxes.action.top + 0.5;
  expect(overlaps).toBe(false);
  expect(boxes.action.bottom).toBeLessThanOrEqual(boxes.row.bottom + 0.5);
});
