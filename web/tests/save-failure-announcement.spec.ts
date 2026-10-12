import { expect, test, type Page } from '@playwright/test';
import { ACCEPT_RADIUS_FACTOR } from '../src/lib/actions/dragToClearGeometry';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { drawCommittedStroke, gotoApp } from './helpers';
import { ENGINE_SMOKE_TAG } from './tags';

// The Save-Failure Banner speaks through a visually hidden status region that is mounted with the
// component, before any failure, and written a frame later (SaveFailureBanner.svelte). Its Vitest
// test pins that in happy-dom; this drives a real save failure through the built app, in both of the
// ways the banner mounts, so the order is checked against real frames and the real overlay pump.
//
// No assertion here can hear a screen reader. They pin the structure that MDN's live-region guidance
// asks for, which is all a browser test can see.

const ANNOUNCEMENT =
  "Your picture wasn't saved. Something went wrong while saving. Try again in a moment.";
// The banner is the next to last resident of the interaction-quiet overlay pump
// (boot/bootHiddenOverlays.ts), which spaces each resident a quiet slice after the one before.
const BANNER_RESIDENT_TIMEOUT_MS = 20_000;
// Release the drag past the accept ring, so sub-pixel button geometry cannot land it short.
const CLEAR_DRAG_OVERSHOOT = 1.1;

// One distinct state of the page, as the probe's MutationObserver saw it at a microtask checkpoint.
// `region` numbers each status region element the page has shown, so a remount reads as a new one.
interface Snapshot {
  region: number | null;
  text: string | null;
  banner: boolean;
}

interface SaveFailureProbe {
  refuseDownloads: boolean;
  snapshots: Snapshot[];
}

type ProbeWindow = Window & { __saveFailureProbe?: SaveFailureProbe };

// Runs before the app's own scripts on every load. A download the app starts throws while
// `refuseDownloads` is set, which is how a web save fails for real: the save pipeline catches it and
// reports the failure, holding the picture. The observer records every change to the status region
// outside a dialog and to whether the banner is on the page.
function installSaveFailureProbe() {
  const probe: SaveFailureProbe = { refuseDownloads: false, snapshots: [] };
  (window as ProbeWindow).__saveFailureProbe = probe;

  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (probe.refuseDownloads && this.hasAttribute('download')) {
      throw new Error('The test refused this download');
    }
    click.call(this);
  };

  const regionNumbers = new WeakMap<Element, number>();
  let lastKey = '';
  const record = () => {
    const region =
      [...document.querySelectorAll('[role="status"]')].find((el) => !el.closest('dialog')) ?? null;
    if (region && !regionNumbers.has(region)) regionNumbers.set(region, probe.snapshots.length);
    const snapshot: Snapshot = {
      region: region ? (regionNumbers.get(region) ?? null) : null,
      text: region ? (region.textContent ?? '') : null,
      banner: document.querySelector('.save-failure-banner') !== null,
    };
    const key = JSON.stringify(snapshot);
    if (key === lastKey) return;
    lastKey = key;
    probe.snapshots.push(snapshot);
  };
  new MutationObserver(record).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function snapshots(page: Page): Promise<Snapshot[]> {
  return page.evaluate(() => (window as ProbeWindow).__saveFailureProbe?.snapshots ?? []);
}

function refuseDownloads(page: Page, refuse: boolean) {
  return page.evaluate((value) => {
    const probe = (window as ProbeWindow).__saveFailureProbe;
    if (!probe) throw new Error('The save-failure probe is not installed');
    probe.refuseDownloads = value;
  }, refuse);
}

async function openWithSaveOnDelete(page: Page) {
  await page.addInitScript(installSaveFailureProbe);
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), STORAGE_KEYS.saveOnDelete);
  await gotoApp(page);
}

// Drag-to-clear wipes the page, and save-on-delete saves what was on it first.
async function dragToClear(page: Page) {
  const box = await page.locator('#clearButton').boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('The Clear Button or the viewport is missing');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reach =
    (Math.min(viewport.width, viewport.height) * ACCEPT_RADIUS_FACTOR * CLEAR_DRAG_OVERSHOOT) /
    Math.SQRT2;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - reach, start.y + reach, { steps: 10 });
  await page.mouse.up();
}

async function failSaveOnDelete(page: Page) {
  await drawCommittedStroke(page, [
    { x: 200, y: 200 },
    { x: 320, y: 260 },
  ]);
  await refuseDownloads(page, true);
  await dragToClear(page);
}

// The snapshots from the region's first appearance on, which every case reads.
function fromRegion(all: Snapshot[]): Snapshot[] {
  const first = all.findIndex((snapshot) => snapshot.region !== null);
  return first === -1 ? [] : all.slice(first);
}

async function expectControlsOutsideRegion(page: Page) {
  const banner = page.locator('.save-failure-banner');
  await expect(banner.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  await expect(page.getByRole('status').getByRole('button')).toHaveCount(0);
  expect(await banner.evaluate((el) => el.closest('[role="status"]') === null)).toBe(true);
}

async function expectDismissClears(page: Page) {
  const region = page.getByRole('status');
  await page.locator('.save-failure-banner').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.save-failure-banner')).toHaveCount(0);
  await expect(region).toHaveText('');
  const regions = new Set(fromRegion(await snapshots(page)).map((snapshot) => snapshot.region));
  expect(regions.size, 'the region stayed one element from mount to dismissal').toBe(1);
}

function registerAnnouncementTests() {
  test('a failure after the background mount writes into the region that was already there', async ({
    page,
  }) => {
    await openWithSaveOnDelete(page);
    const region = page.getByRole('status');
    await expect(region).toHaveCount(1, { timeout: BANNER_RESIDENT_TIMEOUT_MS });
    await expect(region).toHaveText('');
    await expect(page.locator('.save-failure-banner')).toHaveCount(0);

    await failSaveOnDelete(page);
    await expect(region).toHaveText(ANNOUNCEMENT);

    // Empty without a banner, then a banner over a still-empty region, then the words.
    const timeline = fromRegion(await snapshots(page));
    const region0 = timeline[0].region;
    expect(timeline.slice(0, 3)).toEqual([
      { region: region0, text: '', banner: false },
      { region: region0, text: '', banner: true },
      { region: region0, text: ANNOUNCEMENT, banner: true },
    ]);
    await expectControlsOutsideRegion(page);
    await expectDismissClears(page);
  });

  test('a failure open before the banner mounts lands in a region created empty', async ({
    page,
  }) => {
    await openWithSaveOnDelete(page);
    await failSaveOnDelete(page);
    await expect(page.getByRole('status')).toHaveText(ANNOUNCEMENT, {
      timeout: BANNER_RESIDENT_TIMEOUT_MS,
    });

    // The held picture comes back on the next launch, before the overlay pump has mounted the
    // banner, so the route demands it with the failure already open. The flag lands after the
    // picture's bytes do (drawing/unsavedPictureStore.ts).
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.unsavedPicturesHeld)
      )
      .toBe('true');
    await page.reload();
    await expect(page.locator('#drawingCanvas')).toBeVisible();
    const region = page.getByRole('status');
    await expect(region).toHaveText(ANNOUNCEMENT, { timeout: BANNER_RESIDENT_TIMEOUT_MS });

    const timeline = fromRegion(await snapshots(page));
    const region0 = timeline[0].region;
    expect(timeline[0], 'the region appeared empty, before its words').toEqual({
      region: region0,
      text: '',
      banner: true,
    });
    expect(timeline.slice(1)).toContainEqual({
      region: region0,
      text: ANNOUNCEMENT,
      banner: true,
    });
    await expectControlsOutsideRegion(page);
    await expectDismissClears(page);
  });

  test('a retry that fails again empties the region and writes the same words back', async ({
    page,
  }) => {
    await openWithSaveOnDelete(page);
    await failSaveOnDelete(page);
    const region = page.getByRole('status');
    await expect(region).toHaveText(ANNOUNCEMENT, { timeout: BANNER_RESIDENT_TIMEOUT_MS });
    const before = (await snapshots(page)).length;

    await page.locator('.save-failure-banner').getByRole('button', { name: 'Try again' }).click();
    await expect
      .poll(async () => (await snapshots(page)).slice(before).map((snapshot) => snapshot.text))
      .toEqual(['', ANNOUNCEMENT]);
    await expectControlsOutsideRegion(page);
  });
}

// Chromium runs the untagged copy with the full suite; the engine-smoke jobs run the tagged copy in
// Firefox and WebKit (tests/tags.ts routes each engine by the tag).
test.describe('save-failure announcement', registerAnnouncementTests);
test.describe(
  'save-failure announcement across engines',
  { tag: ENGINE_SMOKE_TAG },
  registerAnnouncementTests
);
