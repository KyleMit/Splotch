import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';

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

// Frames to keep sampling for if the pane never completes — a bound on a broken
// run, not a schedule. The fill waits out the card's fly-in before it starts, so
// a healthy run is that animation plus a frame per section, and this is several
// times either.
const FILL_FRAME_LIMIT = 300;

/** Section bodies in the pane on each frame, from the frame the pane appears. */
function paneFillPerFrame(page: Page, frameLimit: number) {
  return page.evaluate(
    (frameLimit) =>
      new Promise<{ rows: number; sections: number[] }>((resolve) => {
        const sections: number[] = [];
        const rows = () => document.querySelectorAll('.settings-nav-item').length;
        const step = () => {
          const pane = document.querySelector('.settings-pane');
          if (!pane) {
            document.querySelector<HTMLElement>('#settingsButton')!.click();
          } else {
            sections.push(pane.querySelectorAll('.settings-section').length);
          }
          if (sections.at(-1) === rows() || sections.length >= frameLimit) {
            resolve({ rows: rows(), sections });
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

  const { rows, sections } = await paneFillPerFrame(page, FILL_FRAME_LIMIT);

  expect(rows).toBeGreaterThan(1);
  expect(sections[0]).toBeGreaterThan(0);
  expect(sections[0]).toBeLessThan(rows);
  expect(sections.at(-1)).toBe(rows);
  // A watermark, never lowered — nothing that arrived is taken back out.
  expect(sections).toEqual([...sections].sort((a, b) => a - b));
});

test('the pane reports itself busy until the last section is in', async ({ page }) => {
  // The flag is what every harness and helper waits on to know the offsets it is
  // about to read are final, so it has to clear exactly when the pane is whole.
  await gotoApp(page);
  await page.locator('#settingsButton').click();

  const pane = page.locator('.settings-pane');
  await expect(pane).toHaveAttribute('aria-busy', 'false');
  const rows = await page.locator('.settings-nav-item').count();
  await expect(pane.locator('.settings-section')).toHaveCount(rows);
});

test('a jump to a section that has not arrived yet still reaches it', async ({ page }) => {
  // The whole table of contents is clickable from the first frame, so a row can
  // be tapped while the pane behind it is still one section deep. The jump has
  // to mount what it was asked for rather than quietly do nothing. Tapped on the
  // second frame the pane exists for: the first belongs to the open reset, which
  // parks the pane on the landing section and would scroll over an earlier tap.
  //
  // Scored on the reading position reaching the section rather than on the exact
  // landing offset settings-toc.spec.ts pins: a tap this early also races the
  // conditional reveals that persisted state and the free-generation fetch open
  // in the sections above, and each one shifts a heading already scrolled for.
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
          const rows = document.querySelectorAll<HTMLElement>('.settings-nav .settings-nav-item');
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
  await expect(page.locator(`.settings-nav [data-section="${jumpedTo}"]`)).toHaveClass(/active/);
  // And the fill carries on past the section the jump pulled forward.
  await expect(page.locator('.settings-pane')).toHaveAttribute('aria-busy', 'false');
});
