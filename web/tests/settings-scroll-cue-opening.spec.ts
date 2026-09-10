import { expect, test, type Page } from '@playwright/test';
import { gotoApp, openSettingsModal, SETTINGS_FILL_FRAME_BUDGET } from './helpers';

const IPAD_LANDSCAPE = { width: 1024, height: 768 };
const LARGE_IPAD_LANDSCAPE = { width: 1376, height: 1032 };

for (const viewport of [IPAD_LANDSCAPE, LARGE_IPAD_LANDSCAPE]) {
  test(`Settings includes its scroll cue from the opening frame at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page);
    const samples = await openingOpacities(page);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.filter((opacity) => opacity !== 1)).toEqual([]);
  });
}

function openingOpacities(page: Page) {
  return page.evaluate(
    (frameBudget) =>
      new Promise<number[]>((resolve, reject) => {
        const opacities: number[] = [];
        let frames = 0;
        const sample = () => {
          const dialog = document.querySelector<HTMLDialogElement>('#settingsModal');
          const pane = dialog?.querySelector('.settings-pane');
          const cue = dialog?.querySelector('.scroll-cue');
          if (dialog?.open && pane && cue) {
            opacities.push(Number(getComputedStyle(cue).opacity));
            if (pane.getAttribute('aria-busy') === 'false' && !dialog.getAnimations().length) {
              resolve(opacities);
              return;
            }
          } else {
            document.querySelector<HTMLElement>('#settingsButton')?.click();
          }
          if (++frames > frameBudget) reject(new Error('Settings did not finish opening'));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
    SETTINGS_FILL_FRAME_BUDGET
  );
}

test('Settings includes its scroll cue when prewarmed', async ({ page }) => {
  await page.setViewportSize(LARGE_IPAD_LANDSCAPE);
  await gotoApp(page);
  await expect(page.locator('.settings-pane')).toHaveAttribute('aria-busy', 'false', {
    timeout: 20_000,
  });
  const samples = await openingOpacities(page);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter((opacity) => opacity !== 1)).toEqual([]);
});

test('Settings includes its scroll cue when reopened from the bottom', async ({ page }) => {
  await page.setViewportSize(LARGE_IPAD_LANDSCAPE);
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await modal
    .locator('.settings-pane')
    .evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
  await expect(modal.locator('.scroll-cue')).toHaveCSS('opacity', '0');
  await modal.locator('.modal-close-btn').click();
  await expect(modal).not.toBeVisible();
  const samples = await openingOpacities(page);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter((opacity) => opacity !== 1)).toEqual([]);
});
