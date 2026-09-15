import { MANAGED_ACCESS_TOKEN } from '../playwright.shared';
import type { Page } from '@playwright/test';
import {
  adminConsole,
  ADMIN_ACCESS_TOKEN,
  expect,
  SIGN_IN_SETTLE_MS,
  signInToAdmin,
  submitAdminKey,
  test,
} from './admin-helpers';

// The specs about signing in to /admin: the form action's verdicts, the sign-out
// path, and the JSON /api/admin/* twin (tools/api-smoke/lib/admin-client.mjs
// drives it). Each spec necessarily spends a hit of rateLimitPolicy.adminLogin
// — 10 per client address per trailing minute — because the sign-in is the
// behaviour under test, and `beginAdminLogin` charges the bucket before it
// looks at the key, so the wrong-key spec counts too. That budget is what
// keeps these apart from admin.spec.ts, whose signed-in specs share one
// session and repeat freely: this file spends six hits per repetition, so
// `--repeat-each` on it does not fit inside one window at all. Verify it with
// repeated full runs, as CI does.

async function expectTokenAddUnavailable(page: Page, token: string) {
  await adminConsole(page).fill(token);
  await page.getByRole('button', { name: 'Add code' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Token storage is unavailable' })
  ).toBeVisible();
  await expect(page.getByText(token, { exact: true })).toBeHidden();
}

test('web /admin rejects a wrong key', async ({ page }) => {
  await page.goto('/admin');
  await submitAdminKey(page, 'wrong-key');
  await expect(page.getByRole('alert')).toContainText('Incorrect access key');
});

test('web /admin signs in, fails closed without durable tokens, and signs out', async ({
  page,
}) => {
  await signInToAdmin(page);
  // Production preview has no Netlify Blobs: reads retain the env seed, but
  // mutations must not claim an in-memory success that disappears on restart.
  await expect(
    page.getByRole('status').filter({ hasText: 'Netlify Blobs is unavailable' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Free generation grants' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Free grant monitoring is using local memory' })
  ).toBeVisible();
  await expect(page.getByText('Sampled successes').locator('..')).toContainText('0');
  await expectTokenAddUnavailable(page, `e2e-web-${Date.now()}`);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The session survives in an HTTP-only cookie, so signing back in isn't
  // needed after a reload while signed in — but after sign-out it must be.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

// Costs two sign-ins: the draft only survives within one page lifetime, so the
// second sign-in cannot follow a reload the way signInToAdmin's navigation
// would.
test('web /admin signing out discards an unsent code draft', async ({ page }) => {
  await signInToAdmin(page);
  await adminConsole(page).fill('e2e-unsent-draft');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await submitAdminKey(page, ADMIN_ACCESS_TOKEN);
  await expect(adminConsole(page)).toBeVisible({ timeout: SIGN_IN_SETTLE_MS });
  await expect(adminConsole(page)).toHaveValue('');
});

// The copy's clipboard write is held open across the sign-out so its
// continuation runs inside the next session. Costs one sign-in: the fixture's
// session opens the console and only the second sign-in submits the form.
//
// The verdict is read inside the page right after the continuation has run,
// not through a retrying assertion: the defect shows "Copied!" for only
// COPY_FEEDBACK_MS, so a web-first `toHaveText('Copy')` would wait it out
// and pass against the bug.
test('web /admin a copy left pending at sign-out cannot mark the next session copied', async ({
  adminPage: page,
}) => {
  await page.evaluate(() => {
    let releaseClipboard!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      releaseClipboard = resolve;
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => pendingWrite },
    });
    Object.assign(window, { releaseClipboard });
  });
  const copyCodeButton = '.wide-actions .row-action';
  await page.locator(copyCodeButton).first().click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await submitAdminKey(page, ADMIN_ACCESS_TOKEN);
  await expect(adminConsole(page)).toBeVisible({ timeout: SIGN_IN_SETTLE_MS });
  const labelAfterRelease = await page.evaluate(async (selector) => {
    (window as Window & { releaseClipboard?: () => void }).releaseClipboard?.();
    // A macrotask later, the write's continuation and Svelte's flush are done.
    await new Promise((settle) => setTimeout(settle, 0));
    return document.querySelector(selector)?.textContent?.trim();
  }, copyCodeButton);
  expect(labelAfterRelease).toBe('Copy');
});

test('admin API requires a valid bearer session and durable mutation storage', async ({
  request,
}) => {
  expect((await request.get('/api/admin/tokens')).status()).toBe(401);
  expect(
    (
      await request.get('/api/admin/tokens', {
        headers: { Authorization: 'Bearer not-a-session' },
      })
    ).status()
  ).toBe(401);

  const login = await request.post('/api/admin/login', { data: { key: ADMIN_ACCESS_TOKEN } });
  expect(login.ok()).toBe(true);
  const { session } = await login.json();
  // The session is the derived HMAC, never the raw secret.
  expect(session).toMatch(/^[0-9a-f]{64}$/);
  expect(session).not.toContain(ADMIN_ACCESS_TOKEN);

  const headers = { Authorization: `Bearer ${session}` };
  const token = `e2e-api-${Date.now()}`;

  const added = await request.post('/api/admin/tokens', { headers, data: { token } });
  expect(added.status()).toBe(503);
  const addedBody = await added.json();
  expect(addedBody).toMatchObject({ ok: false, error: expect.any(String) });

  const removed = await request.delete('/api/admin/tokens', {
    headers,
    data: { token: MANAGED_ACCESS_TOKEN },
  });
  expect(removed.status()).toBe(503);
  expect(await removed.json()).toMatchObject({ ok: false, error: expect.any(String) });
});
