import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ANDROID_UA,
  IPAD_UA,
  draw,
  drawCommittedStroke,
  gotoApp,
  openSettingsModal,
} from './helpers';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { TABLET_MIN_SIDE_PX } from '../src/lib/breakpoints';

const BANNER_MOUNT_TIMEOUT_MS = 20_000;
const SAFE_BOTTOM_PX = 34;
const BANNER_LAYOUT_TIMEOUT_MS = 5000;

async function earnBanner(page: Page) {
  await gotoApp(page);
  for (let stroke = 0; stroke < 3; stroke += 1) {
    await draw(page, [
      { x: 230, y: 180 + stroke * 30 },
      { x: 300, y: 195 + stroke * 30 },
    ]);
  }
  await page.locator('.install-banner').waitFor({ timeout: BANNER_MOUNT_TIMEOUT_MS });
}

test.use({ userAgent: IPAD_UA, hasTouch: true, isMobile: true });

for (const viewport of [
  { width: 375, height: 812 },
  { width: 440, height: 956 },
  { width: 744, height: 1133 },
  { width: 956, height: 440 },
  { width: 667, height: 375 },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${viewport.width}x${viewport.height} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });
      test('both banner states fit the safe area and leave corner controls reachable', async ({
        page,
      }) => {
        await earnBanner(page);
        await page.evaluate(
          (inset) => document.documentElement.style.setProperty('--safe-area-bottom', `${inset}px`),
          SAFE_BOTTOM_PX
        );
        const banner = page.locator('.install-banner');
        for (const expanded of [false, true]) {
          if (expanded) await banner.getByRole('button', { name: 'How?' }).click();
          await expect(
            banner.getByRole('button', { name: expanded ? 'Hide' : 'How?' })
          ).toHaveAttribute('aria-expanded', String(expanded));
          await expect(async () => {
            const bounds = await banner.evaluate((node) => {
              const r = node.getBoundingClientRect();
              return {
                leftInset: r.left,
                rightInset: innerWidth - r.right,
                top: r.top,
                bottomInset: innerHeight - r.bottom,
                horizontalOverflow: node.scrollWidth - node.clientWidth,
              };
            });
            expect(bounds.leftInset, 'left viewport inset').toBeGreaterThanOrEqual(16);
            expect(bounds.rightInset, 'right viewport inset').toBeGreaterThanOrEqual(16);
            expect(bounds.top, 'top viewport clearance').toBeGreaterThanOrEqual(0);
            expect(bounds.bottomInset, 'bottom safe-area clearance').toBeGreaterThanOrEqual(
              SAFE_BOTTOM_PX + 16
            );
            expect(bounds.horizontalOverflow, 'horizontal content overflow').toBeLessThanOrEqual(0);
          }).toPass({ timeout: BANNER_LAYOUT_TIMEOUT_MS });
          await page
            .getByRole('button', { name: 'Expand controls', exact: true })
            .click({ trial: true });
          await page.getByRole('button', { name: 'Settings', exact: true }).click({ trial: true });
        }
        const location =
          viewport.width < TABLET_MIN_SIDE_PX && viewport.height > viewport.width
            ? 'at the bottom of the screen'
            : 'in the Safari toolbar';
        await expect(banner.locator('li')).toHaveText(
          [
            `1 Tap Share ${location}.`,
            '2 Choose Add to Home Screen.',
            "3 Don't see it? Tap View More first.",
          ],
          { useInnerText: true }
        );
        await expect(banner.locator('.install-hint')).toHaveCSS('opacity', '1');
        const a11y = await new AxeBuilder({ page }).include('.install-banner').analyze();
        expect(a11y.violations).toEqual([]);
      });
    });
  }
}

test.describe('banner interactions', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('manual instructions collapse and update when the device rotates', async ({ page }) => {
    await earnBanner(page);
    const banner = page.locator('.install-banner');
    await banner.getByRole('button', { name: 'How?' }).click();
    await expect(banner.locator('li').first()).toContainText('at the bottom of the screen');
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(banner.locator('li').first()).toContainText('in the Safari toolbar');
    await banner.getByRole('button', { name: 'Hide' }).click();
    await expect(banner.locator('ol')).toBeHidden();
    await expect(banner.getByRole('button', { name: 'How?' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('corner controls work while instructions are open', async ({ page }) => {
    await earnBanner(page);
    const banner = page.locator('.install-banner');
    await banner.getByRole('button', { name: 'How?' }).click();
    await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
    await expect(banner).toBeHidden();
    await page.getByRole('button', { name: 'Collapse controls', exact: true }).click();
    await expect(banner.getByRole('button', { name: 'Hide' })).toBeVisible();
    await openSettingsModal(page);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  for (const initiallyOpen of [true, false]) {
    test(`drawing while the drawer is ${initiallyOpen ? 'persisted open' : 'opened over the banner'} preserves the install prompt`, async ({
      page,
    }) => {
      await page.addInitScript(({ key, open }) => localStorage.setItem(key, String(open)), {
        key: STORAGE_KEYS.drawerOpen,
        open: initiallyOpen,
      });
      await gotoApp(page);
      if (!initiallyOpen) {
        for (let stroke = 0; stroke < 3; stroke += 1) {
          await draw(page, [
            { x: 230, y: 180 },
            { x: 300, y: 195 },
          ]);
        }
        await page.locator('.install-banner').waitFor({ timeout: BANNER_MOUNT_TIMEOUT_MS });
        await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
      }
      for (let stroke = 0; stroke < 8; stroke += 1) {
        await draw(page, [
          { x: 230, y: 180 },
          { x: 300, y: 195 },
        ]);
      }
      await expect(page.locator('.install-banner')).toBeHidden();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.installDismissed)
      ).not.toBe('true');
      await page.getByRole('button', { name: 'Collapse controls', exact: true }).click();
      await expect(
        page.locator('.install-banner').getByRole('button', { name: 'How?' })
      ).toBeVisible();
      await draw(page, [
        { x: 230, y: 180 },
        { x: 300, y: 195 },
      ]);
      await expect(
        page.locator('.install-banner').getByRole('button', { name: 'How?' })
      ).toBeVisible();
    });
  }

  test('the empty dock band passes a stroke through to the drawing canvas', async ({ page }) => {
    await earnBanner(page);
    await page.getByRole('button', { name: 'How?' }).click();
    const start = await page.locator('#drawingCanvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const x = innerWidth / 2;
      const y = innerHeight - 24;
      return { target: document.elementFromPoint(x, y)?.id, x: x - rect.left, y: y - rect.top };
    });
    expect(start.target).toBe('drawingCanvas');
    await drawCommittedStroke(page, [
      { x: start.x, y: start.y },
      { x: start.x + 20, y: start.y },
    ]);
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
  });

  test('dismissal persists after reopening the app', async ({ page }) => {
    await earnBanner(page);
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.locator('.install-banner')).toBeHidden();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.installDismissed)
    ).toBe('true');
    await earnBannerAfterDismissal(page);
    await expect(page.locator('.install-banner')).toHaveCount(0);
  });
});

async function earnBannerAfterDismissal(page: Page) {
  await gotoApp(page);
  for (let stroke = 0; stroke < 3; stroke += 1) {
    await draw(page, [
      { x: 230, y: 180 },
      { x: 300, y: 195 },
    ]);
  }
}

test.describe('Chromium install', () => {
  test.use({ userAgent: ANDROID_UA, viewport: { width: 375, height: 812 } });

  test('the one-tap button invokes the captured install prompt', async ({ page }) => {
    await earnBanner(page);
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperties(event, {
        prompt: {
          value: async () => {
            document.documentElement.dataset.installPrompted = 'true';
          },
        },
        userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) },
      });
      window.dispatchEvent(event);
    });
    await page
      .locator('.install-banner')
      .getByRole('button', { name: 'Install', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-install-prompted', 'true');
    await expect(page.locator('.install-banner')).toBeHidden();
  });

  test('Android without a captured prompt keeps its browser-menu instructions', async ({
    page,
  }) => {
    await earnBanner(page);
    const banner = page.locator('.install-banner');
    await banner.getByRole('button', { name: 'How?' }).click();
    await expect(banner.locator('.install-hint')).toContainText('Open the ⋮ menu');
    await banner.getByRole('button', { name: 'Hide' }).click();
    await expect(banner.locator('.install-hint')).toBeHidden();
  });
});
