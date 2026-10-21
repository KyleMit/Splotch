import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// Each grown-up check is a three-way picker whose selection sits inside its track, so a choice
// reads as held by it. Parent Center is measured on a portrait tablet, where the wide Settings
// shell stacks it among the other sections.

const CHECK_COUNT = 5;
// The track is this wide with this much inset on every side.
const TRACK_WIDTH_PX = 180;
const TRACK_INSET_PX = 4;
// Chromium lays out in 1/64px units, so three flexed options sharing the track's inner run cannot
// all end on whole pixels. A selection that escapes its track is a whole pixel or more out.
const LAYOUT_UNIT_PX = 1 / 64;
const PORTRAIT_TABLET = { width: 1032, height: 1376 };

test('every grown-up check keeps its selection inside its track on a portrait tablet', async ({
  page,
}) => {
  await page.setViewportSize(PORTRAIT_TABLET);
  await page.emulateMedia({ colorScheme: 'light' });
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();
  const tracks = settings.getByRole('radiogroup', { name: /parental gate frequency$/ });
  await expect(tracks).toHaveCount(CHECK_COUNT);

  const insets = await tracks.evaluateAll((nodes) =>
    nodes.map((track) => {
      const outer = track.getBoundingClientRect();
      const options = [...track.querySelectorAll('[role="radio"]')].map((option) =>
        option.getBoundingClientRect()
      );
      return {
        width: outer.width,
        left: options[0].left - outer.left,
        right: outer.right - options[options.length - 1].right,
        top: options[0].top - outer.top,
        bottom: outer.bottom - options[0].bottom,
      };
    })
  );

  expect(insets).toHaveLength(CHECK_COUNT);
  for (const inset of insets) {
    expect(inset.width).toBe(TRACK_WIDTH_PX);
    for (const side of ['left', 'right', 'top', 'bottom'] as const)
      expect(Math.abs(inset[side] - TRACK_INSET_PX), `${side} inset`).toBeLessThanOrEqual(
        LAYOUT_UNIT_PX
      );
  }
});
