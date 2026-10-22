import type { Page } from '@playwright/test';
import { acceptRadius } from '../../src/clear/dragToClear.ts';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';
import { SMOKE_TAG } from '../tags.ts';

// The Save Failure Banner speaks through a visually hidden status region that is mounted before any
// failure and written afterwards, so a screen reader that watches the region hears the words. The
// mounted tests pin that order in happy-dom; this drives a real save failure through the built app,
// in both of the ways the banner appears, so the order is checked against real frames. Browsers
// differ in when they flush that mutation, so it runs in every engine.
//
// No assertion here can hear a screen reader. They pin the structure that MDN's live-region guidance
// asks for, which is all a browser test can see.

const ANNOUNCEMENT =
  "Your picture wasn't saved. Something went wrong while saving. Try again in a moment.";
const BANNERS_TEST_ID = 'rsd-failure-banners';
// The drawing screen's routine announcements and the failure's own region.
const STATUS_REGION_COUNT = 2;
// Release the drag past the accept ring, so sub-pixel button geometry cannot land it short.
const CLEAR_DRAG_OVERSHOOT = 1.1;
const CLEAR_DRAG_STEPS = 10;
// A failure that survives a launch is written once the held picture has been read back, so a reload
// before the browser has stored it shows nothing, and is retried.
const RELOAD_ATTEMPT_MS = 4_000;

type Region = { n: number; text: string };
// One distinct state of the page, as the probe's MutationObserver saw it at a microtask checkpoint.
// `n` numbers each status region element outside a dialog, so a remount reads as a new one.
type Snapshot = { regions: Region[]; banner: boolean };
type ProbeWindow = Window & {
  refuseDownloads?: boolean;
  failureTimeline?: Snapshot[];
};

// Runs before the app's own scripts on every load. A download the app starts throws while
// `refuseDownloads` is set, which is how a web save fails for real: the save pipeline catches it,
// reports the failure and holds the picture. The observer records every change to the status
// regions outside a dialog and to whether the banner is on the page.
function installFailureProbe(bannersTestId: string) {
  const probe = window as ProbeWindow;
  probe.refuseDownloads = false;
  const timeline: Snapshot[] = [];
  probe.failureTimeline = timeline;

  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (probe.refuseDownloads && this.hasAttribute('download'))
      throw new Error('The test refused this download');
    click.call(this);
  };

  const numbers = new WeakMap<Element, number>();
  let counted = 0;
  let last = '';
  const record = () => {
    const regions = [...document.querySelectorAll('[role="status"]')].filter(
      (element) => !element.closest('[role="dialog"]')
    );
    for (const region of regions) if (!numbers.has(region)) numbers.set(region, counted++);
    const snapshot: Snapshot = {
      regions: regions.map((region) => ({
        n: numbers.get(region) ?? -1,
        text: region.textContent ?? '',
      })),
      banner:
        (document.querySelector(`[data-testid="${bannersTestId}"]`)?.children.length ?? 0) > 0,
    };
    const key = JSON.stringify(snapshot);
    if (key === last) return;
    last = key;
    timeline.push(snapshot);
  };
  new MutationObserver(record).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function timeline(page: Page): Promise<Snapshot[]> {
  return page.evaluate(() => (window as ProbeWindow).failureTimeline ?? []);
}

function refuseDownloads(page: Page, refuse: boolean) {
  return page.evaluate((value) => {
    (window as ProbeWindow).refuseDownloads = value;
  }, refuse);
}

type RegionState = { text: string; banner: boolean };

// The successive states a region was seen in, each run of the same state counted once.
function stateRuns(states: RegionState[]) {
  return states.filter(
    (state, index, all) =>
      index === 0 || state.text !== all[index - 1].text || state.banner !== all[index - 1].banner
  );
}

// The successive texts a region held, each run of the same text counted once.
function textRuns(states: RegionState[]) {
  return states.map(({ text }) => text).filter((text, index, all) => text !== all[index - 1]);
}

// The number of the region the failure's words land in, and its states from its first appearance.
function failureRegionHistory(all: Snapshot[]): { n: number; states: RegionState[] } | null {
  const landed = all.flatMap(({ regions }) => regions).find(({ text }) => text === ANNOUNCEMENT);
  if (!landed) return null;
  return {
    n: landed.n,
    states: all
      .filter(({ regions }) => regions.some(({ n }) => n === landed.n))
      .map(({ regions, banner }) => ({
        text: regions.find(({ n }) => n === landed.n)?.text ?? '',
        banner,
      })),
  };
}

async function openWithSaveOnDelete(page: Page) {
  await page.addInitScript(installFailureProbe, BANNERS_TEST_ID);
  const screen = await openDrawingScreen(page);
  const settings = await openSettings(page);
  await settings
    .getByRole('region', { name: 'Saving' })
    .getByRole('switch', { name: 'Auto-Save on Delete' })
    .click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  return screen;
}

// Drag-to-clear wipes the page, and save-on-delete saves what was on it first.
async function dragToClear(page: Page) {
  const box = await page.getByRole('button', { name: 'Clear drawing' }).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('The Clear Button or the window is missing');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reach = (acceptRadius(viewport.width, viewport.height) * CLEAR_DRAG_OVERSHOOT) / Math.SQRT2;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - reach, start.y + reach, { steps: CLEAR_DRAG_STEPS });
  await page.mouse.up();
}

async function failSaveOnDelete(
  page: Page,
  screen: Awaited<ReturnType<typeof openWithSaveOnDelete>>
) {
  await screen.pickColor('Black');
  const stroke = await screen.drawStroke();
  await expect.poll(() => screen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  await refuseDownloads(page, true);
  await dragToClear(page);
}

const failureRegion = (page: Page) => page.getByRole('status').filter({ hasText: ANNOUNCEMENT });

async function expectControlsOutsideRegion(page: Page) {
  const banner = page.getByTestId(BANNERS_TEST_ID);
  await expect(banner.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  await expect(page.getByRole('status').getByRole('button')).toHaveCount(0);
  expect(await banner.evaluate((node) => node.closest('[role="status"]') === null)).toBe(true);
}

async function expectDismissClears(page: Page) {
  await page.getByTestId(BANNERS_TEST_ID).getByRole('button', { name: 'Dismiss' }).click();
  await expect(
    page.getByTestId(BANNERS_TEST_ID).getByRole('button', { name: 'Dismiss' })
  ).toHaveCount(0);
  await expect(failureRegion(page)).toHaveCount(0);
  const history = failureRegionHistory(await timeline(page));
  const regionNumbers = new Set(
    (await timeline(page)).flatMap(({ regions }) => regions.map(({ n }) => n))
  );
  expect(history, 'the words landed somewhere').not.toBeNull();
  expect(regionNumbers.size, 'no region was remounted from launch to dismissal').toBe(
    STATUS_REGION_COUNT
  );
}

test.describe('save-failure announcement', { tag: SMOKE_TAG }, () => {
  test('a failure after the background mount writes into the region that was already there', async ({
    page,
  }) => {
    const screen = await openWithSaveOnDelete(page);
    await expect(page.getByRole('status')).toHaveCount(STATUS_REGION_COUNT);

    await failSaveOnDelete(page, screen);
    await expect(failureRegion(page)).toHaveText(ANNOUNCEMENT);
    await expect(
      page.getByTestId(BANNERS_TEST_ID).getByRole('button', { name: 'Dismiss' })
    ).toBeVisible();

    // The region is empty before the banner exists, then the words land in that same element, and
    // the banner follows.
    const history = failureRegionHistory(await timeline(page));
    expect(history ? stateRuns(history.states) : null).toEqual([
      { text: '', banner: false },
      { text: ANNOUNCEMENT, banner: false },
      { text: ANNOUNCEMENT, banner: true },
    ]);
    await expectControlsOutsideRegion(page);
    await expectDismissClears(page);
  });

  test('a failure held across a launch lands in a region created empty', async ({ page }) => {
    const screen = await openWithSaveOnDelete(page);
    await failSaveOnDelete(page, screen);
    await expect(failureRegion(page)).toHaveText(ANNOUNCEMENT);

    // The held picture comes back on the next launch, and the banner demands the failure again.
    await expect(async () => {
      await page.reload();
      await expect(failureRegion(page)).toHaveText(ANNOUNCEMENT, { timeout: RELOAD_ATTEMPT_MS });
    }).toPass();

    const history = failureRegionHistory(await timeline(page));
    expect(
      history ? stateRuns(history.states) : null,
      'the region appeared empty, before its words'
    ).toEqual([
      { text: '', banner: false },
      { text: ANNOUNCEMENT, banner: false },
      { text: ANNOUNCEMENT, banner: true },
    ]);
    await expectControlsOutsideRegion(page);
    await expectDismissClears(page);
  });

  test('a retry that fails again empties the region and writes the same words back', async ({
    page,
  }) => {
    const screen = await openWithSaveOnDelete(page);
    await failSaveOnDelete(page, screen);
    await expect(failureRegion(page)).toHaveText(ANNOUNCEMENT);
    const before = (await timeline(page)).length;

    await page.getByTestId(BANNERS_TEST_ID).getByRole('button', { name: 'Try again' }).click();

    await expect
      .poll(async () => {
        const history = failureRegionHistory((await timeline(page)).slice(before - 1));
        return history ? textRuns(history.states) : null;
      })
      .toEqual([ANNOUNCEMENT, '', ANNOUNCEMENT]);
    await expectControlsOutsideRegion(page);
  });
});
