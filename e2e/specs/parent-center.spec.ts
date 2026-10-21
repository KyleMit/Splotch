import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import {
  closeDialog,
  gateCard,
  gatePolicy,
  goToSettingsSection,
  openSettings,
  solveGate,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// Every operation Parent Center holds a policy for, by the name it carries there.
const PROTECTED_FEATURES = [
  'Generating an AI image',
  'Reporting an AI result',
  'Viewing external links',
  'Sending feedback',
  'Opening Parent Center',
] as const;

const PARENT_CENTER = 'Opening Parent Center';
const PARENT_CENTER_INTRO = /Choose when Splotch should ask/;
const PARENT_CENTER_LOCK = /Parent Center decides when Splotch asks for a grown-up check/;
const MANAGING_SUBTITLE = 'Solve the problem to manage grown-up checks';
const UNPROTECTED_CONSEQUENCE = /Anyone using this device can open Parent Center/;

type GateMode = 'Every time' | 'Per session' | 'Never';

async function openParentCenter(page: Page): Promise<Locator> {
  const settings = await openSettings(page);
  await goToSettingsSection(settings, 'Parent Center');
  return settings;
}

async function chooseMode(settings: Locator, feature: string, mode: GateMode) {
  await gatePolicy(settings, feature).getByRole('radio', { name: mode, exact: true }).click();
}

async function expectMode(settings: Locator, feature: string, mode: GateMode) {
  await expect(
    gatePolicy(settings, feature).getByRole('radio', { name: mode, exact: true })
  ).toBeChecked();
}

// Turns Parent Center's own check on, then reopens its pane: Settings jumps there, and the challenge
// it now asks is already up in front of the locked pane.
async function reopenBehindItsCheck(page: Page): Promise<Locator> {
  const settings = await openParentCenter(page);
  await chooseMode(settings, PARENT_CENTER, 'Every time');
  await closeDialog(settings);
  const reopened = await openParentCenter(page);
  await expect(gateCard(page).getByText(MANAGING_SUBTITLE)).toBeVisible();
  return reopened;
}

async function unlockWithChallenge(page: Page, settings: Locator) {
  await solveGate(page);
  await expect(settings.getByText(PARENT_CENTER_INTRO)).toBeVisible();
}

test.describe('Parent Center', () => {
  test('the web export ships every grown-up check off, and Parent Center opens unasked', async ({
    drawingScreen,
  }) => {
    const settings = await openParentCenter(drawingScreen.page);

    await expect(gateCard(drawingScreen.page)).toBeHidden();
    await expect(settings.getByText(PARENT_CENTER_INTRO)).toBeVisible();
    for (const feature of PROTECTED_FEATURES) await expectMode(settings, feature, 'Never');
  });

  test('turning its own check on locks the pane until a grown-up solves the problem', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await reopenBehindItsCheck(page);

    await gateCard(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(gateCard(page)).toBeHidden();
    await expect(settings.getByText(PARENT_CENTER_LOCK)).toBeVisible();
    await expect(settings.getByText(PARENT_CENTER_INTRO)).toBeHidden();
    await settings.getByRole('button', { name: 'Unlock these settings' }).click();
    await unlockWithChallenge(page, settings);

    for (const feature of PROTECTED_FEATURES) {
      await expect(gatePolicy(settings, feature)).toBeVisible();
    }
  });

  test('every feature keeps its own policy across a reload', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const settings = await openParentCenter(page);
    await chooseMode(settings, 'Generating an AI image', 'Per session');
    await chooseMode(settings, 'Viewing external links', 'Every time');
    await chooseMode(settings, 'Sending feedback', 'Per session');
    await closeDialog(settings);

    await page.reload();
    await waitForDrawingScreen(page);
    const reopened = await openParentCenter(page);

    await expectMode(reopened, 'Generating an AI image', 'Per session');
    await expectMode(reopened, 'Viewing external links', 'Every time');
    await expectMode(reopened, 'Sending feedback', 'Per session');
    await expectMode(reopened, 'Reporting an AI result', 'Never');
  });

  test('choosing Never for Parent Center itself asks first, and Keep it on cancels', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await reopenBehindItsCheck(page);
    await unlockWithChallenge(page, settings);

    await chooseMode(settings, PARENT_CENTER, 'Never');
    const confirm = page.getByRole('dialog', { name: 'Turn off the Parent Center check?' });
    await expect(confirm.getByText(UNPROTECTED_CONSEQUENCE)).toBeVisible();
    await confirm.getByRole('button', { name: 'Keep it on' }).click();

    await expect(confirm).toBeHidden();
    await expectMode(settings, PARENT_CENTER, 'Every time');
    await expect(settings.getByText('This check is off')).toBeHidden();
  });

  test('confirming leaves a standing warning that survives a reload and asks nothing again', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await reopenBehindItsCheck(page);
    await unlockWithChallenge(page, settings);

    await chooseMode(settings, PARENT_CENTER, 'Never');
    await page
      .getByRole('dialog', { name: 'Turn off the Parent Center check?' })
      .getByRole('button', { name: 'Turn it off' })
      .click();
    await expectMode(settings, PARENT_CENTER, 'Never');
    await expect(settings.getByText(UNPROTECTED_CONSEQUENCE)).toBeVisible();
    await closeDialog(settings);

    await page.reload();
    await waitForDrawingScreen(page);
    const reopened = await openParentCenter(page);

    await expect(gateCard(page)).toBeHidden();
    await expect(reopened.getByText(UNPROTECTED_CONSEQUENCE)).toBeVisible();
    await chooseMode(reopened, PARENT_CENTER, 'Never');
    await expect(
      page.getByRole('dialog', { name: 'Turn off the Parent Center check?' })
    ).toBeHidden();
  });

  test('the other modes change with no warning', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const settings = await openParentCenter(page);

    await chooseMode(settings, 'Sending feedback', 'Every time');
    await chooseMode(settings, 'Sending feedback', 'Never');
    await expectMode(settings, 'Sending feedback', 'Never');
    await chooseMode(settings, PARENT_CENTER, 'Per session');

    await expect(
      page.getByRole('dialog', { name: 'Turn off the Parent Center check?' })
    ).toBeHidden();
  });

  test('the warning can be reached and dismissed from the keyboard alone', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await reopenBehindItsCheck(page);
    await unlockWithChallenge(page, settings);

    await gatePolicy(settings, PARENT_CENTER)
      .getByRole('radio', { name: 'Every time', exact: true })
      .focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    const confirm = page.getByRole('dialog', { name: 'Turn off the Parent Center check?' });
    await expect(confirm).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (name) =>
            document
              .querySelector(`[role="dialog"][aria-label="${name}"]`)
              ?.contains(document.activeElement) ?? false,
          'Turn off the Parent Center check?'
        )
      )
      .toBe(true);

    await page.keyboard.press('Escape');

    await expect(confirm).toBeHidden();
    await expectMode(settings, PARENT_CENTER, 'Per session');
  });
});
