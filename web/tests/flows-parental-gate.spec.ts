import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  gotoApp,
  openSettingsModal,
  retryOpen,
  seedAiEnabled,
  seedParentalGatePolicies,
  settleFlyIn,
  settleSettingsPane,
} from './helpers';
import {
  enableAiButtonWithStroke,
  openDrawer,
  openParentalGate,
  policyPicker,
  solveParentalGate,
} from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { openAiResult } from './ai-harness';

// The Grown-Ups Only gate (ParentalGate.svelte + state/parentalGate.svelte.ts)
// sits at operation boundaries, never in front of Settings itself (ADR-0094).
// Parent Center persists an independent policy for each protected feature.
// External links offer all three modes on web and Android; native iOS keeps
// Never visible but unavailable, with its App Store rationale disclosed inline.
// This suite drives the web build, which ships every policy at Never, so the
// specs that exercise a real challenge arm it with `gates: 'always'` — and the
// one below that seeds nothing is what pins those shipped defaults.

const AI_PROMPT = 'dialog.ai-prompt-modal';
const AI_RESULT_WEBP = readFileSync(
  new URL('../static/icons/handmade-paper.webp', import.meta.url)
);

// Every operation Parent Center holds a policy for, by the name it carries there.
const PROTECTED_FEATURES = [
  'Generating an AI image',
  'Reporting an AI result',
  'Viewing external links',
  'Sending feedback',
  'Opening Parent Center',
];

// The gate's footer, and the copy the same card switches to once that footer has
// pointed it at Parent Center.
const MANAGE_FOOTER = /Manage these checks in/;
const MANAGE_SUBTITLE = 'Solve the problem to manage grown-up checks';

// Turning Parent Center's own check off is confirmed first, and warned about
// while it holds — flows-parent-center-warning.spec.ts owns that flow. The
// persistence spec below only has to get past the confirmation.
const UNPROTECTED_CONFIRM = 'dialog.unprotected-confirm';

// The access-code param supplies the credential, while the master preference
// explicitly reveals the AI button. `gates` is the seed to leave the policies
// at: 'default' for a spec that seeded its own before navigating.
// openParentalGate owns the robust non-empty-canvas precondition.
async function gotoGatedAiButton(page: Page, gates: 'always' | 'default' = 'always') {
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates });
}

test('Settings opens directly — entry is not the gate (ADR-0094)', async ({ page }) => {
  await gotoApp(page, '/', { gates: 'always' });
  await openSettingsModal(page);
  await expect(page.locator('#parentalGate')).not.toBeVisible();
});

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

test('a gated action points at Parent Center, and one solve lands there', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  // Parent Center asks for its own check, so the footer retargets this card
  // rather than stacking a second one: the offer goes away and the subtitle
  // names where the solve now leads.
  await retryOpen(gate.getByText(MANAGE_SUBTITLE), () =>
    gate.getByRole('button', { name: MANAGE_FOOTER }).click({ timeout: 2000 })
  );
  await expect(gate.getByRole('button', { name: MANAGE_FOOTER })).toHaveCount(0);

  await solveParentalGate(page);

  const settings = page.locator('#settingsModal');
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible({ timeout: 5000 });
  // The operation the parent left behind stayed behind.
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();
});

test('the keyboard keeps the card after the footer retargets it', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  // Activating the footer unmounts it, and focus has to survive that: a removed
  // element hands focus to <body>, where the dialog's keydown handler never sees
  // another digit and the card looks ready for one it will not take.
  await gate.getByRole('button', { name: MANAGE_FOOTER }).focus();
  await page.keyboard.press('Enter');
  await expect(gate.getByText(MANAGE_SUBTITLE)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getElementById('parentalGate')?.contains(document.activeElement) ?? false
      )
    )
    .toBe(true);

  // Typed on the keyboard, never on the keypad — and asserted on the
  // destination rather than on a filled dab, since a one-digit answer (3 × 3)
  // auto-submits and leaves no dab behind to count.
  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  for (const digit of String(x * y)) await page.keyboard.press(digit);

  const settings = page.locator('#settingsModal');
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible({ timeout: 5000 });
});

// Every interactive control holds the app's minimum touch target. This one has
// to be asserted where the card is widest: the line stops wrapping there, which
// is exactly where its height stops being carried by a second line of text.
const MINIMUM_TOUCH_TARGET_PX = 44;

test('the footer holds the minimum touch target where its text stops wrapping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 1200 });
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  const footer = gate.getByRole('button', { name: MANAGE_FOOTER });
  await expect(footer).toHaveCount(1);
  await expect
    .poll(async () => (await footer.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX);
});

test('the footer hands straight over when Parent Center asks for no check of its own', async ({
  page,
}) => {
  await page.addInitScript(
    ({ aiImageKey, parentCenterKey }) => {
      localStorage.setItem(aiImageKey, 'always');
      localStorage.setItem(parentCenterKey, 'never');
    },
    {
      aiImageKey: STORAGE_KEYS.parentalGateAiImageMode,
      parentCenterKey: STORAGE_KEYS.parentalGateParentCenterMode,
    }
  );
  await gotoGatedAiButton(page, 'default');
  const gate = await openParentalGate(page);

  const settings = page.locator('#settingsModal');
  await retryOpen(settings.getByText(/Choose when Splotch should ask/), () =>
    gate.getByRole('button', { name: MANAGE_FOOTER }).click({ timeout: 2000 })
  );
  await expect(gate).not.toBeVisible();
});

test('the footer reaches Parent Center from a gate raised over Settings itself', async ({
  page,
}) => {
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Feedback' }).click();
  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('button', { name: 'Send report' }).click();

  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  await retryOpen(gate.getByText(MANAGE_SUBTITLE), () =>
    gate.getByRole('button', { name: MANAGE_FOOTER }).click({ timeout: 2000 })
  );
  await solveParentalGate(page);

  // Settings never closed, so the section arrives with no open transition behind
  // it — and unlocked, since the solve that got here was Parent Center's own.
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible({ timeout: 5000 });
});

test('the Parent Center challenge names its destination instead of offering the trip', async ({
  page,
}) => {
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();

  const gate = page.locator('#parentalGate');
  await expect(gate.getByText(MANAGE_SUBTITLE)).toBeVisible();
  await expect(gate.getByRole('button', { name: MANAGE_FOOTER })).toHaveCount(0);
});

test('the AI button is gated; solving opens the AI prompt', async ({ page }) => {
  await gotoGatedAiButton(page);

  const gate = await openParentalGate(page);
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  await solveParentalGate(page);

  // The success card shows, then the AI prompt opens after the hold.
  await expect(gate.getByText('Unlocked!')).toBeVisible();
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
  await expect(gate).not.toBeVisible();
});

test('the success card cannot be dismissed away from its destination', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);
  await solveParentalGate(page);
  await expect(gate.getByText('Unlocked!')).toBeVisible();

  // A backdrop tap and Esc during the success hold must not cancel the
  // captured destination (review finding: dismissGate cleared the timer).
  await page.mouse.click(10, 10);
  await page.keyboard.press('Escape');

  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});

test('a wrong answer clears the input, shows the error, and regenerates the problem', async ({
  page,
}) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  // Same digit count as the real answer, guaranteed wrong: no product of two
  // operands in [3, 9] is all nines.
  const answer = String(x * y);
  const wrong = answer === '9' ? '8' : '9'.repeat(answer.length);
  for (const digit of wrong) {
    await page.locator('.gate-keypad').getByRole('button', { name: digit, exact: true }).click();
  }

  await expect(gate.getByText('Not quite — try this one')).toBeVisible();
  // The typed digits were discarded along with the old problem.
  await expect(gate.locator('.gate-dab.filled')).toHaveCount(0);
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  // The regenerated problem is still solvable.
  await solveParentalGate(page);
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});

test('closing the gate discards the attempt without unlocking', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  await page.locator('.gate-keypad').getByRole('button', { name: '5', exact: true }).click();
  await gate.getByRole('button', { name: 'Close' }).click();
  await expect(gate).not.toBeVisible();
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  // Reopening asks again, with a fresh empty input.
  await openParentalGate(page);
  await expect(gate.locator('.gate-dab.filled')).toHaveCount(0);
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
  await page.reload();
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

test('Per session asks once for AI and asks again after a relaunch', async ({ page }) => {
  await page.addInitScript(
    ([aiKey]) => localStorage.setItem(aiKey, 'session'),
    [STORAGE_KEYS.parentalGateAiImageMode]
  );
  await gotoGatedAiButton(page);
  await openParentalGate(page);
  await solveParentalGate(page);

  const prompt = page.locator(AI_PROMPT);
  await expect(prompt).toBeVisible({ timeout: 5000 });
  await prompt.getByRole('button', { name: 'Close' }).click();
  await page.locator('#aiImageButton').click();
  await expect(prompt).toBeVisible();
  await expect(page.locator('#parentalGate')).not.toBeVisible();

  await gotoGatedAiButton(page);
  await openParentalGate(page);
});

test('external links inside Settings follow the Every time policy', async ({ page, context }) => {
  // Serve the link-out locally so the popup never reaches the real network.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
  );

  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'About' }).click();

  await page.getByRole('link', { name: 'View source on GitHub' }).click();
  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  const popup = context.waitForEvent('page');
  await solveParentalGate(page);
  const popupPage = await popup;
  await expect.poll(() => popupPage.url()).toContain('github.com/KyleMit/Splotch');
  await expect(gate).not.toBeVisible();
});

test('the bundled privacy page gates its provider terms link', async ({ page, context }) => {
  await context.route('https://openai.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
  );
  await seedParentalGatePolicies(page, 'always');
  await page.goto('/privacy');

  const gate = page.locator('#parentalGate');
  await retryOpen(gate, () =>
    page.getByRole('link', { name: 'OpenAI Services Agreement' }).click({ timeout: 3000 })
  );
  await settleFlyIn(gate);
  const popup = context.waitForEvent('page');
  await solveParentalGate(page);
  const popupPage = await popup;
  await expect.poll(() => popupPage.url()).toContain('openai.com/policies/services-agreement');
  await expect(gate).not.toBeVisible();
});

test('Parent Center reached from privacy hydrates its persisted settings', async ({ page }) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' })
  );
  await seedAiEnabled(page);
  await seedParentalGatePolicies(page, 'always');
  await page.goto('/privacy');

  const gate = page.locator('#parentalGate');
  await retryOpen(gate, () =>
    page.getByRole('link', { name: 'OpenAI Services Agreement' }).click({ timeout: 3000 })
  );
  await settleFlyIn(gate);
  await retryOpen(gate.getByText(MANAGE_SUBTITLE), () =>
    gate.getByRole('button', { name: MANAGE_FOOTER }).click({ timeout: 2000 })
  );
  await solveParentalGate(page);

  const settings = page.locator('#settingsModal');
  await expect(settings).toBeVisible();
  await settleFlyIn(settings);
  await settleSettingsPane(settings.locator('.settings-pane'));
  await expect(settings.getByText('Checking your free AI creations…')).not.toBeVisible();
  await expect(settings.getByText(/Add your own OpenAI API key to create AI art/)).toBeVisible();
});

test('external links can skip a second gate only within a solved session', async ({
  page,
  context,
}) => {
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
  );
  await page.addInitScript(
    (externalLinksKey) => localStorage.setItem(externalLinksKey, 'session'),
    STORAGE_KEYS.parentalGateExternalLinksMode
  );
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'About' }).click();
  const link = page.getByRole('link', { name: 'View source on GitHub' });

  await link.click();
  await expect(page.locator('#parentalGate')).toBeVisible();
  const firstPopup = context.waitForEvent('page');
  await solveParentalGate(page);
  await (await firstPopup).close();

  const secondPopup = context.waitForEvent('page');
  await link.click();
  await expect(page.locator('#parentalGate')).not.toBeVisible();
  const secondPopupPage = await secondPopup;
  await expect.poll(() => secondPopupPage.url()).toContain('github.com/KyleMit/Splotch');
  await secondPopupPage.close();
});

test('sending feedback waits for its parental gate before posting', async ({ page }) => {
  let reportRequests = 0;
  await page.route('**/api/report', async (route) => {
    reportRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Feedback' }).click();
  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('button', { name: 'Send report' }).click();

  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  expect(reportRequests).toBe(0);
  await solveParentalGate(page);
  await expect(page.getByText('Thanks for your feedback.')).toBeVisible({ timeout: 5000 });
  expect(reportRequests).toBe(1);
});

// Unlike the flows above, the gate here is not the last thing before the send:
// a confirmation follows it, so the tap order is Report → gate → confirm →
// post. Reversed, a parent would solve the sum only to find the report gone.
test('reporting an AI picture waits for its own parental gate before confirming', async ({
  page,
}) => {
  let reportRequests = 0;
  await page.addInitScript(
    (aiImageModeKey) => localStorage.setItem(aiImageModeKey, 'never'),
    STORAGE_KEYS.parentalGateAiImageMode
  );
  await page.route('**/api/generate-image?style=Magical', (route) =>
    route.fulfill({ status: 200, contentType: 'image/webp', body: AI_RESULT_WEBP })
  );
  await page.route('**/api/report-image', async (route) => {
    reportRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, reportId: 'test-report-id' }),
    });
  });
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  await openDrawer(page);
  await enableAiButtonWithStroke(page);
  await page.locator('#aiImageButton').click();
  await page.getByRole('button', { name: 'Magical' }).click();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Report this picture' }).click();

  const gate = page.locator('#parentalGate');
  const confirm = page.locator('dialog.ai-report-confirm');
  await expect(gate).toBeVisible();
  await expect(confirm).not.toBeVisible();
  expect(reportRequests).toBe(0);

  await solveParentalGate(page);
  await expect(confirm).toBeVisible();
  expect(reportRequests).toBe(0);

  await confirm.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/Keep this report reference.*test-report-id/)).toBeVisible({
    timeout: 5000,
  });
  expect(reportRequests).toBe(1);
});

test('reporting a safety refusal uses the AI-report parental gate before confirming', async ({
  page,
}) => {
  let reportRequests = 0;
  await page.addInitScript(
    (reportModeKey) => localStorage.setItem(reportModeKey, 'always'),
    STORAGE_KEYS.parentalGateImageReportMode
  );
  await page.route('**/api/report-image', async (route) => {
    reportRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, reportId: 'refusal-report-id' }),
    });
  });
  const endpoint = await openAiResult(page);
  await endpoint.fail(422);

  await page.getByRole('button', { name: 'Report this refusal' }).click();

  const gate = page.locator('#parentalGate');
  const confirm = page.locator('dialog.ai-report-confirm');
  await expect(gate).toBeVisible();
  await expect(confirm).not.toBeVisible();
  expect(reportRequests).toBe(0);

  await solveParentalGate(page);
  await expect(confirm).toBeVisible();
  expect(reportRequests).toBe(0);

  await confirm.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/Keep this report reference.*refusal-report-id/)).toBeVisible();
  expect(reportRequests).toBe(1);
});
