import { expect, test, type Page } from '@playwright/test';
import { HARNESS_PROBE_CODE, MANAGED_ACCESS_TOKEN } from '../playwright.shared';
import { SECURITY_HEADERS } from '../src/lib/server/securityHeaders';
import { adminConsole, ADMIN_ACCESS_TOKEN, signInToAdmin, submitAdminKey } from './admin-helpers';

// The admin console is web-only: the server-rendered /admin (form actions +
// HTTP-only cookie session) over the shared core ($lib/server/admin +
// $lib/server/tokens). Nothing in the app links to it and the native bundle has
// no admin route at all — an in-app door to a privileged console reads as
// hidden functionality to a store reviewer. The JSON /api/admin/* endpoints
// remain (tools/api-smoke/lib/admin-client.mjs drives them) and are covered here
// too. The production preview has no Blobs, so its env-seeded rows are read-only;
// writable in-memory coverage belongs to the Vite-dev API smoke.

async function expectTokenAddUnavailable(page: Page, token: string) {
  await adminConsole(page).fill(token);
  await page.getByRole('button', { name: 'Add code' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Token storage is unavailable' })
  ).toBeVisible();
  await expect(page.getByText(token, { exact: true })).toBeHidden();
}

function tokenRow(page: Page, token: string) {
  return page.getByRole('row').filter({
    has: page.getByRole('button', { name: `Remove ${token}`, exact: true }),
  });
}

async function expectVisibleActionsMeetTargetFloor(row: ReturnType<typeof tokenRow>) {
  const compactActions = row.locator('.compact-actions');
  const actions = (await compactActions.isVisible())
    ? row.locator('.compact-actions button, .row-actions.open button')
    : row.locator('.wide-actions button');
  const count = await actions.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await actions.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
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
  await expect(page.getByText('Netlify Blobs is unavailable')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Free generation grants' })).toBeVisible();
  await expect(page.getByText('Free grant monitoring is using local memory')).toBeVisible();
  await expect(page.getByText('Sampled successes').locator('..')).toContainText('0');
  await expectTokenAddUnavailable(page, `e2e-web-${Date.now()}`);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The session survives in an HTTP-only cookie, so signing back in isn't
  // needed after a reload while signed in — but after sign-out it must be.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

// The ledger's column grid uses fixed usage/action tracks, so there is a band
// of widths where the tracks fit the viewport but not the sheet's content box
// (PR 767 review: at 561px the code column computed to 0px and rows tripled in
// height). The collapse must key off where the grid actually fits, not just
// phone widths. This costs one of the shared rate-limit budget's sign-ins —
// see the tally in admin-helpers.ts.
test('web /admin ledger keeps its rows usable across viewport widths', async ({ page }) => {
  await signInToAdmin(page);
  const token = MANAGED_ACCESS_TOKEN;
  const row = tokenRow(page, token);
  await expect(row).toBeVisible();

  // Wide layouts: the full action set renders inside the ledger's box.
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 830, height: 900 },
    { width: 900, height: 600 },
    { width: 830, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(row.getByRole('button', { name: 'Copy link' })).toBeVisible();
    const remove = await row.getByRole('button', { name: `Remove ${token}` }).boundingBox();
    const ledger = await page.getByRole('table').boundingBox();
    expect(remove).not.toBeNull();
    expect(ledger).not.toBeNull();
    expect(remove!.x + remove!.width).toBeLessThanOrEqual(ledger!.x + ledger!.width);
    // The slim link treatment still has to meet the 44px interaction floor.
    expect(remove!.height).toBeGreaterThanOrEqual(44);
  }

  // Tablet band: the column grid collapses to the stacked code cell, but the
  // freed width keeps all three actions inline — no overflow control at all —
  // instead of squeezing the code track to nothing and ballooning the row.
  // The ceiling allows this deliberately long token one wrap (~98px) while
  // staying far under the broken state's 206px rows.
  for (const viewport of [
    { width: 700, height: 900 },
    { width: 561, height: 900 },
    { width: 700, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(row.getByRole('button', { name: 'Copy link' })).toBeVisible();
    await expect(row.getByRole('button', { name: `Remove ${token}` })).toBeVisible();
    await expect
      .poll(async () => (await row.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(120);
  }

  const more = row.getByRole('button', { name: `More options for ${token}`, exact: true });

  // Narrow portrait and both supported phone landscapes use Copy plus the
  // disclosure chevron. Every on-screen control retains the design system's
  // 44px floor.
  for (const viewport of [
    { width: 390, height: 900 },
    { width: 812, height: 375 },
    { width: 956, height: 440 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(more).toBeVisible();
    await expect(row.locator('.wide-actions')).toBeHidden();
    await expect
      .poll(async () => (await row.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(120);
    await expectVisibleActionsMeetTargetFloor(row);
  }

  // One pixel past the supported phone-landscape ceiling returns to the
  // three-action row, and both iPad mini orientations keep it where it fits.
  for (const viewport of [
    { width: 957, height: 440 },
    { width: 744, height: 1133 },
    { width: 1133, height: 744 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(more).toBeHidden();
    await expect(row.locator('.wide-actions')).toBeVisible();
    await expectVisibleActionsMeetTargetFloor(row);
  }

  // The remaining actions expand in place inside the row — no centered modal
  // covering the list.
  await page.setViewportSize({ width: 812, height: 375 });

  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expectVisibleActionsMeetTargetFloor(row);
  await row.getByRole('button', { name: `Remove ${token}` }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Token storage is unavailable' })
  ).toBeVisible();
  await expect(row).toBeVisible();
});

// Resolve a design token to the same rgb() form getComputedStyle reports, by
// painting it on a throwaway probe — so the expectations below derive from
// tokens.css instead of re-declaring its hex values here.
async function resolveTokenColor(page: Page, name: string) {
  return page.evaluate((token) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${token})`;
    document.body.append(probe);
    const painted = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return painted;
  }, name);
}

// The compact ledger's disclosure-chevron press feedback has to survive the
// cascade, not just exist: :active and :hover both match while a hover-capable
// pointer presses the button, so declaring :active before the
// @media (hover: hover) block lets the hover rule hold the background for the
// whole press. That shipped once (PR #946) — reachable from any viewport under
// 560px, which includes narrow desktop windows and trackpad hybrids, not just
// touch.
test('web /admin chevron press feedback beats hover on a hover-capable pointer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signInToAdmin(page);
  const token = MANAGED_ACCESS_TOKEN;

  const more = tokenRow(page, token).getByRole('button', {
    name: `More options for ${token}`,
    exact: true,
  });
  await expect(more).toBeVisible();
  await more.scrollIntoViewIfNeeded();

  const [pressed, hovered] = await Promise.all([
    resolveTokenColor(page, '--brand-wash'),
    resolveTokenColor(page, '--surface-hover'),
  ]);
  // Without a real pointer the hover rule never applies and the press assertion
  // below would hold for the wrong reason.
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
  expect(pressed).not.toBe(hovered);

  const background = async () =>
    more.evaluate((button) => getComputedStyle(button).backgroundColor);
  const box = (await more.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Polled, not slept on: the background crosses --duration-fast to get here.
  await expect.poll(background).toBe(hovered);

  await page.mouse.down();
  try {
    await expect.poll(background).toBe(pressed);
  } finally {
    // Release away from the button so the press doesn't complete as a click and
    // expand the row under the next assertion.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
});

// Closing the reveal must drop its controls from the tab order the moment
// `open` flips, not when the close animation ends (PR #950 review): a
// transitioned visibility kept the closing subtree focusable in
// legacy-interpolation engines, so Enter-to-close then an immediate Tab moved
// focus into the still-closing "Copy link" and the transition's end dumped it
// to <body>. The reveal subtree is inert while closed, so the Tab must skip
// it no matter how fast it follows the close. The inert attribute is asserted
// directly because the focus sequence alone can't reproduce the defect on
// Chromium, which flips a transitioned visibility discretely rather than
// holding it like WebKit/Firefox — the attribute is the cross-engine gate.
test('web /admin closing the reveal removes its actions from the tab order immediately', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signInToAdmin(page);
  // allowedTokensList appends the harness probe after the managed codes, so a
  // second row after the probed one gives the forward Tab a landing spot
  // inside the ledger. From the last row's chevron it would legitimately leave
  // the document, which is indistinguishable from the focus dump.
  const token = MANAGED_ACCESS_TOKEN;
  const nextToken = HARNESS_PROBE_CODE;
  await expect(page.getByText(token, { exact: true })).toBeVisible();
  await expect(page.getByText(nextToken, { exact: true })).toBeVisible();

  const row = tokenRow(page, token);
  const more = row.getByRole('button', { name: `More options for ${token}`, exact: true });
  const reveal = row.locator('.row-actions');
  await expect(reveal).toHaveAttribute('inert', '');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(reveal).not.toHaveAttribute('inert', '');

  // Tab back-to-back with the closing Enter — no assertion between them, so
  // the Tab lands inside the close animation's window, where the defect bit.
  await more.press('Enter');
  await page.keyboard.press('Tab');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(reveal).toHaveAttribute('inert', '');
  // Read the focus target directly — the closed reveal's buttons are hidden,
  // so a role locator can never resolve them, focused or not.
  const focusedLabel = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') ?? ''
  );
  expect(focusedLabel).not.toBe(`Copy link for ${token}`);

  // Idle past the close animation (--duration-fast), then confirm focus was
  // not dumped to <body> when it ended — it should sit on the next row's
  // Copy button.
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test('web /admin surfaces a network failure instead of failing silently', async ({ page }) => {
  await signInToAdmin(page);
  await page.route(
    (url) => url.pathname === '/admin' && url.search === '?/add',
    (route) => route.abort()
  );
  await adminConsole(page).fill(`e2e-offline-${Date.now()}`);
  await page.getByRole('button', { name: 'Add code' }).click();
  // The preview server's Blobs-fallback warning is also role="alert", so pick
  // out the error flash by its text.
  await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toBeVisible();
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

// /admin is function-served (prerender = false), so Netlify's static-only
// custom headers never reach it — hooks.server.ts stamps the security set on
// instead, so the credentialed console isn't the least-protected page (issue
// #470, ADR-0073). The unauthenticated login response is enough: the headers
// ride every SSR response. Asserting against the shared SECURITY_HEADERS source
// keeps this in lockstep with what the hook sends.
test('web /admin SSR response carries the site security headers', async ({ request }) => {
  const res = await request.get('/admin');
  expect(res.ok()).toBe(true);
  const headers = res.headers();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[name.toLowerCase()]).toBe(value);
  }
});

test('web prerender keeps CSP delivery in the response header only', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveCount(0);
});
