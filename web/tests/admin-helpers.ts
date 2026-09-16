import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type WorkerInfo,
} from '@playwright/test';

// Shared helpers for the server-rendered /admin console.
// Keep this module's imports limited to @playwright/test and Node builtins:
// playwright.shared.ts imports ADMIN_ACCESS_TOKEN from here to declare the web
// server's env, so anything reachable from this file is also parsed while loading
// the Playwright config.

export const ADMIN_ACCESS_TOKEN = 'test-admin-secret';

const ACCESS_KEY_PLACEHOLDER = 'Admin access key';
const NEW_CODE_PLACEHOLDER = 'Add a code…';

// How long one sign-in round trip gets — form action (or /api/admin/login) →
// redirect → tokens fetch → console render. Every observed pass landed well
// inside Playwright's 5s default; this is sized for a worker starved past it.
export const SIGN_IN_SETTLE_MS = 20_000;

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
// wrong-key spec counts, and the whole suite signs in from a single IP inside one
// run. A helper that can submit two or four times per call multiplies
// against that shared budget and manufactures 429s — the same self-contamination
// ADR-0078 §4 spent this branch diagnosing in the sweep harness. Flake absorption
// belongs to Playwright's own `retries`, which re-runs the spec instead of
// stacking hits inside one.
//
// So only the specs *about* signing in call this — admin-login.spec.ts, whose
// four form-login hits per repetition plus one shared fixture sign-in let
// `--repeat-each=2` fit the shared allowance. Every other admin spec takes
// `adminPage` from the `test` exported below, which spends one sign-in per run
// instead of one per test, so those specs repeat without touching the bucket.
export async function signInToAdmin(page: Page) {
  await page.goto('/admin');
  await submitAdminKey(page, ADMIN_ACCESS_TOKEN);
  const throttledAlert = page.getByRole('alert').filter({ hasText: 'Too many attempts' });
  await expect(adminConsole(page).or(throttledAlert)).toBeVisible({ timeout: SIGN_IN_SETTLE_MS });
  expect(await throttledAlert.isVisible(), 'admin sign-in was throttled (429)').toBe(false);
}

/** Open the token console on a page whose context already holds a session. */
async function openAdminConsole(page: Page) {
  await page.goto('/admin');
  await expect(adminConsole(page)).toBeVisible({ timeout: SIGN_IN_SETTLE_MS });
  await expect(page.getByRole('button', { name: 'Add code' })).toBeEnabled();
}

type AdminSessionCookies = Awaited<ReturnType<BrowserContext['storageState']>>['cookies'];

// Workers share one sign-in through a file in the project's outputDir, which
// Playwright empties when a run starts — so the cache is scoped to one run by
// construction. Sharing matters beyond parallel workers: `--repeat-each` gives
// every repetition its own worker, so a fixture that only memoized per worker
// would still sign in once per repetition and five repetitions of this file
// pass the login bucket inside half a minute. A cached cookie is trusted only
// after it opens the console, so a stale or foreign file costs one page load,
// never a wrong session.
//
// Workers that start together would all miss the cache and each sign in, which
// at five workers spent the bucket the login specs needed. So the first worker
// to create the lock file signs in and the rest wait for its cookies, falling
// back to their own sign-in only if the cookies never arrive.
const SESSION_CACHE_FILE = 'admin-session-cookies.json';
const SESSION_LOCK_FILE = 'admin-session-cookies.lock';
const SESSION_CACHE_POLL_MS = 100;

function sessionCachePaths(workerInfo: WorkerInfo) {
  const { outputDir } = workerInfo.project;
  return { cache: join(outputDir, SESSION_CACHE_FILE), lock: join(outputDir, SESSION_LOCK_FILE) };
}

/** True for exactly one worker per run: the one whose exclusive create won. */
async function claimSignIn(lockPath: string) {
  try {
    await writeFile(lockPath, String(process.pid), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false;
    throw error;
  }
}

async function waitForCachedSession(path: string): Promise<AdminSessionCookies | null> {
  const deadline = Date.now() + SIGN_IN_SETTLE_MS;
  while (Date.now() < deadline) {
    const cookies = await readCachedSession(path);
    if (cookies) return cookies;
    await new Promise((resolve) => setTimeout(resolve, SESSION_CACHE_POLL_MS));
  }
  return null;
}

async function readCachedSession(path: string): Promise<AdminSessionCookies | null> {
  try {
    // A file this run wrote from `storageState()`; the console check below is
    // what validates it before any test rides on it.
    return JSON.parse(await readFile(path, 'utf8')) as AdminSessionCookies;
  } catch {
    return null;
  }
}

// Written beside then renamed into place, so a worker reading while another
// writes sees either no file or a whole one.
async function writeCachedSession(path: string, cookies: AdminSessionCookies) {
  const partial = `${path}.${process.pid}`;
  await writeFile(partial, JSON.stringify(cookies));
  await rename(partial, path);
}

// /admin decides auth on the server, so the load event already carries either
// the console or the sign-in form — no hydration to wait for.
async function cachedSessionOpensConsole(
  context: BrowserContext,
  page: Page,
  cookies: AdminSessionCookies
) {
  await context.addCookies(cookies);
  await page.goto('/admin');
  return adminConsole(page).isVisible();
}

async function establishAdminSession(browser: Browser, workerInfo: WorkerInfo) {
  const { cache, lock } = sessionCachePaths(workerInfo);
  await mkdir(dirname(cache), { recursive: true });
  const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
  const page = await context.newPage();
  let cookies = await readCachedSession(cache);
  if (!cookies && !(await claimSignIn(lock))) cookies = await waitForCachedSession(cache);
  if (!cookies || !(await cachedSessionOpensConsole(context, page, cookies))) {
    await context.clearCookies();
    await signInToAdmin(page);
    cookies = (await context.storageState()).cookies;
    await writeCachedSession(cache, cookies);
  }
  await context.close();
  return cookies;
}

// The session cookie is a derived HMAC of the admin secret, not a server-side
// record, so one sign-in yields a cookie every test in the run can carry — and
// a form spec signing out only clears its own context's copy. The sign-in
// happens in a throwaway context so the cookies come from the real `login`
// action rather than a hand-built cookie that would have to agree with the
// route's cookie name and path.
export const test = base.extend<{ adminPage: Page }, { adminSessionCookies: AdminSessionCookies }>({
  adminSessionCookies: [
    async ({ browser }, use, workerInfo) => {
      await use(await establishAdminSession(browser, workerInfo));
    },
    { scope: 'worker' },
  ],
  /** The regular `page`, signed in with the worker's session and open on the console. */
  adminPage: async ({ context, page, adminSessionCookies }, use) => {
    await context.addCookies(adminSessionCookies);
    await openAdminConsole(page);
    await use(page);
  },
});

export { expect };
