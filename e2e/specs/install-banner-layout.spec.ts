import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import type { DrawingScreen } from '../support/drawing.ts';
import { waitForDrawingScreen } from '../support/app.ts';

// A tablet's Safari: the banner's manual steps name the Share sheet, and its place on screen is
// what these specs pin. The agent is the one iPadOS sends.
const IPAD_USER_AGENT =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
test.use({ userAgent: IPAD_USER_AGENT, hasTouch: true, isMobile: true, colorScheme: 'light' });

const EARNING_STROKES = 3;
const STROKE_ROW_SPACING = 0.05;
const FIRST_STROKE_ROW = 0.3;
// The banner mounts behind a lazily loaded chunk once the strokes earn it.
const BANNER_MOUNT_TIMEOUT_MS = 20_000;
const BANNER_EDGE_MARGIN_PX = 16;
const PHONE_PORTRAIT = { width: 375, height: 812 };
const PHONE_LANDSCAPE = { width: 812, height: 375 };
const VIEWPORTS = [
  PHONE_PORTRAIT,
  { width: 744, height: 1133 },
  { width: 956, height: 440 },
  { width: 667, height: 375 },
] as const;

async function earnBanner(drawingScreen: DrawingScreen) {
  for (let stroke = 0; stroke < EARNING_STROKES; stroke++) {
    const row = FIRST_STROKE_ROW + stroke * STROKE_ROW_SPACING;
    await drawingScreen.drawStroke([
      { x: 0.3, y: row },
      { x: 0.6, y: row + STROKE_ROW_SPACING / 2 },
    ]);
  }
  await expect(drawingScreen.page.getByRole('button', { name: 'How?' })).toBeVisible({
    timeout: BANNER_MOUNT_TIMEOUT_MS,
  });
}

// What the banner is made of: its sentence and its two buttons, whichever is showing.
function bannerParts(page: Page): Locator[] {
  return [
    page.getByText('Add Splotch to your home screen'),
    page.getByRole('button', { name: /^(How\?|Hide)$/ }),
    page.getByRole('button', { name: 'Not now', exact: true }),
  ];
}

async function expectBannerInsideTheWindow(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The window has no size');
  for (const part of bannerParts(page)) {
    const box = await part.boundingBox();
    expect(box, 'a banner part is laid out').not.toBeNull();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(BANNER_EDGE_MARGIN_PX);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width - BANNER_EDGE_MARGIN_PX
    );
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height - BANNER_EDGE_MARGIN_PX
    );
  }
}

test.describe('the install banner on a tablet or phone', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });

      test('both banner states sit inside the window and leave the corner controls pressable', async ({
        drawingScreen,
      }) => {
        const { page } = drawingScreen;
        await earnBanner(drawingScreen);

        for (const state of ['collapsed', 'expanded'] as const) {
          if (state === 'expanded') await page.getByRole('button', { name: 'How?' }).click();
          await expect(
            page.getByRole('button', { name: state === 'expanded' ? 'Hide' : 'How?' })
          ).toHaveAttribute('aria-expanded', String(state === 'expanded'));
          await expect(() => expectBannerInsideTheWindow(page)).toPass();
          await page
            .getByRole('button', { name: 'Expand controls', exact: true })
            .click({ trial: true });
          await page.getByRole('button', { name: 'Settings', exact: true }).click({ trial: true });
        }
        await expect(page.getByRole('listitem')).toHaveText([
          /^1Tap\s+Share\s+\S/,
          /^2Choose\s+Add to Home Screen\./,
          /^3Don't see it\? Tap\s+View More first\./,
        ]);
      });
    });
  }
});

test.describe('the install banner when it is used', () => {
  test.use({ viewport: PHONE_PORTRAIT });

  test('its manual steps follow the device as it turns, and Hide folds them away', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await earnBanner(drawingScreen);
    await page.getByRole('button', { name: 'How?' }).click();
    await expect(page.getByRole('listitem').first()).toContainText('at the bottom of the screen');

    await page.setViewportSize(PHONE_LANDSCAPE);
    await expect(page.getByRole('listitem').first()).toContainText('in the Safari toolbar');

    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'How?' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('the corner controls keep working while the steps are open', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await earnBanner(drawingScreen);
    await page.getByRole('button', { name: 'How?' }).click();

    await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeHidden();
    await page.getByRole('button', { name: 'Collapse controls', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });

  test('Not now hides it for good, and drawing after a reload does not bring it back', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await earnBanner(drawingScreen);

    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(page.getByRole('button', { name: 'How?' })).toBeHidden();

    await page.reload();
    await waitForDrawingScreen(page);
    for (const row of [0.3, 0.35, 0.4]) {
      await drawingScreen.drawStroke([
        { x: 0.3, y: row },
        { x: 0.6, y: row + STROKE_ROW_SPACING / 2 },
      ]);
    }
    await expect(page.getByRole('button', { name: 'How?' })).toHaveCount(0);
  });

  test('the empty band above the screen edge passes a stroke through to the paper', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await earnBanner(drawingScreen);
    await page.getByRole('button', { name: 'How?' }).click();

    const stroke = await drawingScreen.drawStroke([
      { x: 0.5, y: 0.97 },
      { x: 0.6, y: 0.97 },
    ]);

    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
  });
});
