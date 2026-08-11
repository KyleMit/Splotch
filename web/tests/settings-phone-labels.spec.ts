import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openHubSection, openSettingsModal } from './helpers';

// The phone Settings shell used to truncate the very text that carries its
// meaning: hub summaries ellipsized on one line ("Choose when grown-up c…"),
// advanced-control chips cut back to their icons ("Screen…", "Magic …"), and a
// save-folder row with no room left to name the destination (issue #905). The
// fix reflows rather than shrinks, so what these pin is that nothing in the
// phone shell is clipped and that the chip grid changes column count between
// the two widths instead of trimming an option name.
//
// The two viewports are the narrowest and widest phones in the responsive page
// inventory — the chip grid drops to one column across the gap between them, so
// running both keeps that breakpoint honest from either side.
const PHONE_VIEWPORTS = [
  { device: 'iPhone 13 mini', width: 375, height: 812, chipColumns: 1 },
  { device: 'iPhone 16 Pro Max', width: 440, height: 956, chipColumns: 2 },
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

for (const { device, width, height, chipColumns } of PHONE_VIEWPORTS) {
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

  test(`control chips keep their option names (${device})`, async ({ page }) => {
    await openHub(page, width, height);
    await openHubSection(page, 'controls', '#advancedControlsToggle');

    // The chip grid is what Advanced Controls reveals; it ships on, so this
    // asserts the state rather than toggling into it — a blind click would
    // reveal nothing and leave the assertions below racing the slide-away.
    await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'true');
    // One per entry in DRAWING_TOOL_CHIPS, stated rather than imported: that
    // module reaches the rune-based settings store, which a spec can't load
    // (the same reason settings-mount.spec.ts reads its count off the DOM).
    const labels = page.locator('.control-chips .option-label');
    await expect(labels).toHaveCount(5);
    expect(await clippedText(page, '.control-chips .option')).toEqual([]);
    // Every name on one line: this grid holds short labels, and the fallback
    // that keeps a long one readable — wrapping — would break these mid-word
    // ("Stroke wid/th") rather than at a space.
    expect(await wrappedText(page, '.control-chips .option-label')).toEqual([]);

    // Which is what the column count buys: the labels only fit beside their
    // 26px icons while the grid gives each chip enough of the row.
    const columns = await page
      .locator('.control-chips')
      .first()
      .evaluate(
        (grid) =>
          new Set([...grid.children].map((chip) => Math.round(chip.getBoundingClientRect().x))).size
      );
    expect(columns).toBe(chipColumns);

    // Reflowed, not shrunk: the chips stay full tap targets either way.
    const shortestChip = await page
      .locator('.control-chips .option')
      .evaluateAll((chips) =>
        Math.min(...chips.map((chip) => chip.getBoundingClientRect().height))
      );
    expect(shortestChip).toBeGreaterThanOrEqual(44);
  });
}

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
