// WEB-1 service-worker cells: first-visit gating, Save-Data, repeat-visit control, offline
// reload and in-app navigation, the update lifecycle, and the legacy page-cache cleanup (X22).
// Every arm sits behind its own proxy origin so its worker and caches start empty.
import { startArmProxy } from './arm-proxy.mjs';
import {
  ARM_NAMES,
  ARMS,
  boot,
  button,
  capture,
  contact,
  drawStrokes,
  openArm,
  openDialogs,
  regionDigest,
  undoDepth,
  collapseDrawer,
  visibilityShim,
} from './harness.mjs';
import { readHeadings } from './page-probes.mjs';

const REGISTRATION_WAIT_MS = 30_000;
const POLL_MS = 250;

function workerState() {
  return navigator.serviceWorker.getRegistration().then((registration) => ({
    registered: !!registration,
    active: registration?.active?.state ?? null,
    waiting: registration?.waiting?.state ?? null,
    installing: registration?.installing?.state ?? null,
    controlled: !!navigator.serviceWorker.controller,
    script: registration?.active ? new URL(registration.active.scriptURL).pathname : null,
  }));
}

async function waitFor(s, predicate, limitMs = REGISTRATION_WAIT_MS) {
  const started = Date.now();
  let state = await s.page.evaluate(workerState);
  while (!predicate(state) && Date.now() - started < limitMs) {
    await s.page.waitForTimeout(POLL_MS);
    state = await s.page.evaluate(workerState);
  }
  return { ...state, waitedMs: Date.now() - started };
}

async function cacheInventory(s) {
  return s.page.evaluate(async () => {
    const names = await caches.keys();
    const entries = {};
    for (const name of names) entries[name] = (await (await caches.open(name)).keys()).length;
    return entries;
  });
}

// Runs `run` once per arm, each behind a fresh proxy origin.
async function perArmBehindProxy(browser, profile, run, options = {}) {
  const result = {};
  for (const arm of ARM_NAMES) {
    const proxy = await startArmProxy(ARMS[arm].base);
    const session = await openArm(browser, arm, profile, { ...options, base: proxy.base });
    const swRequests = [];
    session.page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/sw.js') swRequests.push(Date.now());
    });
    try {
      result[arm] = await run(session, proxy, swRequests);
    } catch (error) {
      result[arm] = { error: String(error?.message ?? error).split('\n')[0] };
    } finally {
      result[arm] = {
        ...result[arm],
        external: session.external,
        consoleErrors: session.consoleErrors.slice(0, 5),
      };
      await session.ctx.close().catch(() => {});
      await proxy.close();
    }
  }
  return result;
}

function shortUrl(url) {
  return new URL(url).search || new URL(url).pathname;
}

// Playwright's framenavigated fires for document loads and for same-document history writes
// alike, so a replaceState that stamps history.state reads as a navigation. CDP reports the two
// separately: Page.frameNavigated only for a new document, Page.navigatedWithinDocument otherwise.
async function recordDocumentEvents(s) {
  const loads = [];
  const sameDocument = [];
  await s.cdp.send('Page.enable');
  const { frameTree } = await s.cdp.send('Page.getFrameTree');
  const mainFrameId = frameTree.frame.id;
  s.cdp.on('Page.frameNavigated', ({ frame }) => {
    if (frame.id === mainFrameId) loads.push(frame.url);
  });
  s.cdp.on('Page.navigatedWithinDocument', ({ frameId, url }) => {
    if (frameId === mainFrameId) sameDocument.push(url);
  });
  return { loads, sameDocument };
}

async function registerByStrokes(s) {
  await drawStrokes(s, 3);
  return waitFor(s, (state) => state.active === 'activated');
}

async function openPrivacyInApp(s) {
  await button(s, 'Settings').click();
  await s.page.getByRole('dialog').first().waitFor({ state: 'visible' });
  await s.page.waitForTimeout(1200);
  const about = s.page.locator('button[aria-label^="About"], button:has-text("About")').first();
  if (await about.isVisible().catch(() => false)) {
    await about.click();
    await s.page.waitForTimeout(1200);
  }
  await s.page.getByRole('link', { name: 'Privacy Policy' }).first().click();
  await s.page.waitForTimeout(2000);
}

export const SW_CELLS = {
  'sw-first-visit-gate': (browser) =>
    perArmBehindProxy(browser, 'desktop', async (s, proxy, swRequests) => {
      await boot(s);
      await s.page.waitForLoadState('networkidle');
      await s.page.waitForTimeout(2000);
      const atLoad = { ...(await s.page.evaluate(workerState)), swFetches: swRequests.length };
      await drawStrokes(s, 2);
      await s.page.waitForTimeout(1500);
      const afterTwo = { ...(await s.page.evaluate(workerState)), swFetches: swRequests.length };
      const thirdAt = Date.now();
      await drawStrokes(s, 1, 2);
      const afterThree = await waitFor(s, (state) => state.active === 'activated');
      return {
        atLoad,
        afterTwo,
        afterThree,
        firstSwFetchAfterThirdMs: swRequests.length ? swRequests[0] - thirdAt : null,
        caches: await cacheInventory(s),
      };
    }),

  'sw-save-data': (browser) =>
    perArmBehindProxy(
      browser,
      'desktop',
      async (s, proxy, swRequests) => {
        await boot(s);
        const saveData = await s.page.evaluate(() => navigator.connection?.saveData);
        await drawStrokes(s, 5);
        await s.page.waitForTimeout(8000);
        return {
          saveData,
          state: await s.page.evaluate(workerState),
          swFetches: swRequests.length,
        };
      },
      {
        initScripts: [
          () => {
            Object.defineProperty(NetworkInformation.prototype, 'saveData', { get: () => true });
          },
        ],
      }
    ),

  'sw-repeat-visit-and-offline': (browser) =>
    perArmBehindProxy(browser, 'desktop', async (s) => {
      await boot(s);
      const first = await registerByStrokes(s);
      await boot(s);
      const repeat = await s.page.evaluate(workerState);
      await s.ctx.setOffline(true);
      await s.page.reload();
      const offlineBoot = await s.page
        .locator(s.paper)
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      await s.page.waitForTimeout(1500);
      const offlineShot = await capture(s, `sw-offline-reload-${s.arm}`);
      let offlineInk = null;
      let survivedNavigation = null;
      let privacyHeadings = null;
      if (offlineBoot) {
        const blank = await regionDigest(s, [0.45, 0.425]);
        await contact(s, [
          [
            [0.3, 0.4],
            [0.6, 0.45],
          ],
        ]);
        const inked = await regionDigest(s, [0.45, 0.425]);
        offlineInk = inked !== blank;
        await openPrivacyInApp(s).catch(() => {});
        privacyHeadings = await s.page.evaluate(readHeadings);
        await capture(s, `sw-offline-inapp-privacy-${s.arm}`);
        await s.page.goBack();
        await s.page
          .locator(s.paper)
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => {});
        await s.page.waitForTimeout(1500);
        // In-app navigation brings Settings back on return (E0784); close it before reading ink.
        if ((await openDialogs(s)).length) {
          await s.page.keyboard.press('Escape');
          await s.page.waitForTimeout(1200);
        }
        survivedNavigation = {
          sameInk: (await regionDigest(s, [0.45, 0.425]).catch(() => null)) === inked,
          url: new URL(s.page.url()).pathname,
        };
      }
      const icon = await s.page
        .evaluate(async () => {
          const response = await fetch('/apple-touch-icon.png');
          const bitmap = await createImageBitmap(await response.blob());
          return { ok: response.ok, width: bitmap.width, height: bitmap.height };
        })
        .catch((error) => ({ error: error.message.split('\n')[0] }));
      const direct = {};
      for (const path of ['/privacy', '/changelog', '/feedback', '/no-such-page']) {
        const response = await s.page
          .goto(s.base + path)
          .catch((error) => ({ error: error.message }));
        await s.page.waitForTimeout(1500);
        direct[path] = {
          ok: !response?.error,
          error: response?.error?.split('\n')[0] ?? null,
          title: await s.page.title().catch(() => null),
          headings: await s.page.evaluate(readHeadings).catch(() => null),
        };
      }
      return {
        first,
        repeat,
        offlineBoot,
        offlineShot,
        offlineInk,
        privacyHeadings,
        survivedNavigation,
        direct,
        icon,
      };
    }),

  // A deploy lands while the app is open: the next check finds a byte-changed worker. With ink
  // on the paper nothing reloads; at the hidden edge with a blank canvas the update applies.
  'sw-update-lifecycle': (browser) =>
    perArmBehindProxy(
      browser,
      'desktop',
      async (s, proxy) => {
        await boot(s);
        const first = await registerByStrokes(s);
        await boot(s);
        const original = await proxy.fetchUpstream('/sw.js');
        proxy.override(
          '/sw.js',
          Buffer.concat([original.body, Buffer.from('\n// next deploy\n')]),
          'text/javascript'
        );
        proxy.override(
          '/version.json',
          JSON.stringify({ version: '9.9.9+next' }),
          'application/json'
        );
        const navigations = [];
        s.page.on('framenavigated', (frame) => {
          if (frame === s.page.mainFrame()) navigations.push({ url: frame.url(), at: Date.now() });
        });
        const documentEvents = await recordDocumentEvents(s);
        const blank = await regionDigest(s, [0.45, 0.425]);
        await contact(s, [
          [
            [0.3, 0.4],
            [0.6, 0.45],
          ],
        ]);
        await s.page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await s.page.waitForTimeout(32_000);
        await s.page.evaluate(() => {
          window.__setHidden(true);
          window.__setHidden(false);
        });
        const found = await waitFor(s, (state) => state.waiting === 'installed', 20_000);
        await s.page.evaluate(() => window.__setHidden(true));
        await s.page.waitForTimeout(4000);
        const hiddenWithInk = {
          ...(await s.page.evaluate(workerState)),
          navigations: navigations.length,
        };
        await s.page.evaluate(() => window.__setHidden(false));
        const undone = await undoDepth(s);
        await collapseDrawer(s);
        await s.page.waitForTimeout(1500);
        const cleared = (await regionDigest(s, [0.45, 0.425])) === blank;
        const navigationsBeforeHide = navigations.length;
        await s.page.evaluate(() => window.__setHidden(true)).catch(() => {});
        await s.page.waitForTimeout(8000);
        const afterHiddenBlank = await s.page
          .evaluate(workerState)
          .catch((error) => ({ error: error.message }));
        return {
          first,
          found,
          hiddenWithInk,
          undone,
          cleared,
          navigationsAfterHiddenBlank: navigations.length - navigationsBeforeHide,
          navigations: navigations.map(
            (entry) => new URL(entry.url).search || new URL(entry.url).pathname
          ),
          documentLoads: documentEvents.loads.map(shortUrl),
          sameDocumentWrites: documentEvents.sameDocument.map(shortUrl),
          afterHiddenBlank,
          proxyOverrides: proxy.log
            .filter((entry) => entry.override)
            .map((entry) => entry.pathname),
        };
      },
      { initScripts: [visibilityShim] }
    ),

  // A cold launch after a deploy: the stale page meets a newer /version.json.
  'sw-stale-launch': (browser) =>
    perArmBehindProxy(browser, 'desktop', async (s, proxy) => {
      await boot(s);
      const first = await registerByStrokes(s);
      const original = await proxy.fetchUpstream('/sw.js');
      proxy.override(
        '/sw.js',
        Buffer.concat([original.body, Buffer.from('\n// next deploy\n')]),
        'text/javascript'
      );
      proxy.override(
        '/version.json',
        JSON.stringify({ version: '9.9.9+next' }),
        'application/json'
      );
      const navigations = [];
      s.page.on('framenavigated', (frame) => {
        if (frame === s.page.mainFrame()) navigations.push(frame.url());
      });
      await boot(s);
      await s.page.waitForTimeout(8000);
      const blankLaunch = {
        url: s.page.url(),
        navigations: [...navigations],
        state: await s.page.evaluate(workerState),
      };
      await s.ctx.setOffline(true);
      await s.page.reload().catch(() => {});
      const offlineAfterDeploy = await s.page
        .locator(s.paper)
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      return {
        first,
        blankLaunch,
        offlineAfterDeploy,
        shot: await capture(s, `sw-stale-launch-offline-${s.arm}`),
      };
    }),

  'sw-legacy-page-cache': (browser) =>
    perArmBehindProxy(browser, 'desktop', async (s) => {
      await boot(s);
      await s.page.evaluate(async () => {
        const cache = await caches.open('pages');
        for (const path of ['/', '/index.html', '/privacy?earlier=1'])
          await cache.put(
            path,
            new Response('earlier page', { headers: { 'Content-Type': 'text/html' } })
          );
      });
      const before = await cacheInventory(s);
      const first = await registerByStrokes(s);
      await s.page.waitForTimeout(3000);
      const after = await cacheInventory(s);
      const worker = await s.page.evaluate(async () => {
        const text = await (await fetch('/sw.js')).text();
        const imported = /sw-page-cache-cleanup-[0-9a-f]{8}\.js/.exec(text)?.[0] ?? null;
        return {
          imported,
          status: imported ? (await fetch(`/${imported}`)).status : null,
          bytes: text.length,
        };
      });
      return { before, first, after, legacyDeleted: !('pages' in after), worker };
    }),
};
