import { expect, test, type Locator } from '@playwright/test';
import { gotoApp, openSettingsModal } from './helpers';

const TARGET_MIN_PX = 48;
const compactViewports = [
  { name: 'portrait', width: 320, height: 740 },
  { name: 'landscape', width: 740, height: 320 },
] as const;

async function expectTargetsMeetFloor(targets: Locator) {
  const bounds = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') ?? element.textContent,
        width: box.width,
        height: box.height,
      };
    })
  );
  expect(bounds.length).toBeGreaterThan(0);
  for (const box of bounds) {
    expect(box.width, `${box.label} width`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
    expect(box.height, `${box.label} height`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
  }
}

for (const viewport of compactViewports) {
  test(`shared button and picker variants keep both target axes in compact ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/design');
    await expectTargetsMeetFloor(
      page.locator(
        '.button-specimens .btn:not([inert]), .picker-demo .option, .theme-toggle .option'
      )
    );
    const labels = page.locator('.picker-demo .chip .option-label');
    await labels.first().evaluate((element) => {
      element.textContent = 'A longer setting label that wraps inside its choice';
    });
    const clipped = await labels.evaluateAll((elements) =>
      elements.some((element) => element.scrollWidth > element.clientWidth)
    );
    expect(clipped).toBe(false);
  });
}

test('a short button label and compressed filled picker keep their width floor', async ({
  page,
}) => {
  await page.goto('/design');
  const button = page.getByRole('group', { name: 'Button sizes', exact: true }).locator('.btn.sm');
  await button.evaluate((element) => {
    element.textContent = 'I';
    element.setAttribute('style', 'padding:0');
  });
  const picker = page.getByRole('radiogroup', { name: 'Theme (specimen)', exact: true });
  await picker.evaluate((element) => element.setAttribute('style', 'width:100px'));
  await expectTargetsMeetFloor(button);
  await expectTargetsMeetFloor(picker.locator('.option'));
});

test('hub switch targets occupy separate rows and remain keyboard operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  const night = page.locator('#hubNightToggle');
  const sound = page.locator('#hubSoundToggle');
  await expectTargetsMeetFloor(modal.locator('.toggle-switch'));
  const nightBox = (await night.boundingBox())!;
  const soundBox = (await sound.boundingBox())!;
  expect(nightBox.y + nightBox.height).toBeLessThan(soundBox.y);
  await night.focus();
  await page.keyboard.press('Space');
  await expect(night).toHaveAttribute('aria-checked', 'true');
  await expect(night).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(night).toHaveAttribute('aria-checked', 'false');
  await expect(night).toBeFocused();
});

for (const viewport of compactViewports) {
  test(`Settings close and switches fit compact ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page);
    const modal = await openSettingsModal(page);
    await expectTargetsMeetFloor(modal.locator('.dialog-header-control, .toggle-switch'));
    const overflow = await modal.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
  });
}

test('portrait Appearance choices keep both target axes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await modal.locator('button[data-section="appearance"]').click();
  await expect(page.locator('#themeOption-dark')).toBeVisible();
  await expectTargetsMeetFloor(modal.locator('.picker .option'));
});

test.describe('touch activation', () => {
  test.use({ hasTouch: true });

  test('the shared Button accepts its lower target edge and ignores a touch below it', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/design');
    const card = page.getByRole('group', { name: 'Busy button', exact: true });
    const button = card.getByRole('button');
    await card.scrollIntoViewIfNeeded();
    await expect(button).toBeDisabled();
    await page.clock.fastForward(10_000);
    await expect(button).toBeEnabled();
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(TARGET_MIN_PX);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + TARGET_MIN_PX);
    await expect(button).toBeEnabled();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 1);
    await expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
