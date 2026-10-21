import type { Locator, Page } from '@playwright/test';
import {
  GATE_LOCKOUT_BASE_MS,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
  gateLockoutMessage,
} from '../../experiments/native-architecture/src/feedback/gateLockout.ts';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import {
  answerGate,
  gateCard,
  goToSettingsSection,
  openSettings,
  setGatePolicies,
  solveGate,
  solveGateByKeyboard,
  waitUntilSettled,
  wrongGateAnswer,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

const REPORT_MESSAGE = 'The purple crayon draws green';
const WRONG_ANSWER_MESSAGE = 'Not quite — try this one';
const MANAGE_FOOTER = /Manage these checks in/;
const MANAGING_SUBTITLE = 'Solve the problem to manage grown-up checks';
// The shortest landscape phone the card is tuned for, and the two landscape phones the page-inventory
// critique found it cropped on. Each inventory size names its id in a trailing comment, which
// tools/tests/page-inventory-spec-viewports.test.mjs holds to the inventory.
const SHORTEST_LANDSCAPE_PHONE = { width: 568, height: 320 };
const SMALL_IPHONE_LANDSCAPE = { width: 812, height: 375 }; // iphone-13-mini-landscape
const LARGE_IPHONE_LANDSCAPE = { width: 956, height: 440 }; // iphone-16-pro-max-landscape
const LANDSCAPE_PHONES = [
  ['a short landscape phone', SHORTEST_LANDSCAPE_PHONE],
  ['a small phone in landscape', SMALL_IPHONE_LANDSCAPE],
  ['a large phone in landscape', LARGE_IPHONE_LANDSCAPE],
] as const;
// The card is raised on a phone held upright, then the phone is turned to the shape under test.
const PHONE_PORTRAIT = { width: 375, height: 812 };
const KEYPAD_KEY_COUNT = 12;
const GITHUB_LINK = 'View on GitHub (opens outside Splotch)';

// The card announces a wrong answer and a lockout through its status line.
function gateStatus(page: Page, text: string) {
  return gateCard(page).getByRole('status').filter({ hasText: text });
}

// A report is held at the card until a grown-up solves it, so the route counts what reaches /api.
async function countReports(page: Page) {
  const reports: string[] = [];
  await page.route('**/api/report', async (route) => {
    reports.push(route.request().method());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  return reports;
}

// Fills the Settings feedback form and sends it, which a Sending feedback check answers with the card.
async function sendReportFromSettings(page: Page): Promise<Locator> {
  const settings = await openSettings(page);
  await goToSettingsSection(settings, 'Feedback');
  await settings.getByRole('textbox', { name: 'What went wrong?' }).fill(REPORT_MESSAGE);
  await settings.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(gateCard(page)).toBeVisible();
  return settings;
}

test.describe('the Grown-Ups Only check', () => {
  test('Settings opens without a challenge even while checks are on', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await setGatePolicies(page, 'Every time', ['Sending feedback', 'Viewing external links']);

    await openSettings(page);

    await expect(gateCard(page)).toBeHidden();
  });

  test('sending feedback waits for the card, and the report goes once it is solved', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const reports = await countReports(page);
    await setGatePolicies(page, 'Every time', ['Sending feedback']);

    const settings = await sendReportFromSettings(page);
    expect(reports).toEqual([]);

    await solveGate(page);
    await expect(settings.getByText('Thanks for your feedback.')).toBeVisible();
    expect(reports).toEqual(['POST']);
  });

  test('a wrong answer says so, clears what was typed and asks a fresh problem', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const reports = await countReports(page);
    await setGatePolicies(page, 'Every time', ['Sending feedback']);
    await sendReportFromSettings(page);

    await answerGate(page, await wrongGateAnswer(page));

    await expect(gateStatus(page, WRONG_ANSWER_MESSAGE)).toBeVisible();
    expect(reports).toEqual([]);
    await solveGate(page);
    await expect.poll(() => reports).toEqual(['POST']);
  });

  test('closing the card discards the attempt without sending', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const reports = await countReports(page);
    await setGatePolicies(page, 'Every time', ['Sending feedback']);
    const settings = await sendReportFromSettings(page);

    await gateCard(page).getByRole('button', { name: '5', exact: true }).click();
    await gateCard(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(gateCard(page)).toBeHidden();
    expect(reports).toEqual([]);

    await settings.getByRole('button', { name: 'Send report', exact: true }).click();
    await expect(gateCard(page)).toBeVisible();
    await solveGate(page);
    await expect.poll(() => reports).toEqual(['POST']);
  });

  test('repeated wrong answers pause the keypad until the lockout ends', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    // Installed before the reload, so the app reads time through the fake clock from its first line.
    await page.clock.install();
    await page.reload();
    await waitForDrawingScreen(page);
    const reports = await countReports(page);
    await setGatePolicies(page, 'Every time', ['Sending feedback']);
    await sendReportFromSettings(page);

    for (let miss = 0; miss < GATE_WRONG_ANSWERS_BEFORE_LOCKOUT; miss++) {
      await answerGate(page, await wrongGateAnswer(page));
    }
    await expect(gateStatus(page, gateLockoutMessage(GATE_LOCKOUT_BASE_MS))).toBeVisible();

    await solveGate(page, 'paused');
    expect(reports).toEqual([]);
    await expect(gateCard(page)).toBeVisible();

    await page.clock.runFor(GATE_LOCKOUT_BASE_MS);
    await expect(gateStatus(page, gateLockoutMessage(GATE_LOCKOUT_BASE_MS))).toBeHidden();
    await solveGate(page);
    await expect.poll(() => reports).toEqual(['POST']);
  });

  test('the footer sends a card raised over Settings to Parent Center, and one solve lands there', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await setGatePolicies(page, 'Every time', ['Sending feedback', 'Opening Parent Center']);
    const settings = await sendReportFromSettings(page);

    await gateCard(page).getByRole('button', { name: MANAGE_FOOTER }).click();
    await expect(gateCard(page).getByText(MANAGING_SUBTITLE)).toBeVisible();
    await expect(gateCard(page).getByRole('button', { name: MANAGE_FOOTER })).toHaveCount(0);
    await solveGate(page);

    await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible();
  });

  test('the footer hands straight over when Parent Center asks no check of its own', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await setGatePolicies(page, 'Every time', ['Sending feedback']);
    const settings = await sendReportFromSettings(page);

    await gateCard(page).getByRole('button', { name: MANAGE_FOOTER }).click();

    await expect(gateCard(page)).toBeHidden();
    await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible();
  });

  test('a link out of the app follows the Every time policy, and a solve opens it', async ({
    drawingScreen,
    context,
  }) => {
    const { page } = drawingScreen;
    await context.route('https://github.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
    );
    await setGatePolicies(page, 'Every time', ['Viewing external links']);
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'About');

    await settings.getByRole('link', { name: GITHUB_LINK, exact: true }).click();
    await expect(gateCard(page)).toBeVisible();
    const opened = context.waitForEvent('page');
    await solveGate(page);

    await expect.poll(async () => (await opened).url()).toContain('github.com/KyleMit/Splotch');
    await expect(gateCard(page)).toBeHidden();
  });

  test('Per session asks once for a link, and not again within the session', async ({
    drawingScreen,
    context,
  }) => {
    const { page } = drawingScreen;
    await context.route('https://github.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
    );
    await setGatePolicies(page, 'Per session', ['Viewing external links']);
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'About');
    const link = settings.getByRole('link', { name: GITHUB_LINK, exact: true });

    await link.click();
    await expect(gateCard(page)).toBeVisible();
    const first = context.waitForEvent('page');
    await solveGate(page);
    await (await first).close();

    const second = context.waitForEvent('page');
    await link.click();
    await expect.poll(async () => (await second).url()).toContain('github.com/KyleMit/Splotch');
    await expect(gateCard(page)).toBeHidden();
  });

  test('the privacy policy opens from Settings with no challenge', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await setGatePolicies(page, 'Every time', ['Viewing external links']);
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'About');

    await settings.getByRole('link', { name: 'Privacy Policy', exact: true }).click();

    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
    await expect(gateCard(page)).toBeHidden();
  });

  test('an answer typed on a freshly opened card is checked by Enter', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const reports = await countReports(page);
    await setGatePolicies(page, 'Every time', ['Sending feedback']);
    await sendReportFromSettings(page);

    await solveGateByKeyboard(page);

    await expect.poll(() => reports).toEqual(['POST']);
  });

  for (const [label, viewport] of LANDSCAPE_PHONES) {
    test(`${label} holds the whole card on screen, with the reason for a wrong answer`, async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      await setGatePolicies(page, 'Every time', ['Sending feedback']);
      await page.setViewportSize(PHONE_PORTRAIT);
      const hub = await openSettings(page);
      await hub.getByRole('button', { name: /^Feedback, / }).click();
      const feedback = page.getByRole('dialog', { name: 'Feedback' });
      await feedback.getByRole('textbox', { name: 'What went wrong?' }).fill(REPORT_MESSAGE);
      await feedback.getByRole('button', { name: 'Send report', exact: true }).click();
      await expect(gateCard(page)).toBeVisible();

      await page.setViewportSize(viewport);
      await waitUntilSettled(gateCard(page).getByRole('button', { name: 'Check answer' }));
      await answerGate(page, await wrongGateAnswer(page));

      const card = gateCard(page);
      // The reason for a wrong answer fades after a couple of seconds, so it is read first.
      await expect(card.getByText(WRONG_ANSWER_MESSAGE).first()).toBeInViewport({ ratio: 1 });
      await expect(card.getByRole('button')).toHaveCount(KEYPAD_KEY_COUNT + 2);
      for (const part of [
        ...(await card.getByRole('button').all()),
        card.getByRole('heading', { name: 'Grown-Ups Only' }),
      ]) {
        await expect(part).toBeInViewport({ ratio: 1 });
      }
    });
  }
});
