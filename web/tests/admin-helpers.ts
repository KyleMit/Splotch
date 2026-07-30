import { expect, type Locator, type Page } from '@playwright/test';

// Shared helpers for the two admin consoles (server-rendered /admin and the
// static /admin/native). Keep this module's imports limited to @playwright/test:
// playwright.shared.ts imports ADMIN_ACCESS_TOKEN from here to declare the web
// server's env, so anything reachable from this file is also parsed while loading
// the Playwright config.

export const ADMIN_ACCESS_TOKEN = 'test-admin-secret';

const ACCESS_KEY_PLACEHOLDER = 'Admin access key';
const NEW_CODE_PLACEHOLDER = 'Add a code…';

// How long one sign-in round trip gets — form action (or /api/admin/login) →
// redirect → tokens fetch → console render. Every observed pass landed well
// inside Playwright's 5s default; this is sized for a worker starved past it.
const SIGN_IN_SETTLE_MS = 20_000;

/** The token console's presence sentinel — only rendered once signed in. */
export function adminConsole(page: Page): Locator {
  return page.getByPlaceholder(NEW_CODE_PLACEHOLDER);
}

/** Submit the sign-in form, asserting nothing about the outcome. */
export async function submitAdminKey(page: Page, key: string) {
  await page.getByPlaceholder(ACCESS_KEY_PLACEHOLDER).fill(key);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// Sign in and leave the token console open — with exactly one submit, waited on
// by a web-first assertion rather than retried.
//
// Issue #615 asked for a retrying helper, on the diagnosis that the console was
// slow to paint. It wasn't: the click was landing before hydration, when the form
// still default-submitted as a GET, so no login was attempted at all. That is
// fixed in AdminConsole itself, and Playwright won't click a disabled button, so
// there is no lost click left for a retry to rescue — only a slow round trip,
// which a longer assertion covers without a second POST.
//
// Which matters, because rateLimitPolicy.adminLogin allows 10 hits per IP per
// minute and `beginAdminLogin` spends one *before* verifying the key, so even the
// wrong-key spec counts. The whole suite performs ~8 sign-ins from one IP inside
// one ~66s run. A helper that can submit two or four times per call multiplies
// against that shared budget and manufactures 429s — the same self-contamination
// ADR-0078 §4 spent this branch diagnosing in the sweep harness. Flake absorption
// belongs to Playwright's own `retries`, which re-runs the spec instead of
// stacking hits inside one.
//
// One consequence worth knowing before reaching for `--repeat-each` on these
// specs: eight sign-ins per repetition against a 10-per-minute bucket means two
// repetitions already exceed it, so the runs go red on 429s that say nothing
// about the code. That ceiling is the suite's, not this helper's — a retrying
// helper merely hid it by waiting for the window to age out. Verify these specs
// with repeated *full* runs (the whole suite takes long enough to stay under),
// which is also what CI does.
export async function signInToAdmin(page: Page, path = '/admin') {
  await page.goto(path);
  await submitAdminKey(page, ADMIN_ACCESS_TOKEN);
  await expect(adminConsole(page)).toBeVisible({ timeout: SIGN_IN_SETTLE_MS });
}
