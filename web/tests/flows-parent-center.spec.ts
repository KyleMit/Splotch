import { expect, test, type Locator } from '@playwright/test';
import { gotoApp, openSettingsModal, reloadAfterDialogClose } from './helpers';
import { policyPicker, solveParentalGate } from './flows-harness';

// Parent Center persists an independent Grown-Ups Only policy for each protected
// feature (ADR-0094). External links offer all three modes on web and Android;
// native iOS keeps Never visible but unavailable, with its App Store rationale
// disclosed inline. This suite drives the web build, which ships every policy at
// Never — the test below that seeds nothing is what pins those shipped defaults.

// Every operation Parent Center holds a policy for, by the name it carries there.
const PROTECTED_FEATURES = [
  'Generating an AI image',
  'Reporting an AI result',
  'Viewing external links',
  'Sending feedback',
  'Opening Parent Center',
];

// Turning Parent Center's own check off is confirmed first, and warned about
// while it holds — flows-parent-center-warning.spec.ts owns that flow. The
// persistence spec below only has to get past the confirmation.
const UNPROTECTED_CONFIRM = 'dialog.unprotected-confirm';

// Seeds nothing: the point is what the web build itself ships. The gate is an
// app-store requirement, so on the web every check starts off and each one is a
// parent's opt-in — Parent Center included, which is why it opens unasked here.
// The native build arms them all, and only its own suites can see that.
test('the web build ships every grown-up check off', async ({ page }) => {
  await gotoApp(page, '/', { gates: 'default' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();

  await expect(page.locator('#parentalGate')).not.toBeVisible();
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible();
  for (const feature of PROTECTED_FEATURES) {
    await expect(
      policyPicker(settings, feature).getByRole('radio', { name: 'Never' })
    ).toHaveAttribute('aria-checked', 'true');
  }
});

test('Parent Center is gated before its controls appear and persists every feature policy', async ({
  page,
}) => {
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();

  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  // The wide shell stacks every section in one scroll, so the controls are not
  // merely un-navigated-to: a lock card stands in their place until the gate is
  // solved, and scrolling past cannot reveal them.
  await expect(settings.getByText(/Choose when Splotch should ask/)).not.toBeVisible();
  await expect(settings.getByRole('button', { name: 'Unlock these settings' })).toBeVisible();
  await solveParentalGate(page);
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible({ timeout: 5000 });

  for (const feature of PROTECTED_FEATURES) {
    await expect(policyPicker(settings, feature)).toBeVisible();
  }

  await policyPicker(settings, 'Generating an AI image')
    .getByRole('radio', { name: 'Per session' })
    .click();
  await policyPicker(settings, 'Viewing external links')
    .getByRole('radio', { name: 'Never' })
    .click();
  await policyPicker(settings, 'Opening Parent Center')
    .getByRole('radio', { name: 'Never' })
    .click();
  await page.locator(UNPROTECTED_CONFIRM).getByRole('button', { name: 'Turn it off' }).click();

  await settings.getByRole('button', { name: 'Close' }).click();
  await reloadAfterDialogClose(page);
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  const reopened = await openSettingsModal(page);
  await reopened.getByRole('button', { name: 'Parent Center' }).click();
  await expect(gate).not.toBeVisible();
  await expect(
    policyPicker(reopened, 'Generating an AI image').getByRole('radio', { name: 'Per session' })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    policyPicker(reopened, 'Viewing external links').getByRole('radio', { name: 'Never' })
  ).toHaveAttribute('aria-checked', 'true');
});

// Widest overrun any box in the Parent Center forces on its own content.
// Degenerate boxes are skipped: a visually-hidden label is a clipped 1px square
// holding a whole word, so it always overruns itself without ever being able to
// push the layout sideways.
const VISUALLY_HIDDEN_MAX_PX = 1;

function worstHorizontalOverflow(settings: Locator) {
  return settings
    .locator('.parent-center')
    .evaluate(
      (root, degeneratePx) =>
        [root, ...root.querySelectorAll<HTMLElement>('*')]
          .filter((element) => element.clientWidth > degeneratePx)
          .reduce(
            (worst, element) => Math.max(worst, element.scrollWidth - element.clientWidth),
            0
          ),
      VISUALLY_HIDDEN_MAX_PX
    );
}

test('Parent Center card toggles fit a small mobile screen without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();

  const cards = settings.locator('.policy-card');
  await expect(cards).toHaveCount(5);
  await expect(cards.getByRole('radiogroup')).toHaveCount(5);
  await expect(cards.first().getByRole('radio')).toHaveCount(3);
  // The web build ships Parent Center's own check off, so the standing warning
  // is part of what has to fit here.
  await expect(settings.locator('.protection-warning')).toBeVisible();
  await expect.poll(() => worstHorizontalOverflow(settings)).toBeLessThanOrEqual(1);
});

test('Parent Center reads as a mode matrix once the settings pane is wide enough', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 744 });
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  // The table of contents unlocks Parent Center on the way to it, and gotoApp
  // seeds the gate to Never, so the jump reveals the policies outright.
  await settings.locator('.settings-nav .toc-row[data-section="parentCenter"]').click();

  // The shared column headings replace the per-option labels, which stay in the
  // DOM as each radio's accessible name.
  await expect(settings.locator('.policy-header')).toBeVisible();
  const aiImage = policyPicker(settings, 'Generating an AI image');
  await expect(aiImage.getByRole('radio', { name: 'Per session' })).toBeVisible();

  // The standing warning spans both columns rather than squeezing into one.
  await expect(settings.locator('.protection-warning')).toBeVisible();

  // Every policy's controls land in one shared column — that is what the matrix
  // buys over the stacked cards, and it is only honest if nothing scrolls sideways.
  await expect
    .poll(async () => {
      const lefts = await settings
        .locator('.policy-card .picker')
        .evaluateAll((tracks) =>
          tracks.map((track) => Math.round(track.getBoundingClientRect().x))
        );
      return new Set(lefts).size;
    })
    .toBe(1);
  await expect.poll(() => worstHorizontalOverflow(settings)).toBeLessThanOrEqual(1);
});

test('iOS explains why external links cannot use Never without changing the policy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    globalThis.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };
  });
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();
  await solveParentalGate(page);

  const externalLinks = policyPicker(settings, 'Viewing external links');
  const never = externalLinks.getByRole('radio', { name: 'Never' });
  await expect(never).toBeDisabled();
  await never.click({ force: true });

  await expect(settings.getByText('Why Never is unavailable on iOS')).toBeVisible();
  await expect(externalLinks.getByRole('radio', { name: 'Every time' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
});
