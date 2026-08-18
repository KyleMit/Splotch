import { expect, test, type Page } from '@playwright/test';

import {
  gotoApp,
  headingOffsetFromPaneTop,
  openSettingsModal,
  SECTION_LANDED_MAX_PX,
  SETTINGS_FILL_FRAME_BUDGET,
  settleSettingsPane,
} from './helpers';

// The wide Settings shell stages its section bodies a frame at a time instead of
// mounting all eleven in the tap that opens the dialog (issue #910). Everything
// here runs on the default desktop viewport, where that shell is the one in use.
//
// The staging is watched from inside the page, one reading per animation frame,
// rather than by round-tripping to the test process — a round trip measures the
// harness, and on a starved worker it can span the whole run. Each run is
// anchored on the pane appearing rather than on the tap: the dialog is imported
// at idle and mounted by its first open (ADR-0049), so an early tap lands on
// nothing, which is why the loops below keep tapping until it takes.
//
// The full section count is read off the table of contents rather than imported:
// `sections.ts` reaches the rune modules behind the hub subtitles, so a spec
// can't load it, and every row is in the column from the first frame anyway.

/**
 * Section bodies in the pane on each frame, from the frame the pane appears —
 * plus which sections that first frame held, and the dialog's layout height
 * (`clientHeight`, so the fly-in transform cannot skew the reading) per frame.
 */
function paneFillPerFrame(page: Page, frameLimit: number) {
  return page.evaluate(
    (frameLimit) =>
      new Promise<{
        rows: number;
        sections: number[];
        firstFrameSectionIds: string[];
        dialogHeights: number[];
        viewportHeight: number;
      }>((resolve) => {
        const sections: number[] = [];
        const dialogHeights: number[] = [];
        let firstFrameSectionIds: string[] = [];
        const rows = () => document.querySelectorAll('.settings-nav .toc-row').length;
        const step = () => {
          const pane = document.querySelector('.settings-pane');
          if (!pane) {
            document.querySelector<HTMLElement>('#settingsButton')!.click();
          } else {
            if (!sections.length) {
              firstFrameSectionIds = [
                ...pane.querySelectorAll<HTMLElement>('.settings-section'),
              ].map((el) => el.dataset.section ?? '');
            }
            sections.push(pane.querySelectorAll('.settings-section').length);
            dialogHeights.push(document.querySelector('#settingsModal')!.clientHeight);
          }
          if (sections.at(-1) === rows() || sections.length >= frameLimit) {
            resolve({
              rows: rows(),
              sections,
              firstFrameSectionIds,
              dialogHeights,
              viewportHeight: window.innerHeight,
            });
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    frameLimit
  );
}

test('the pane fills a section at a time rather than all at once', async ({ page }) => {
  await gotoApp(page);

  // The same frames-not-milliseconds budget the shared helper waits on: it
  // bounds a fill that has stopped, and the assertions below score the fill that
  // ran, so sampling past it would only be scoring a run already broken.
  const { rows, sections } = await paneFillPerFrame(page, SETTINGS_FILL_FRAME_BUDGET);

  expect(rows).toBeGreaterThan(1);
  expect(sections[0]).toBeGreaterThan(0);
  expect(sections[0]).toBeLessThan(rows);
  expect(sections.at(-1)).toBe(rows);
  // A watermark, never lowered — nothing that arrived is taken back out.
  expect(sections).toEqual([...sections].sort((a, b) => a - b));
});

test('the opening frame already holds the above-the-fold prefix', async ({ page }) => {
  // Appearance and Sound are both above the fold on the wide shell's default
  // landing, so a Sound body arriving with the fill reads as a pop-in in content
  // the parent is already looking at. The staging assertions above are
  // deliberately generic about counts, so they would stay green if the opening
  // watermark slid back to one section — this pins the prefix by name. Asserted
  // on the leading pair rather than the exact list: on a starved worker the
  // first *sampled* frame can land after the fill has begun, which only ever
  // appends sections past the prefix.
  await gotoApp(page);

  const { firstFrameSectionIds } = await paneFillPerFrame(page, SETTINGS_FILL_FRAME_BUDGET);

  expect(firstFrameSectionIds.slice(0, 2)).toEqual(['appearance', 'sound']);
});

// SettingsModal's --card-height-cap and --wide-card-height-ceiling, restated
// here as tests deliberately restate boundary values.
const CARD_HEIGHT_CAP_FRACTION = 0.85;
const CARD_HEIGHT_CEILING_PX = 720;

test('the wide card opens at its settled height and holds it through the fill', async ({
  page,
}) => {
  // The settled pane always overflows the card's height bounds, so the wide
  // card claims min(85vh, ceiling) up front (SettingsModal's --card-height-cap
  // and --wide-card-height-ceiling) — a content-driven height would ratchet
  // taller as each section mounts, a layout jump chasing the staged fill.
  // Every sampled frame must agree, and the shared value must be the bound
  // itself rather than some other constant.
  await gotoApp(page);

  const { dialogHeights, viewportHeight } = await paneFillPerFrame(
    page,
    SETTINGS_FILL_FRAME_BUDGET
  );

  // Fractional-pixel rounding is the only slack: clientHeight is an integer.
  const boundPx = Math.min(viewportHeight * CARD_HEIGHT_CAP_FRACTION, CARD_HEIGHT_CEILING_PX);
  expect(new Set(dialogHeights).size).toBe(1);
  expect(Math.abs(dialogHeights[0]! - boundPx)).toBeLessThanOrEqual(1);
});

test.describe('on a tall desktop viewport', () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  test('the card clamps to the sidebar ceiling and the whole section list shows', async ({
    page,
  }) => {
    // 85vh here would tower past the reading content; the ceiling grants the
    // sidebar its full section list (through About) plus a little air, and no
    // more. Both halves matter: the height is the ceiling, and the nav column
    // holds no more list than it can show — the pair is the drift guard that
    // fails when a new section outgrows the ceiling instead of silently
    // clipping the list behind a scroll.
    await gotoApp(page);

    const { dialogHeights } = await paneFillPerFrame(page, SETTINGS_FILL_FRAME_BUDGET);

    expect(new Set(dialogHeights).size).toBe(1);
    expect(dialogHeights[0]).toBe(CARD_HEIGHT_CEILING_PX);
    const navFits = await page
      .locator('.settings-nav')
      .evaluate((nav) => nav.scrollHeight <= nav.clientHeight);
    expect(navFits).toBe(true);
  });
});

test('idle time prewarms the pane so a first open finds it whole', async ({ page }) => {
  // The dialog mounts closed in the idle pump's final slice and the wide pane
  // then fills one section per idle slice (ADR-0049), so a parent's first tap —
  // typically minutes after boot — pays what a reopen pays. Deliberately no tap
  // until the prewarm finishes: the tap-first path is what every other test
  // here exercises.
  await gotoApp(page);

  await expect
    .poll(
      async () => {
        const rows = await page.locator('.settings-nav .toc-row').count();
        const sections = await page.locator('.settings-pane .settings-section').count();
        return rows > 0 && rows === sections;
      },
      { timeout: 20_000 }
    )
    .toBe(true);
  // Prewarming must never show the dialog — it fills behind a closed card.
  await expect(page.locator('#settingsModal[open]')).toHaveCount(0);

  await openSettingsModal(page);
  await expect(page.locator('.settings-pane')).toHaveAttribute('aria-busy', 'false');
});

// Frames to keep watching the pane after it has said it is ready. A nested pump
// costs a frame per step, so this covers several of them.
const POST_READY_FRAMES = 15;

test('a scroll the moment the pane reports ready keeps the last section elected', async ({
  page,
}) => {
  // `aria-busy` clearing is the promise that every section is mounted, and the
  // scroll-end election only means anything once that is true. A section staging
  // content of its own past that transition broke both at once: the pane kept
  // growing, so scrolling to the bottom no longer left you at the bottom, and
  // About lost the election a frame later.
  //
  // Driven entirely in the page and anchored on the attribute flipping, because
  // the margin is a frame or two: a round trip to the test process to read the
  // flag and another to scroll is enough slack for a nested pump to finish, and
  // the race then passes on luck. That is why the suite stayed green through it.
  await gotoApp(page);

  const outcome = await page.evaluate(
    (frames) =>
      new Promise<{ grewAfterReady: number; lastRowActive: boolean }>((resolve) => {
        const settle = (pane: Element) => {
          pane.scrollTo({ top: pane.scrollHeight });
          const heightAtReady = pane.scrollHeight;
          let seen = 0;
          const step = () => {
            seen += 1;
            if (seen < frames) {
              requestAnimationFrame(step);
              return;
            }
            const rows = document.querySelectorAll('.settings-nav .toc-row');
            resolve({
              grewAfterReady: pane.scrollHeight - heightAtReady,
              lastRowActive: rows[rows.length - 1]!.classList.contains('active'),
            });
          };
          requestAnimationFrame(step);
        };

        const ready = (pane: Element) => pane.getAttribute('aria-busy') === 'false';
        const waitForPane = () => {
          const pane = document.querySelector('.settings-pane');
          if (!pane) {
            document.querySelector<HTMLElement>('#settingsButton')!.click();
            requestAnimationFrame(waitForPane);
            return;
          }
          if (ready(pane)) {
            settle(pane);
            return;
          }
          new MutationObserver((_, observer) => {
            if (!ready(pane)) return;
            observer.disconnect();
            settle(pane);
          }).observe(pane, { attributes: true, attributeFilter: ['aria-busy'] });
        };
        requestAnimationFrame(waitForPane);
      }),
    POST_READY_FRAMES
  );

  expect(outcome.grewAfterReady).toBe(0);
  expect(outcome.lastRowActive).toBe(true);
});

test('the pane reports itself busy until the last section is in', async ({ page }) => {
  // The flag is what every harness and helper waits on to know the offsets it is
  // about to read are final, so it has to clear exactly when the pane is whole.
  await gotoApp(page);
  await page.locator('#settingsButton').click();

  const pane = page.locator('.settings-pane');
  await settleSettingsPane(pane);
  const rows = await page.locator('.settings-nav .toc-row').count();
  await expect(pane.locator('.settings-section')).toHaveCount(rows);
});

test('a jump to a section that has not arrived yet still reaches it', async ({ page }) => {
  // The whole table of contents is clickable from the first frame, so a row can
  // be tapped while the pane behind it is still one section deep. The jump has
  // to mount what it was asked for rather than quietly do nothing. Tapped on the
  // second frame the pane exists for: the first belongs to the open reset, which
  // parks the pane on the landing section and would scroll over an earlier tap.
  //
  // A tap this early also races the conditional reveals that persisted state and
  // the free-generation fetch open in the sections *above* the target, each of
  // which pushes a heading the pane has already scrolled for further down. The
  // jump re-aims on every content resize until the parent takes the pane over
  // (WideShell's `pendingJump`), so the section is still the one being read once
  // everything has landed — which is what the highlight is asserted on here.
  //
  // A row from the middle of the column — far enough down that the pane has not
  // reached it, and not the last, which is too short to reach the reading line
  // on its own.
  await gotoApp(page);

  const jumpedTo = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        let framesWithPane = 0;
        const step = () => {
          if (!document.querySelector('.settings-pane')) {
            document.querySelector<HTMLElement>('#settingsButton')!.click();
          } else {
            framesWithPane += 1;
          }
          if (framesWithPane < 2) {
            requestAnimationFrame(step);
            return;
          }
          const rows = document.querySelectorAll<HTMLElement>('.settings-nav .toc-row');
          const row = rows[Math.floor(rows.length / 2)]!;
          row.click();
          resolve(row.dataset.section!);
        };
        requestAnimationFrame(step);
      })
  );

  await expect(
    page.locator(`.settings-pane .settings-section[data-section="${jumpedTo}"]`)
  ).toHaveCount(1);
  // And the fill carries on past the section the jump pulled forward.
  await settleSettingsPane(page.locator('.settings-pane'));
  await expect(page.locator(`.settings-nav [data-section="${jumpedTo}"]`)).toHaveClass(/active/);
  // The highlight follows the reading position, so pin that position too: the
  // section is parked at the top of the pane, not merely somewhere in view.
  await expect
    .poll(() => headingOffsetFromPaneTop(page, jumpedTo))
    .toBeLessThan(SECTION_LANDED_MAX_PX);
});
