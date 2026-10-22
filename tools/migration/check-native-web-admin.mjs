// Drives the export's admin document in Chromium on a Netlify-shaped local host: the export's
// files, then pretty URLs, then 404.html with status 404, and /api/* answered by the real /api
// function (netlify/functions/api.ts) under a test admin secret, loaded through the SvelteKit-free
// function host (tools/lib/netlify-function-host.mjs). Never calls the hosted API.
//
// Two hosts, as the function runs in two modes. In dev mode its token store keeps
// edits in memory, so the console signs in, keeps its bearer session across a reload, lists, adds
// and removes codes, and forgets the session on a 401 and on sign-out. Deployed it has no such
// store without Netlify Blobs and its CSRF guard is on: the console's same-origin bearer writes
// pass the guard and reach the store, which refuses them, while a cross-site form write is
// refused before any handler runs. Signed in, the console reads the usage figures beside the
// codes: with no tally store it says the tallies are unavailable, and it shows the free grants the
// dev function holds in memory. Without JavaScript the page reads and offers no live control,
// and it asks search engines to leave it out.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { ADMIN_STATS_PATH } from '../../src/pageDocument/admin/adminApi.ts';
import { ADMIN_SESSION_KEY } from '../../src/pageDocument/admin/adminContract.ts';
import { SESSION_ENDED } from '../../src/pageDocument/admin/useAdminConsole.ts';
import { UNLINKED_DOCUMENT_PATHS } from '../../src/information/unlinkedDocuments.ts';
import {
  invokeFunction,
  loadNetlifyFunctions,
  writeResponse,
} from '../lib/netlify-function-host.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { NATIVE_WEB_EXPORT_DIR, NOT_FOUND_FILE } from './build-native-web.mjs';
import { ADMIN_ROBOTS_META } from './prerender-native-web-admin.mjs';

// The Playwright web server's admin key (web/tests/admin-helpers.ts), never a real secret, and
// the env-seeded codes the token store starts from.
const TEST_ADMIN_SECRET = 'test-admin-secret';
const SEED_TOKENS = ['alpha', 'beta'];
const ADMIN_PATH = UNLINKED_DOCUMENT_PATHS.admin;
const TOKENS_PATH = '/api/admin/tokens';
const FREE_GRANTS_MODULE = join(ROOT, 'netlify/server/freeGenerationGrants.ts');
// A synthetic installation the dev function's in-memory grant ledger is seeded with.
const SEEDED_INSTALLATION = 'f'.repeat(64);
const TALLIES_UNAVAILABLE = 'Generation tallies are unavailable.';
const STORAGE_UNAVAILABLE = 'Token storage is unavailable';
const BLOBS_UNAVAILABLE = 'Netlify Blobs is unavailable';
const SETTLE_MS = 10_000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

export async function startAdminHost({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  mode = 'development',
  port = 0,
} = {}) {
  process.env.ADMIN_ACCESS_TOKEN = TEST_ADMIN_SECRET;
  process.env.ALLOWED_TOKENS_LIST = SEED_TOKENS.join(',');
  delete process.env.USAGE_GRANT_ID_SECRET;
  const functions = await loadNetlifyFunctions(mode);
  const base = resolve(exportDir);
  const fileAt = (pathname) => {
    const candidate = resolve(base, `.${decodeURIComponent(pathname)}`);
    if (!candidate.startsWith(base + sep)) return null;
    return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
  };
  // What the function received and answered, as the host saw it.
  const calls = [];
  const server = createServer((request, response) => {
    void (async () => {
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);
      const handler = functions.functionFor(pathname);
      if (handler) {
        const answer = await invokeFunction(handler, request);
        calls.push({
          method: request.method,
          path: pathname,
          origin: request.headers.origin ?? null,
          authorization: request.headers.authorization ?? null,
          status: answer.status,
        });
        await writeResponse(response, answer);
        return;
      }
      const file = fileAt(pathname) ?? fileAt(`${pathname}.html`);
      const served = file ?? join(base, NOT_FOUND_FILE);
      response.statusCode = file ? 200 : 404;
      response.setHeader(
        'Content-Type',
        CONTENT_TYPES[extname(served)] ?? 'application/octet-stream'
      );
      response.end(readFileSync(served));
    })().catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  await new Promise((ready) => server.listen(port, '127.0.0.1', ready));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    calls,
    serverModule: functions.serverModule,
    close: async () => {
      server.close();
      await functions.close();
    },
  };
}

const consoleHeading = (tab) => tab.getByRole('heading', { name: /^Access codes/ });
const signInHeading = (tab) => tab.getByRole('heading', { name: 'Sign in' });
const storedSession = (tab) => tab.evaluate((key) => localStorage.getItem(key), ADMIN_SESSION_KEY);
const writesOf = (calls) => calls.filter(({ method }) => method === 'POST' || method === 'DELETE');

async function signIn(tab, key) {
  await tab.getByPlaceholder('Admin access key').fill(key);
  await tab.getByRole('button', { name: 'Sign in' }).click();
}

async function addCode(tab, token) {
  await tab.getByPlaceholder('Add a code…').fill(token);
  await tab.getByRole('button', { name: 'Add code' }).click();
}

// A step the flow cannot go on without: a timeout names the step instead of the locator.
async function reach(locator, step) {
  try {
    await locator.waitFor();
  } catch {
    throw new Error(`${ADMIN_PATH} never showed ${step}`);
  }
}

function check(problems, ok, message) {
  if (!ok) problems.push(message);
}

async function openConsole(browser) {
  const context = await browser.newContext();
  const tab = await context.newPage();
  tab.setDefaultTimeout(SETTLE_MS);
  tab.on('dialog', (dialog) => void dialog.accept());
  return { context, tab };
}

async function checkWithoutJavaScript(browser, { origin }, problems) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const tab = await context.newPage();
  const response = await tab.goto(`${origin}${ADMIN_PATH}`);
  check(problems, response.status() === 200, `${ADMIN_PATH} answered ${response.status()}`);
  check(
    problems,
    (await response.text()).includes(ADMIN_ROBOTS_META),
    `${ADMIN_PATH} does not ask search engines to leave it out`
  );
  const reads = await tab.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  for (const text of ['Admin', 'Manage AI access codes', 'needs JavaScript to sign in'])
    check(
      problems,
      reads.includes(text),
      `${ADMIN_PATH} without JavaScript does not read "${text}"`
    );
  check(
    problems,
    await tab.getByRole('button', { name: 'Sign in' }).isDisabled(),
    `${ADMIN_PATH} without JavaScript offers a live Sign in button`
  );
  await context.close();
}

// The narrowest phone the page sheet serves: its masthead stays inside the window, with or
// without a script, and keeps the brand link's suffix whole beside the back link.
const NARROW_VIEWPORT = { width: 320, height: 740 };

async function checkNarrowMasthead(browser, { origin }, problems) {
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, viewport: NARROW_VIEWPORT });
    const tab = await context.newPage();
    await tab.goto(`${origin}${ADMIN_PATH}`);
    await tab.evaluate(() => document.fonts.ready);
    const fit = await tab.evaluate(() => {
      const brand = [...document.querySelectorAll('a[href="/"]')].find((link) =>
        link.textContent.includes('Admin')
      );
      return {
        scrollWidth: document.documentElement.scrollWidth,
        brandRight: brand?.getBoundingClientRect().right ?? null,
      };
    });
    const at = `${ADMIN_PATH} at ${NARROW_VIEWPORT.width} px (JavaScript ${javaScriptEnabled ? 'on' : 'off'})`;
    check(
      problems,
      fit.scrollWidth <= NARROW_VIEWPORT.width,
      `${at} scrolls ${fit.scrollWidth} px wide`
    );
    check(
      problems,
      fit.brandRight !== null && fit.brandRight <= NARROW_VIEWPORT.width,
      `${at} ends its brand link at ${fit.brandRight} px, past the window`
    );
    await context.close();
  }
}

// One completed free generation in the dev function's in-memory grant ledger.
async function seedFreeGrant(serverModule) {
  const grants = await serverModule(FREE_GRANTS_MODULE);
  const reservation = await grants.reserveFreeGeneration(SEEDED_INSTALLATION);
  if (!reservation.reserved) throw new Error('The dev function refused a free generation');
  await grants.completeFreeGeneration(SEEDED_INSTALLATION, reservation.reservationId);
}

async function checkFigures(tab, { calls }, session, problems) {
  await reach(
    tab.getByRole('heading', { name: 'Free generation grants · sample 1', exact: true }),
    'the free generation grants panel'
  );
  check(
    problems,
    calls.some(
      ({ path, authorization, status }) =>
        path === ADMIN_STATS_PATH && authorization === `Bearer ${session}` && status === 200
    ),
    'The console did not read its figures with its bearer session'
  );
  check(
    problems,
    await tab.getByRole('status').filter({ hasText: TALLIES_UNAVAILABLE }).isVisible(),
    `The console without a tally store does not say "${TALLIES_UNAVAILABLE}"`
  );
  const grant = tab
    .getByRole('table', { name: 'Recent free generation grants' })
    .getByRole('row')
    .filter({ hasText: `${SEEDED_INSTALLATION.slice(0, 8)}…` });
  check(
    problems,
    (await grant.isVisible()) && (await grant.textContent()).includes('1/10'),
    'The free grant panel does not list the seeded grant as 1/10 used'
  );
}

async function checkSessionAndCodes(browser, { origin, calls, serverModule }, problems) {
  await seedFreeGrant(serverModule);
  const { context, tab } = await openConsole(browser);
  await tab.goto(`${origin}${ADMIN_PATH}`);
  await signIn(tab, 'not-the-key');
  await reach(
    tab.getByRole('alert').filter({ hasText: 'Incorrect access key.' }),
    'the wrong key refused'
  );
  check(problems, (await storedSession(tab)) === null, 'A refused sign-in stored a session');

  await signIn(tab, TEST_ADMIN_SECRET);
  await reach(consoleHeading(tab), 'the console after signing in');
  const session = await storedSession(tab);
  check(problems, Boolean(session), 'Signing in stored no session');
  await checkFigures(tab, { calls }, session, problems);
  for (const token of SEED_TOKENS)
    check(
      problems,
      await tab.getByRole('row').filter({ hasText: token }).isVisible(),
      `The console does not list ${token}`
    );

  calls.length = 0;
  await tab.reload();
  await reach(consoleHeading(tab), 'the console after a reload, without signing in again');
  check(
    problems,
    calls.every(({ path }) => path !== '/api/admin/login'),
    'The console signed in again after a reload'
  );
  check(
    problems,
    calls.some(
      ({ path, authorization }) => path === TOKENS_PATH && authorization === `Bearer ${session}`
    ),
    'The reloaded console did not list codes with its stored bearer session'
  );

  const token = `rn-admin-${Date.now()}`;
  await addCode(tab, token);
  await reach(tab.getByRole('status').filter({ hasText: `Added “${token}”` }), `${token} added`);
  const row = tab.getByRole('row').filter({ hasText: token });
  check(problems, await row.isVisible(), `The added code ${token} is not listed`);
  const listed = await fetch(`${origin}${TOKENS_PATH}`, {
    headers: { Authorization: `Bearer ${session}` },
  }).then((answer) => answer.json());
  check(problems, listed.tokens?.includes(token), `The function's list lacks the added ${token}`);

  const remove = tab.getByRole('button', { name: `Remove ${token}`, exact: true });
  await reach(remove, `${token}'s Remove button`);
  await remove.click();
  await reach(
    tab.getByRole('status').filter({ hasText: `Removed “${token}”` }),
    `${token} removed`
  );
  check(problems, (await row.count()) === 0, `The removed code ${token} is still listed`);
  const writes = writesOf(calls);
  check(
    problems,
    writes.map(({ method, status }) => `${method} ${status}`).join() === 'POST 200,DELETE 200',
    `The console's writes were answered ${JSON.stringify(writes)}`
  );

  await tab.evaluate((key) => localStorage.setItem(key, 'not-a-session'), ADMIN_SESSION_KEY);
  await tab.reload();
  await reach(tab.getByRole('alert').filter({ hasText: SESSION_ENDED }), 'sign-in after a 401');
  check(problems, await signInHeading(tab).isVisible(), 'A 401 did not return to sign-in');
  check(problems, (await storedSession(tab)) === null, 'A 401 left its session stored');

  await signIn(tab, TEST_ADMIN_SECRET);
  await reach(consoleHeading(tab), 'the console after signing in again');
  await tab.getByRole('button', { name: 'Sign out' }).click();
  await reach(signInHeading(tab), 'sign-in after signing out');
  check(problems, (await storedSession(tab)) === null, 'Signing out left its session stored');
  await tab.reload();
  await reach(signInHeading(tab), 'sign-in after signing out and reloading');
  check(problems, !(await consoleHeading(tab).isVisible()), 'The console survived sign-out');
  await context.close();
}

async function checkDeployedGuards(browser, { origin, calls }, problems) {
  const { context, tab } = await openConsole(browser);
  await tab.goto(`${origin}${ADMIN_PATH}`);
  await signIn(tab, TEST_ADMIN_SECRET);
  await reach(consoleHeading(tab), 'the deployed console after signing in');
  check(
    problems,
    await tab.getByRole('status').filter({ hasText: BLOBS_UNAVAILABLE }).isVisible(),
    `The console without Netlify Blobs does not say "${BLOBS_UNAVAILABLE}"`
  );
  calls.length = 0;
  await addCode(tab, `rn-admin-deployed-${Date.now()}`);
  await reach(
    tab.getByRole('alert').filter({ hasText: STORAGE_UNAVAILABLE }),
    'the deployed write refused by storage'
  );
  const [write] = writesOf(calls);
  check(
    problems,
    write?.origin === origin && write.status === 503,
    `The console's same-origin write was not refused by storage alone: ${JSON.stringify(write)}`
  );
  await context.close();
  const crossSite = await fetch(`${origin}${TOKENS_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Origin: 'https://elsewhere.example' },
    body: 'token=x',
  });
  check(
    problems,
    crossSite.status === 403,
    `A cross-site form write answered ${crossSite.status}, not the CSRF guard's 403`
  );
}

export async function checkNativeWebAdmin({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  log = console.log,
} = {}) {
  const dev = await startAdminHost({ exportDir, mode: 'development' });
  const deployed = await startAdminHost({ exportDir, mode: 'production' });
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const problems = [];
  try {
    await checkWithoutJavaScript(browser, dev, problems);
    await checkNarrowMasthead(browser, dev, problems);
    await checkSessionAndCodes(browser, dev, problems);
    await checkDeployedGuards(browser, deployed, problems);
  } finally {
    await browser.close();
    await dev.close();
    await deployed.close();
  }
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[native-web-admin] ${ADMIN_PATH} signs in on the local /api function, keeps its session across a reload, lists, adds and removes codes, reads its usage figures and free grants, forgets the session on a 401 and on sign-out; deployed, its same-origin bearer writes pass the CSRF guard; it reads without JavaScript and is noindex, and its masthead fits ${NARROW_VIEWPORT.width} px`
  );
}

if (isMain(import.meta.url)) runMain(async () => checkNativeWebAdmin());
