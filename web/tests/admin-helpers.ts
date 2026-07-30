import { type Locator, type Page } from '@playwright/test';
import { retryOpen } from './retry';

// Shared helpers for the two admin consoles (server-rendered /admin and the
// static /admin/native). Keep this module's imports limited to @playwright/test
// and ./retry: playwright.shared.ts imports ADMIN_ACCESS_TOKEN from here to
// declare the web server's env, so anything reachable from this file is also
// parsed while loading the Playwright config.

export const ADMIN_ACCESS_TOKEN = 'test-admin-secret';

const ACCESS_KEY_PLACEHOLDER = 'Admin access key';
const NEW_CODE_PLACEHOLDER = 'Add a code…';

// One sign-in round trip: form action (or /api/admin/login) → redirect →
// tokens fetch → console render. This is the per-attempt wait, not the budget
// for the whole helper — every observed pass landed well inside Playwright's 5s
// default, and it is a worker starved past it that the retry exists for.
const SIGN_IN_SETTLE_MS = 5000;
// Room for three more attempts after a starved one, still short enough that a
// genuinely broken sign-in fails inside the default per-test budget.
const SIGN_IN_TIMEOUT_MS = 20_000;

/** The token console's presence sentinel — only rendered once signed in. */
export function adminConsole(page: Page): Locator {
  return page.getByPlaceholder(NEW_CODE_PLACEHOLDER);
}

/** Submit the sign-in form, asserting nothing about the outcome. */
export async function submitAdminKey(page: Page, key: string) {
  await page.getByPlaceholder(ACCESS_KEY_PLACEHOLDER).fill(key);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// Sign in and leave the token console open. The round trip above is a chain of
// server hops, and asserting on it once cost the suite an intermittent red
// (issue #615) — so the submit is retried like any other open-then-assert.
// Re-submitting is safe: retryOpen skips the action once the console is up, and
// a submit that already landed leaves no sign-in form to fill.
//
// A retry does spend a hit from rateLimitPolicy.adminLogin, which is 10 per IP
// per minute against the ~8 sign-ins the whole suite performs from one IP. That
// headroom is why the retry stays a fallback rather than a routine second try:
// the pre-hydration submit it used to cover is now closed off in AdminConsole
// itself, so under normal conditions the first attempt is the only attempt. A
// spec that adds sign-ins should count them against that 10.
export async function signInToAdmin(page: Page, path = '/admin') {
  await page.goto(path);
  await retryOpen(adminConsole(page), () => submitAdminKey(page, ADMIN_ACCESS_TOKEN), {
    settle: SIGN_IN_SETTLE_MS,
    timeout: SIGN_IN_TIMEOUT_MS,
  });
}
