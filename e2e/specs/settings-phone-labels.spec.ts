import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// The phone Settings shell must not truncate the text that carries its meaning: hub summaries
// ellipsized on one line, tool names cut back to their icons, a save-folder row with no room left
// to name its destination. The fix reflows rather than shrinks, so what is pinned is that nothing in
// the phone shell is clipped, and that the Drawing Tools list changes skin between the two widths
// instead of trimming an option name.
//
// The two windows are the narrowest and widest phones in the responsive page inventory; the block
// crosses the width where two chips fit across the gap between them.

const PHONES = [
  { device: 'iPhone 13 mini', width: 375, height: 812, skin: 'rows', columns: 1 },
  { device: 'iPhone 16 Pro Max', width: 440, height: 956, skin: 'chips', columns: 2 },
] as const;
const [NARROW_PHONE, WIDE_PHONE] = PHONES;
const TOOL_NAMES = ['Crayon', 'Magic brush', 'Eraser', 'Stroke width', 'Undo'];
const TOOL_NAME = /^(Crayon|Magic brush|Eraser|Stroke width|Undo)$/;
const TARGET_MIN_PX = 44;
const HUB_ROW_COUNT = 12;
const LONGEST_SUMMARY = 'Choose when grown-up checks appear';
// Layout rounds a box's edge by less than this.
const EDGE_TOLERANCE_PX = 1;
const OVERLAP_TOLERANCE_PX = 0.5;

async function openHub(page: Page, phone: (typeof PHONES)[number]) {
  await page.setViewportSize({ width: phone.width, height: phone.height });
  await openDrawingScreen(page);
  return openSettings(page);
}

async function openToolDrawer(page: Page, phone: (typeof PHONES)[number]) {
  const hub = await openHub(page, phone);
  await hub.getByRole('button', { name: /^Tool Drawer/ }).click();
  return page.getByRole('dialog', { name: 'Tool Drawer' });
}

// Text whose box cannot hold it, however it was cut: an ellipsized line overflows horizontally and
// a clamped block vertically. Reported with the visible text so a failure names the lost label.
function clippedText(scope: Locator): Promise<string[]> {
  return scope.evaluate(
    (root, tolerance) =>
      [...root.querySelectorAll('*')]
        .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
        .filter(
          (node) =>
            node.scrollWidth > node.clientWidth + tolerance ||
            node.scrollHeight > node.clientHeight + tolerance
        )
        .map((node) => node.textContent?.trim() ?? ''),
    EDGE_TOLERANCE_PX
  );
}

// One client rect per line box the text occupies, so a label that broke across lines reports more
// than one. Measured off a Range around the contents, never off the element: a flex item is
// blockified, so its own rects are a single border box however many lines the text takes.
function wrappedText(scope: Locator, names: RegExp): Promise<string[]> {
  return scope.evaluate(
    (root, pattern) =>
      [...root.querySelectorAll('*')]
        .filter(
          (node) => node.children.length === 0 && new RegExp(pattern).test(node.textContent ?? '')
        )
        .filter((node) => {
          const line = document.createRange();
          line.selectNodeContents(node);
          return line.getClientRects().length > 1;
        })
        .map((node) => node.textContent?.trim() ?? ''),
    names.source
  );
}

for (const phone of PHONES) {
  test(`hub summaries read in full (${phone.device})`, async ({ page }) => {
    const hub = await openHub(page, phone);

    await expect(hub.getByRole('button', { name: new RegExp(LONGEST_SUMMARY) })).toHaveCount(1);
    expect(await hub.getByRole('listitem').count()).toBe(HUB_ROW_COUNT);
    expect(await clippedText(hub)).toEqual([]);
  });

  test(`the Drawing Tools list keeps its option names (${phone.device})`, async ({ page }) => {
    const tools = await openToolDrawer(page, phone);
    // The list ships on, so the assertions below read a state rather than toggling into it.
    await expect(tools.getByRole('switch', { name: 'Enable tool drawer' })).toBeChecked();
    // Chips buy a second column and nothing else, so the narrow phone, which has one column to
    // give, gets plain toggle rows instead.
    const usingChips = phone.skin === 'chips';
    const options = usingChips
      ? tools.getByRole('group', { name: 'Drawing Tools' }).getByRole('button')
      : tools.getByRole('switch', { name: TOOL_NAME });

    await expect(options).toHaveText(usingChips ? TOOL_NAMES : TOOL_NAMES.map(() => ''));
    expect(await tools.getByRole('switch', { name: TOOL_NAME }).count()).toBe(
      usingChips ? 0 : TOOL_NAMES.length
    );
    expect(await clippedText(tools)).toEqual([]);
    // Every name on one line: the fallback that keeps a long one readable, wrapping, would break
    // these mid-word ("Stroke wid/th") rather than at a space.
    expect(await wrappedText(tools, TOOL_NAME)).toEqual([]);
    const boxes = await options.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, height } = node.getBoundingClientRect();
        return { x: Math.round(x), height };
      })
    );
    expect(new Set(boxes.map(({ x }) => x)).size).toBe(phone.columns);
    // Reflowed, not shrunk: the options stay full tap targets under either skin.
    expect(Math.min(...boxes.map(({ height }) => height))).toBeGreaterThanOrEqual(TARGET_MIN_PX);
  });
}

// The two skins render different elements for the same tool, so crossing the width mid-session
// destroys whatever the parent had focused. A keyboard user resizing the window, or zooming the
// browser, would otherwise land back on the document and have to tab in from the top again.
test('a tool keeps focus when the block crosses into the other skin', async ({ page }) => {
  const tools = await openToolDrawer(page, WIDE_PHONE);
  const focusedName = () =>
    page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  await tools
    .getByRole('group', { name: 'Drawing Tools' })
    .getByRole('button', { name: 'Magic brush' })
    .focus();
  await expect.poll(focusedName).toBe('Magic brush');

  // Chips out, rows in. The skin assertion comes first so a swap that never happened cannot pass
  // as retained focus.
  await page.setViewportSize({ width: NARROW_PHONE.width, height: NARROW_PHONE.height });
  await expect(tools.getByRole('switch', { name: 'Magic brush' })).toBeVisible();
  await expect.poll(focusedName).toBe('Magic brush');

  await page.setViewportSize({ width: WIDE_PHONE.width, height: WIDE_PHONE.height });
  await expect(
    tools.getByRole('group', { name: 'Drawing Tools' }).getByRole('button', { name: 'Magic brush' })
  ).toBeVisible();
  await expect.poll(focusedName).toBe('Magic brush');
});

// The row is for browsers that can write to a folder, which desktop Chromium, the project here, can.
test('the save-folder row seats its label and its action without collision', async ({ page }) => {
  const hub = await openHub(page, NARROW_PHONE);
  await hub.getByRole('button', { name: /^Saving/ }).click();
  const saving = page.getByRole('dialog', { name: 'Saving' });
  const action = saving.getByRole('button', { name: 'Choose folder' });
  await expect(action).toBeVisible();
  const label = saving.getByText('Save drawings to', { exact: true });

  const [labelBox, actionBox] = await Promise.all([label.boundingBox(), action.boundingBox()]);
  expect(await clippedText(saving)).toEqual([]);
  const overlaps =
    (labelBox?.x ?? 0) + (labelBox?.width ?? 0) > (actionBox?.x ?? 0) + OVERLAP_TOLERANCE_PX &&
    (labelBox?.y ?? 0) + (labelBox?.height ?? 0) > (actionBox?.y ?? 0) + OVERLAP_TOLERANCE_PX;
  expect(overlaps).toBe(false);
});
