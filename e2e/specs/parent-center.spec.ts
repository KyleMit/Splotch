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
  waitUntilSettled,
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

const SMALL_PHONE = { width: 320, height: 568 };
// Wide enough that Settings keeps its table of contents beside the pane and the pane lays the
// policies out as a matrix.
const WIDE_SETTINGS = { width: 1133, height: 744 };
// A degenerate box is skipped: a visually-hidden label is a clipped one-pixel square holding a whole
// word, so it always overruns itself without ever being able to push the layout sideways.
const VISUALLY_HIDDEN_MAX_PX = 1;
const SUBPIXEL_OVERRUN_PX = 1;
const ALL_POLICY_GROUPS = /parental gate frequency$/;

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

// The widest overrun any box holding the policies forces on its own content, measured from the
// smallest box that holds every policy group.
function worstOverrunAroundPolicies(settings: Locator): Promise<number> {
  return settings
    .getByRole('radiogroup', { name: ALL_POLICY_GROUPS })
    .evaluateAll((groups, degeneratePx) => {
      let root: Element = groups[0];
      while (!groups.every((group) => root.contains(group))) {
        if (!root.parentElement) throw new Error('The policy groups share no ancestor');
        root = root.parentElement;
      }
      return [root, ...root.querySelectorAll<HTMLElement>('*')]
        .filter((element) => element.clientWidth > degeneratePx)
        .reduce((worst, element) => Math.max(worst, element.scrollWidth - element.clientWidth), 0);
    }, VISUALLY_HIDDEN_MAX_PX);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Nothing is laid out to measure');
  return box;
}

test.describe('Parent Center layout', () => {
  test.describe('on a small phone', () => {
    test.use({ viewport: SMALL_PHONE });

    test('the policy cards stack inside the screen without scrolling sideways', async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      const hub = await openSettings(page);
      await hub.getByRole('button', { name: /^Parent Center, / }).click();
      const pane = page.getByRole('dialog', { name: 'Parent Center' });
      await waitUntilSettled(pane.getByRole('button', { name: 'Back', exact: true }));

      await expect(pane.getByRole('radiogroup', { name: ALL_POLICY_GROUPS })).toHaveCount(
        PROTECTED_FEATURES.length
      );
      const tops: number[] = [];
      for (const feature of PROTECTED_FEATURES) {
        const box = await boxOf(gatePolicy(pane, feature));
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(SMALL_PHONE.width);
        tops.push(Math.round(box.y));
      }
      expect(new Set(tops).size).toBe(PROTECTED_FEATURES.length);
      expect(await worstOverrunAroundPolicies(pane)).toBeLessThanOrEqual(SUBPIXEL_OVERRUN_PX);
      expect(
        await pane.evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(SUBPIXEL_OVERRUN_PX);
    });
  });

  test.describe('in a wide Settings', () => {
    test.use({ viewport: WIDE_SETTINGS });

    test('every policy lands in one shared column of the matrix, inside the dialog', async ({
      drawingScreen,
    }) => {
      const settings = await openParentCenter(drawingScreen.page);

      const dialog = await boxOf(settings);
      const lefts = new Set<number>();
      const widths = new Set<number>();
      await expect
        .poll(async () => {
          lefts.clear();
          widths.clear();
          for (const feature of PROTECTED_FEATURES) {
            const box = await boxOf(gatePolicy(settings, feature));
            lefts.add(Math.round(box.x));
            widths.add(Math.round(box.width));
            if (box.x + box.width > dialog.x + dialog.width) return -1;
          }
          return lefts.size * widths.size;
        })
        .toBe(1);
      expect(await worstOverrunAroundPolicies(settings)).toBeLessThanOrEqual(SUBPIXEL_OVERRUN_PX);
    });
  });
});
