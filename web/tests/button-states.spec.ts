import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} buttons`, () => {
    test.use({ colorScheme: theme });

    test('disabled variants use neutral colors and ignore hover and press', async ({ page }) => {
      await page.goto('/design');
      const states = page.getByRole('group', { name: 'Button states', exact: true });
      await states.scrollIntoViewIfNeeded();
      const disabled = states.locator('button:disabled');
      await expect(disabled).toHaveCount(4);
      const colors = await disabled.evaluateAll((buttons) =>
        buttons.map((button) => {
          const style = getComputedStyle(button);
          const probe = document.createElement('span');
          probe.style.color = 'var(--text-soft)';
          probe.style.backgroundColor = 'var(--control-track)';
          probe.style.border = '1px solid var(--border)';
          button.after(probe);
          const tokens = getComputedStyle(probe);
          const result = {
            neutralLabel: style.color === tokens.color,
            neutralFill: button.classList.contains('outline')
              ? style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
                style.borderColor === tokens.borderColor
              : style.backgroundColor === tokens.backgroundColor,
            opacity: style.opacity,
          };
          probe.remove();
          return result;
        })
      );
      expect(colors).toEqual(
        Array.from({ length: 4 }, () => ({
          neutralLabel: true,
          neutralFill: true,
          opacity: '0.7',
        }))
      );
      const button = disabled.first();
      const fill = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
      await button.hover();
      await page.mouse.down();
      await expect(button).toHaveCSS('transform', 'none');
      await expect(button).toHaveCSS('background-color', fill);
      await page.mouse.up();
    });

    test('busy auto-plays on visibility, hands back control, and can replay', async ({ page }) => {
      await page.clock.install();
      await page.goto('/design');
      const card = page.getByRole('group', { name: 'Busy button', exact: true });
      const button = card.getByRole('button');
      await expect(button).toBeEnabled();
      await card.scrollIntoViewIfNeeded();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button).toBeDisabled();
      await expect(button).toHaveText('Sending…');
      await expect(button).toHaveCSS('opacity', '1');
      await expect(button).toHaveCSS('cursor', 'progress');
      await expect(button.locator('.ring')).toBeVisible();
      await expect(button).toHaveCSS(
        'background-color',
        await page
          .getByRole('group', { name: 'Button sizes', exact: true })
          .getByRole('button')
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor)
      );
      await page.clock.fastForward(10_000);
      await expect(button).toBeEnabled();
      await expect(button).toHaveText('Send report');
      await expect(button.locator('.ring')).toHaveCount(0);
      await page.locator('header').scrollIntoViewIfNeeded();
      await card.scrollIntoViewIfNeeded();
      await expect(button).toBeEnabled();
      await button.click();
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('aria-busy', 'true');
    });
  });
}

test('busy ring stops animating for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design');
  const card = page.getByRole('group', { name: 'Busy button', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.ring')).toHaveCSS('animation-name', 'none');
});

test('changing the preview theme gives its busy specimen one auto-play', async ({ page }) => {
  await page.clock.install();
  await page.goto('/design');
  const card = page.getByRole('group', { name: 'Busy button', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('button')).toBeDisabled();
  await page.clock.fastForward(10_000);
  await expect(card.getByRole('button')).toBeEnabled();
  await page.locator('header').getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('button')).toHaveAttribute('aria-busy', 'true');
});

test('button matrix fits a narrow phone without making its previews interactive', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/design');
  const specimens = page.locator('.button-specimens');
  await specimens.scrollIntoViewIfNeeded();
  const states = page.getByRole('group', { name: 'Button states', exact: true });
  await expect(states.getByRole('button')).toHaveCount(8);
  const previews = states.locator('button[aria-hidden="true"]');
  await expect(previews).toHaveCount(8);
  expect(
    await previews.evaluateAll((buttons) =>
      buttons.every((button) => button.hasAttribute('inert') && button.tabIndex === -1)
    )
  ).toBe(true);
  const bounds = await specimens.evaluate((element) => ({
    right: element.getBoundingClientRect().right,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(bounds.right).toBeLessThanOrEqual(320);
  expect(bounds.scrollWidth).toBe(bounds.clientWidth);
});
