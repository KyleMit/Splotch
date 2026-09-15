import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  retryOpen,
  seedAiEnabled,
  seedParentalGatePolicies,
  settleFlyIn,
  settleSettingsPane,
} from './helpers';
import { solveParentalGate } from './flows-harness';

// The privacy page has no Settings button: Parent Center is reached through a
// gated link's challenge, and the page mounts the Settings modal on demand,
// only while Parent Center is being managed (routes/privacy/parentCenter.svelte.ts).

const PRIVACY_GATED_LINK = 'OpenAI Services Agreement';

// The gate's footer, and the copy the same card switches to once that footer has
// pointed it at Parent Center.
const MANAGE_FOOTER = /Manage these checks in/;
const MANAGE_SUBTITLE = 'Solve the problem to manage grown-up checks';

// Reaches Parent Center the way the privacy page offers it: a gated link's
// challenge, retargeted by its footer, then solved.
async function openPrivacyParentCenter(page: Page) {
  const gate = page.locator('#parentalGate');
  await retryOpen(gate, () =>
    page.getByRole('link', { name: PRIVACY_GATED_LINK }).click({ timeout: 3000 })
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
  return settings;
}

test('Parent Center reached from privacy hydrates its persisted settings', async ({ page }) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' })
  );
  await seedAiEnabled(page);
  await seedParentalGatePolicies(page, 'always');
  await page.goto('/privacy');

  const settings = await openPrivacyParentCenter(page);
  await expect(settings.getByText('Checking your free AI creations…')).not.toBeVisible();
  await expect(settings.getByText(/Add your own OpenAI API key to create AI art/)).toBeVisible();
});

// Closing must still run the dialog's own close, which hands focus back to where
// the trip began — as Esc (a native close) and Settings on the drawing route do.
const PARENT_CENTER_DISMISSALS: {
  name: string;
  dismiss: (page: Page, settings: Locator) => Promise<void>;
}[] = [
  {
    name: 'its close button',
    dismiss: (_page, settings) => settings.getByRole('button', { name: 'Close' }).click(),
  },
  { name: 'a backdrop tap', dismiss: (page) => page.mouse.click(5, 5) },
];

for (const { name, dismiss } of PARENT_CENTER_DISMISSALS) {
  test(`closing Parent Center with ${name} returns focus to the link that opened it`, async ({
    page,
  }) => {
    await seedParentalGatePolicies(page, 'always');
    await page.goto('/privacy');
    const settings = await openPrivacyParentCenter(page);

    await dismiss(page, settings);

    await expect(settings).not.toBeVisible();
    await expect(page.getByRole('link', { name: PRIVACY_GATED_LINK })).toBeFocused();
  });
}
