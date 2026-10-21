import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// The fade at the foot of a Settings scroller is a reading of live scroll state, not decoration: it
// is absent while the content fits, present while more lies below the fold, and absent again once
// the end is on screen. Each Settings shell scrolls a different element, so each is read here.

// A phone tall enough to read on and far too short for the twelve-section list.
const PHONE_PORTRAIT = { width: 375, height: 812 };
// The compact shell exists for a landscape phone; these two heights fall either side of the point
// where its quick toggles stop fitting.
const CROPPED_LANDSCAPE = { width: 740, height: 250 };
const ROOMY_LANDSCAPE = { width: 740, height: 320 };
// A landscape tablet, which gets the two-column shell.
const TABLET_LANDSCAPE = { width: 1024, height: 768 };

const SCROLL_CUE = 'scroll-cue';

function cueOpacity(cue: Locator) {
  return cue.evaluate((node) => Number(getComputedStyle(node).opacity));
}

// The cue sits beside the one scroller it serves, inside the frame that holds both.
function scrollerState(cue: Locator) {
  return cue.evaluate((node) => {
    const scroller = [...(node.parentElement?.querySelectorAll('*') ?? [])].find((element) =>
      /(auto|scroll)/.test(getComputedStyle(element).overflowY)
    );
    if (!scroller) throw new Error('The scroll cue has no scroller beside it');
    return {
      overflows: scroller.scrollHeight > scroller.clientHeight,
      atEnd: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1,
    };
  });
}

// react-native-web gives its scrollers an RN-style scrollTo, so the scroll position is set directly.
function scrollTo(cue: Locator, position: 'top' | 'end') {
  return cue.evaluate((node, target) => {
    const scroller = [...(node.parentElement?.querySelectorAll('*') ?? [])].find((element) =>
      /(auto|scroll)/.test(getComputedStyle(element).overflowY)
    );
    if (scroller) scroller.scrollTop = target === 'end' ? scroller.scrollHeight : 0;
  }, position);
}

async function openSettingsAt(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await openDrawingScreen(page);
  const dialog = await openSettings(page);
  return { dialog, cue: dialog.getByTestId(SCROLL_CUE) };
}

async function expectCueFollowsScroll(cue: Locator) {
  await expect.poll(() => scrollerState(cue).then(({ overflows }) => overflows)).toBe(true);
  await expect.poll(() => cueOpacity(cue)).toBe(1);

  await scrollTo(cue, 'end');
  await expect.poll(() => scrollerState(cue).then(({ atEnd }) => atEnd)).toBe(true);
  await expect.poll(() => cueOpacity(cue)).toBe(0);

  // Scrolling back off the end re-arms it, so the cue tracks the reading position.
  await scrollTo(cue, 'top');
  await expect.poll(() => cueOpacity(cue)).toBe(1);
}

test.describe('the two-column Settings shell', () => {
  test('cues the content pane and stands down at the last section', async ({ page }) => {
    const { dialog, cue } = await openSettingsAt(page, TABLET_LANDSCAPE);

    await expectCueFollowsScroll(cue);
    // The section list on the left has its own edges and no second fade over them.
    await expect(dialog.getByTestId(SCROLL_CUE)).toHaveCount(1);
  });
});

test.describe('the portrait phone Settings shell', () => {
  test.use({ hasTouch: true });

  test('cues the hub rows below the card, then stands down at the last one', async ({ page }) => {
    const { cue } = await openSettingsAt(page, PHONE_PORTRAIT);

    await expectCueFollowsScroll(cue);
  });

  // A section drilled into is the shell's other scroller, and Sound fits on this phone whole, so it
  // pins the state the hub cannot reach.
  test('leaves a drilled-in section that fits uncued', async ({ page }) => {
    const { dialog } = await openSettingsAt(page, PHONE_PORTRAIT);
    await dialog.getByRole('button', { name: /^Sound,/ }).click();
    const section = page.getByRole('dialog', { name: 'Sound' });
    const cue = section.getByTestId(SCROLL_CUE);

    await expect.poll(() => scrollerState(cue).then(({ overflows }) => overflows)).toBe(false);
    await expect.poll(() => cueOpacity(cue)).toBe(0);
  });
});

test.describe('the landscape phone Settings shell', () => {
  test.use({ hasTouch: true });

  test('cues the toggles it crops, then stands down at the end of them', async ({ page }) => {
    const { cue } = await openSettingsAt(page, CROPPED_LANDSCAPE);

    await expectCueFollowsScroll(cue);
  });

  test('leaves a pane that fits uncued', async ({ page }) => {
    const { cue } = await openSettingsAt(page, ROOMY_LANDSCAPE);

    await expect.poll(() => scrollerState(cue).then(({ overflows }) => overflows)).toBe(false);
    await expect.poll(() => cueOpacity(cue)).toBe(0);
  });
});
