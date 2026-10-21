import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings, solveParentGate } from '../support/group-c.ts';

// The privacy page has no Settings button: Parent Center is reached through a gated link's
// challenge, retargeted by its footer, and the page opens Parent Center on demand, as a dialog of
// its own.

const GATED_LINK = 'OpenAI Services Agreement';
const LINK_CHECK = 'Viewing external links parental gate frequency';
const PARENT_CENTER_CHECK = 'Opening Parent Center parental gate frequency';
const MANAGE_FOOTER = 'Manage these checks in Settings Parent Center';
const MANAGE_SUBTITLE = 'Solve the problem to manage grown-up checks';
// A click before the page has hydrated reaches a link nothing listens to yet.
const RETRY_STEP_MS = 1_000;
// A point in the window's corner, outside the dialog's card.
const BACKDROP_TAP_PX = 5;

// The web starts every check on Never, so the checks are set to Every time from the drawing
// screen, and the privacy page reads them back from the device.
async function askForEveryCheck(page: Page) {
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();
  for (const check of [LINK_CHECK, PARENT_CENTER_CHECK])
    await settings
      .getByRole('radiogroup', { name: check })
      .getByRole('radio', { name: 'Every time' })
      .click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
}

// Reaches Parent Center the way the privacy page offers it: a gated link's challenge, retargeted by
// its footer, then solved.
async function openPrivacyParentCenter(page: Page) {
  await openDocument(page, '/privacy');
  const gate = page.getByRole('dialog', { name: 'Grown-Ups Only' });
  const link = page.getByRole('link', { name: GATED_LINK });
  await expect(async () => {
    await link.click({ timeout: RETRY_STEP_MS });
    await expect(gate).toBeVisible({ timeout: RETRY_STEP_MS });
  }).toPass();
  await gate.getByRole('button', { name: MANAGE_FOOTER }).click();
  await expect(gate.getByText(MANAGE_SUBTITLE)).toBeVisible();
  await solveParentGate(page);
  const parentCenter = page.getByRole('dialog', { name: 'Parent Center' });
  await expect(parentCenter).toBeVisible();
  return parentCenter;
}

test('Parent Center reached from privacy reads the checks the device saved', async ({ page }) => {
  await askForEveryCheck(page);

  const parentCenter = await openPrivacyParentCenter(page);

  for (const check of [LINK_CHECK, PARENT_CENTER_CHECK])
    await expect(
      parentCenter
        .getByRole('radiogroup', { name: check })
        .getByRole('radio', { name: 'Every time' })
    ).toBeChecked();
});

// Closing must still run the dialog's own close, which hands focus back to where the trip began.
const PARENT_CENTER_DISMISSALS = [
  {
    name: 'its close button',
    dismiss: (page: Page) =>
      page
        .getByRole('dialog', { name: 'Parent Center' })
        .getByRole('button', { name: 'Close' })
        .click(),
  },
  { name: 'Escape', dismiss: (page: Page) => page.keyboard.press('Escape') },
  {
    name: 'a backdrop tap',
    dismiss: (page: Page) => page.mouse.click(BACKDROP_TAP_PX, BACKDROP_TAP_PX),
  },
] as const;

for (const { name, dismiss } of PARENT_CENTER_DISMISSALS) {
  test(`closing Parent Center with ${name} returns focus to the link that opened it`, async ({
    page,
  }) => {
    await askForEveryCheck(page);
    const parentCenter = await openPrivacyParentCenter(page);

    await dismiss(page);

    await expect(parentCenter).toBeHidden();
    await expect(page.getByRole('link', { name: GATED_LINK })).toBeFocused();
  });
}
