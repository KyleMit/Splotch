// WEB-1 cells for saving (download and folder save, X61), the coloring download policy on an
// unknown or metered connection (X19), orientation and fullscreen, Settings scrollbars, the boot
// head, the hosted-route disposition (X64), the root error boundary, invite links and the web
// credential vault.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  boot,
  button,
  capture,
  contact,
  expandDrawer,
  fileResponse,
  launch,
  onBothArms,
  openDialogs,
  openSection,
  openSettings,
  where,
} from './harness.mjs';
import { readHeadings, readLinks, readSurfaceLocks } from './page-probes.mjs';

const REPO = new URL('../../../../../', import.meta.url).pathname;
const COLORING_STATIC = `${REPO}web/static`;
const TEST_KEY = 'sk-proj-parityfixture0000000000000000000000000000';

// The labeled fixtures this file installs: the hosted API answers and a coloring CDN serving the
// head's committed static books. Nothing reaches a real host.
async function apiFixture(s, log = []) {
  await s.ctx.route(/\/api\//, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    log.push({ method: request.method(), pathname, origin: request.headers().origin ?? null });
    const cors = {
      'Access-Control-Allow-Origin': request.headers().origin ?? '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (status, body) =>
      route.fulfill({
        status,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (pathname === '/api/verify-key') return json(200, { ok: true });
    if (pathname === '/api/verify-access-code')
      return json(200, { ok: true, accessCode: 'parity-access-code' });
    if (pathname === '/api/free-generation-grant')
      return json(200, { ok: true, remaining: 10, limit: 10 });
    return json(503, { ok: false, error: 'Fixture: endpoint not modeled' });
  });
  return log;
}

async function coloringFixture(s, log = []) {
  await s.ctx.route('https://splotch.art/coloring/**', (route) => {
    const { pathname } = new URL(route.request().url());
    log.push(pathname);
    const response = fileResponse(COLORING_STATIC, pathname);
    return response
      ? route.fulfill({ ...response, headers: { 'Access-Control-Allow-Origin': '*' } })
      : route.fulfill({ status: 404 });
  });
  return log;
}

function connectionShim(kind) {
  return {
    'no-api': () => {
      Object.defineProperty(Navigator.prototype, 'connection', { get: () => undefined });
    },
    'save-data': () => {
      Object.defineProperty(NetworkInformation.prototype, 'saveData', { get: () => true });
    },
    '2g': () => {
      Object.defineProperty(NetworkInformation.prototype, 'effectiveType', { get: () => '2g' });
    },
    cellular: () => {
      Object.defineProperty(NetworkInformation.prototype, 'type', { get: () => 'cellular' });
    },
  }[kind];
}

async function dialogText(s) {
  return s.page.evaluate(() => {
    const dialog = [...document.querySelectorAll('dialog[open], [role="dialog"]')].find((element) =>
      element.checkVisibility()
    );
    return dialog ? dialog.innerText.replace(/\s+/g, ' ').trim() : null;
  });
}

async function coloringState(s) {
  await expandDrawer(s);
  await button(s, 'Coloring books').click();
  await s.page.waitForTimeout(4000);
  const text = await dialogText(s);
  const images = await s.page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((image) => image.checkVisibility())
      .map((image) => ({ ok: image.complete && image.naturalWidth > 0 }))
  );
  return {
    text: text?.slice(0, 600) ?? null,
    imagesShown: images.length,
    imagesDecoded: images.filter((image) => image.ok).length,
  };
}

async function enableAi(s) {
  await openSettings(s);
  await openSection(s, 'AI Art');
  const toggle = s.page
    .getByRole('switch', { name: 'Create AI Images' })
    .filter({ visible: true })
    .first();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await s.page.waitForTimeout(1500);
}

async function keyField(s) {
  return s.page
    .locator('input[placeholder="Paste your OpenAI API key"]')
    .filter({ visible: true })
    .first();
}

async function submitKey(s, value) {
  const field = await keyField(s);
  await field.fill(value);
  await s.page.waitForTimeout(300);
  await s.page.getByRole('button', { name: 'Save' }).filter({ visible: true }).first().click();
  await s.page.waitForTimeout(2500);
}

async function vaultState(s) {
  return s.page.evaluate(async () => {
    const databases =
      (await indexedDB.databases?.())?.map((database) => database.name).sort() ?? null;
    const local = Object.keys(localStorage)
      .filter((key) => /ai|secure|vault|installation|free/i.test(key))
      .sort();
    const alerts = [...document.querySelectorAll('[role="alert"]')]
      .filter((element) => element.checkVisibility())
      .map((element) => element.innerText.trim());
    const inputs = [...document.querySelectorAll('input')]
      .filter((element) => element.checkVisibility())
      .map((element) => ({
        type: element.type,
        value: element.value.replace(/[a-z0-9]{6,}/gi, (m) => `${m.slice(0, 3)}…${m.slice(-3)}`),
        readOnly: element.readOnly,
      }));
    return { databases, local, alerts, inputs };
  });
}

export const MISC_CELLS = {
  'save-download': async (browser) => {
    const result = {};
    for (const scale of [1, 2]) {
      result[`dpr${scale}`] = await onBothArms(
        browser,
        'desktop',
        async (s) => {
          await boot(s);
          await contact(s, [
            [
              [0.3, 0.4],
              [0.6, 0.45],
            ],
          ]);
          await expandDrawer(s);
          const download = s.page.waitForEvent('download', { timeout: 15_000 });
          await button(s, 'Save screenshot').click();
          const file = await download.catch((error) => ({ error: error.message.split('\n')[0] }));
          if (file.error) return { download: file.error, dialogs: await openDialogs(s) };
          const bytes = readFileSync(await file.path());
          const meta = await sharp(bytes).metadata();
          await s.page.waitForTimeout(1500);
          return {
            filenamePattern: /^splotch-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/.test(
              file.suggestedFilename()
            ),
            filename: file.suggestedFilename().replace(/\d/g, '#'),
            width: meta.width,
            height: meta.height,
            viewport: s.page.viewportSize(),
            after: await capture(s, `save-download-dpr${scale}-${s.arm}`),
          };
        },
        { context: { deviceScaleFactor: scale } }
      );
    }
    return result;
  },

  'folder-save-row-and-picker': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const supported = await s.page.evaluate(() => 'showDirectoryPicker' in window);
      await openSettings(s);
      await openSection(s, 'Saving');
      const row = await s.page.evaluate(() => {
        const choose = [...document.querySelectorAll('button')].find(
          (element) => element.innerText.trim() === 'Choose folder' && element.checkVisibility()
        );
        if (!choose) return null;
        let rowElement = choose.parentElement;
        while (rowElement && rowElement.innerText.trim() === 'Choose folder')
          rowElement = rowElement.parentElement;
        const label = [...rowElement.querySelectorAll('*')].find(
          (element) => element.childElementCount === 0 && /Save drawings to/.test(element.innerText)
        );
        const box = (element) => {
          const r = element.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        };
        return {
          text: rowElement.innerText.replace(/\s+/g, ' ').trim(),
          label: label ? box(label) : null,
          action: box(choose),
        };
      });
      const shot = await capture(s, `folder-save-row-${s.arm}`);
      const pickerCalls = await s.page.evaluate(() => {
        window.__pickerOutcome = null;
        const original = window.showDirectoryPicker;
        window.showDirectoryPicker = (...args) =>
          original.apply(window, args).then(
            (handle) => {
              window.__pickerOutcome = 'handle';
              return handle;
            },
            (error) => {
              window.__pickerOutcome = `${error.name}: ${error.message}`;
              throw error;
            }
          );
        return true;
      });
      await s.page
        .getByRole('button', { name: 'Choose folder' })
        .filter({ visible: true })
        .first()
        .click();
      await s.page.waitForTimeout(3000);
      return {
        supported,
        row,
        shot,
        pickerCalls,
        pickerOutcome: await s.page.evaluate(() => window.__pickerOutcome),
      };
    }),

  // Diagnostic only: the picker answers with the origin-private directory, so the write path after
  // a choice can be observed. It is not a pass of a real folder choice.
  'folder-save-opfs-diagnostic': (browser) =>
    onBothArms(
      browser,
      'desktop',
      async (s) => {
        await boot(s);
        await openSettings(s);
        await openSection(s, 'Saving');
        await s.page
          .getByRole('button', { name: 'Choose folder' })
          .filter({ visible: true })
          .first()
          .click();
        await s.page.waitForTimeout(2000);
        const rowText = await dialogText(s);
        await s.page.keyboard.press('Escape');
        await s.page.waitForTimeout(1200);
        await contact(s, [
          [
            [0.3, 0.4],
            [0.6, 0.45],
          ],
        ]);
        await expandDrawer(s);
        const downloads = [];
        s.page.on('download', (download) =>
          downloads.push(download.suggestedFilename().replace(/\d/g, '#'))
        );
        await button(s, 'Save screenshot').click();
        await s.page.waitForTimeout(4000);
        const files = await s.page.evaluate(async () => {
          const root = await navigator.storage.getDirectory();
          const names = [];
          for await (const [name, handle] of root.entries())
            names.push(`${handle.kind}:${name.replace(/\d/g, '#')}`);
          return names;
        });
        const saving = rowText?.match(/Save drawings to.{0,80}/)?.[0] ?? null;
        return { saving, downloads, files, shot: await capture(s, `folder-save-opfs-${s.arm}`) };
      },
      {
        initScripts: [
          () => {
            window.showDirectoryPicker = async () => navigator.storage.getDirectory();
          },
        ],
      }
    ),

  'coloring-connection-policy': async (browser) => {
    const result = {};
    for (const kind of ['chromium-default', 'no-api', 'save-data', '2g', 'cellular']) {
      result[kind] = await onBothArms(
        browser,
        'desktop',
        async (s) => {
          const fetched = await coloringFixture(s);
          const sameOrigin = [];
          s.page.on('request', (request) => {
            const { pathname } = new URL(request.url());
            if (pathname.startsWith('/coloring/') && !pathname.startsWith('/coloring/max-240px'))
              sameOrigin.push(pathname);
          });
          await boot(s);
          const connection = await s.page.evaluate(() =>
            navigator.connection
              ? {
                  type: navigator.connection.type ?? null,
                  effectiveType: navigator.connection.effectiveType,
                  saveData: navigator.connection.saveData,
                }
              : null
          );
          await s.page.waitForTimeout(6000);
          const picker = await coloringState(s);
          await s.page.waitForTimeout(6000);
          const shot = await capture(s, `coloring-${kind}-${s.arm}`);
          return {
            connection,
            picker,
            crossOriginBookFetches: fetched.length,
            sameOriginBookFetches: sameOrigin.length,
            shot,
          };
        },
        { initScripts: kind === 'chromium-default' ? [] : [connectionShim(kind)] }
      );
    }
    return result;
  },

  'orientation-and-fullscreen': async (browser) => {
    const result = {};
    for (const profile of ['desktop', 'android', 'iphone']) {
      result[profile] = await onBothArms(
        browser,
        profile,
        async (s) => {
          await boot(s);
          const fullscreenButtons = await s.page
            .getByRole('button', { name: /full ?screen/i })
            .filter({ visible: true })
            .evaluateAll((elements) =>
              elements.map((element) => element.getAttribute('aria-label') || element.innerText)
            );
          await openSettings(s);
          await openSection(s, 'Appearance');
          const tabText = await dialogText(s);
          await s.page.keyboard.press('Escape');
          await s.page.waitForTimeout(1200);
          let inFullscreen = null;
          if (fullscreenButtons.length) {
            await s.page
              .getByRole('button', { name: /full ?screen/i })
              .filter({ visible: true })
              .first()
              .click();
            await s.page.waitForTimeout(1500);
            inFullscreen = {
              element: await s.page.evaluate(() => document.fullscreenElement?.tagName ?? null),
              locks: await s.page.evaluate(() => window.__locks),
              shot: await capture(s, `fullscreen-${profile}-${s.arm}`),
            };
            await openSettings(s);
            await openSection(s, 'Appearance');
            inFullscreen.text = (await dialogText(s))?.match(/Orientation.{0,200}/)?.[0] ?? null;
            await s.page.keyboard.press('Escape');
            await s.page.waitForTimeout(1000);
            await s.page.evaluate(() => document.exitFullscreen());
            await s.page.waitForTimeout(1500);
            inFullscreen.afterExit = {
              element: await s.page.evaluate(() => document.fullscreenElement?.tagName ?? null),
              unlocks: await s.page.evaluate(() => window.__unlocks),
              buttons: await s.page
                .getByRole('button', { name: /full ?screen/i })
                .filter({ visible: true })
                .evaluateAll((elements) =>
                  elements.map((element) => element.getAttribute('aria-label'))
                ),
            };
            await s.page
              .getByRole('button', { name: /full ?screen/i })
              .filter({ visible: true })
              .first()
              .click();
            await s.page.waitForTimeout(1500);
            inFullscreen.reentered = { locks: await s.page.evaluate(() => window.__locks) };
          }
          return {
            fullscreenButtons,
            orientationInTab: tabText?.match(/Orientation.{0,200}/)?.[0] ?? null,
            inFullscreen,
          };
        },
        {
          initScripts: [
            () => {
              window.__locks = [];
              window.__unlocks = 0;
              ScreenOrientation.prototype.unlock = function () {
                window.__unlocks += 1;
              };
              ScreenOrientation.prototype.lock = function (orientation) {
                window.__locks.push(
                  `${orientation}${document.fullscreenElement ? '@fullscreen' : '@tab'}`
                );
                return document.fullscreenElement
                  ? Promise.resolve()
                  : Promise.reject(new DOMException('not fullscreen', 'NotSupportedError'));
              };
            },
          ],
        }
      );
    }
    return result;
  },

  'tablet-browser-chrome': (browser) =>
    onBothArms(browser, 'android-tablet', async (s) => {
      await boot(s);
      const full = await capture(s, `tablet-chrome-full-${s.arm}`);
      const controls = async () =>
        s.page.evaluate(() =>
          ['Expand controls', 'Settings', 'Clear drawing'].map((name) => {
            const element = [...document.querySelectorAll('button')].find(
              (candidate) =>
                candidate.getAttribute('aria-label') === name && candidate.checkVisibility()
            );
            const r = element?.getBoundingClientRect();
            return r
              ? {
                  name,
                  x: Math.round(r.x),
                  y: Math.round(r.y),
                  w: Math.round(r.width),
                  h: Math.round(r.height),
                }
              : { name, missing: true };
          })
        );
      const before = await controls();
      await s.page.setViewportSize({ width: 1024, height: 668 });
      await s.page.waitForTimeout(1500);
      return {
        before,
        after: await controls(),
        full,
        shrunk: await capture(s, `tablet-chrome-shrunk-${s.arm}`),
      };
    }),

  // Classic scrollbars: Playwright's headless default hides them, so this cell runs in its own
  // browser without that switch.
  'settings-scrollbars': async () => {
    const browser = await launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
    const result = {};
    for (const width of [1280, 900, 760]) {
      result[`w${width}`] = await onBothArms(
        browser,
        'desktop',
        async (s) => {
          await boot(s);
          await openSettings(s);
          const scrollers = await s.page.evaluate(() =>
            [...document.querySelectorAll('*')]
              .filter((element) => {
                const style = getComputedStyle(element);
                return (
                  element.checkVisibility() &&
                  ((/(auto|scroll)/.test(style.overflowY) &&
                    element.scrollHeight > element.clientHeight + 4) ||
                    (/(auto|scroll)/.test(style.overflowX) &&
                      element.scrollWidth > element.clientWidth + 4))
                );
              })
              .map((element) => {
                const r = element.getBoundingClientRect();
                const gutterX = r.right - (element.offsetWidth - element.clientWidth) / 2 - 1;
                const hit = document.elementFromPoint(gutterX, r.top + r.height * 0.9);
                return {
                  vertical: element.offsetWidth - element.clientWidth,
                  horizontal: element.offsetHeight - element.clientHeight,
                  box: {
                    x: Math.round(r.x),
                    y: Math.round(r.y),
                    w: Math.round(r.width),
                    h: Math.round(r.height),
                  },
                  gutterHitsScroller: hit === element,
                };
              })
          );
          return { scrollers, shot: await capture(s, `settings-scrollbars-${width}-${s.arm}`) };
        },
        { context: { viewport: { width, height: 800 } } }
      );
    }
    await browser.close();
    return result;
  },

  // Frames from the first drawer opening, not settled: whether its icons paint with the tiles.
  'drawer-first-open-icons': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const box = await button(s, 'Expand controls').boundingBox();
      const clip = { x: 0, y: Math.max(0, box.y - 360), width: 420, height: 420 };
      await button(s, 'Expand controls').click();
      const started = Date.now();
      const frames = [];
      for (const atMs of [80, 200, 350, 600, 1200]) {
        await s.page.waitForTimeout(Math.max(0, atMs - (Date.now() - started)));
        const frame = await s.page.screenshot({ clip });
        const name = `drawer-first-open-${atMs}ms-${s.arm}`;
        await sharp(frame)
          .webp({ quality: 55 })
          .toFile(new URL(`./shots/${name}.webp`, import.meta.url).pathname);
        frames.push({ atMs: Date.now() - started, shot: `shots/${name}.webp` });
      }
      return { frames };
    }),

  'info-back-label-after-reload': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      await openSettings(s);
      await openSection(s, 'About');
      await s.page
        .getByRole('link', { name: 'Privacy Policy' })
        .filter({ visible: true })
        .first()
        .click();
      await s.page.waitForTimeout(2000);
      const label = () =>
        s.page
          .getByRole('link', { name: /drawing/i })
          .filter({ visible: true })
          .first()
          .innerText();
      const beforeReload = await label();
      await s.page.reload();
      await s.page.waitForTimeout(2500);
      const afterReload = await label();
      await s.page
        .getByRole('link', { name: /drawing/i })
        .filter({ visible: true })
        .first()
        .click();
      await s.page.waitForTimeout(2500);
      return {
        beforeReload,
        afterReload,
        followed: await where(s),
        paper: await s.page.locator(s.paper).isVisible(),
      };
    }),

  'boot-head': (browser) =>
    onBothArms(
      browser,
      'desktop',
      async (s) => {
        await boot(s);
        const head = await s.page.evaluate(() => window.__bootHead);
        const csp = await s.page.evaluate(
          () =>
            document
              .querySelector('meta[http-equiv="Content-Security-Policy"]')
              ?.getAttribute('content') ?? null
        );
        const inline = await s.page.evaluate(() =>
          [...document.querySelectorAll('script:not([src])')]
            .filter((script) => !script.type || /javascript|module/.test(script.type))
            .map((script) => script.textContent)
        );
        const hashes = inline.map(
          (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
        );
        return {
          head,
          title: await s.page.title(),
          csp: csp ? csp.slice(0, 120) : null,
          inlineScripts: inline.length,
          inlineAuthorized: csp ? hashes.filter((hash) => csp.includes(hash)).length : null,
          unsafeInline: csp ? /script-src[^;]*'unsafe-inline'/.test(csp) : null,
        };
      },
      {
        initScripts: [
          () => {
            document.addEventListener('DOMContentLoaded', () => {
              const html = document.documentElement;
              window.__bootHead = {
                attributes: [...html.attributes].map((attribute) => attribute.name).sort(),
                colorScheme: getComputedStyle(html).colorScheme,
                themeColor:
                  document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ??
                  null,
              };
            });
          },
        ],
      }
    ),

  'appearance-restamp-without-state': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await s.page.emulateMedia({ colorScheme: 'light' });
      await s.page.goto(`${s.base}/privacy`);
      await s.page.waitForTimeout(2000);
      const read = () =>
        s.page.evaluate(() => ({
          attributes: [...document.documentElement.attributes]
            .map((a) => `${a.name}=${a.value}`)
            .filter((a) => !a.startsWith('style'))
            .sort(),
          background: getComputedStyle(document.body).backgroundColor,
        }));
      const light = await read();
      await s.page.emulateMedia({ colorScheme: 'dark' });
      await s.page.waitForTimeout(1500);
      const dark = await read();
      return { light, dark, shot: await capture(s, `restamp-dark-${s.arm}`) };
    }),

  'routes-direct-and-in-app': async (browser) => {
    const direct = await onBothArms(browser, 'desktop', async (s) => {
      const pages = {};
      for (const path of [
        '/',
        '/privacy',
        '/changelog',
        '/feedback',
        '/no-such-page',
        '/privacy/missing',
      ]) {
        const response = await s.page.goto(s.base + path);
        await s.page.waitForTimeout(2500);
        pages[path] = {
          status: response?.status() ?? null,
          title: await s.page.title(),
          headings: (await s.page.evaluate(readHeadings)).slice(0, 4),
          links: (await s.page.evaluate(readLinks))
            .map((link) => `${link.text} -> ${link.href}`)
            .slice(0, 12),
          paper: await s.page.locator(s.paper).isVisible(),
          locks: (await s.page.evaluate(readSurfaceLocks)).appSurface,
          shot: await capture(s, `route${path.replace(/\//g, '-') || '-root'}-${s.arm}`),
        };
      }
      return pages;
    });
    const inApp = await onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const visits = {};
      for (const [section, link] of [
        ['About', 'Privacy Policy'],
        ['About', 'See all releases'],
      ]) {
        await openSettings(s);
        await openSection(s, section);
        await s.page.getByRole('link', { name: link }).filter({ visible: true }).first().click();
        await s.page.waitForTimeout(2000);
        visits[link] = {
          ...(await where(s)),
          headings: (await s.page.evaluate(readHeadings)).slice(0, 3),
        };
        await s.page.goBack();
        await s.page.waitForTimeout(1500);
        if ((await openDialogs(s)).length) {
          await s.page.keyboard.press('Escape');
          await s.page.waitForTimeout(1000);
        }
      }
      return visits;
    });
    return { direct, inApp };
  },

  'routes-without-javascript': (browser) =>
    onBothArms(
      browser,
      'desktop',
      async (s) => {
        const pages = {};
        for (const path of ['/no-such-page', '/privacy']) {
          const response = await s.page.goto(s.base + path);
          await s.page.waitForTimeout(1000);
          pages[path] = {
            status: response?.status() ?? null,
            title: await s.page.title(),
            text: (await s.page.evaluate(() => document.body?.innerText ?? ''))
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 160),
          };
        }
        return pages;
      },
      { context: { javaScriptEnabled: false } }
    ),

  'not-found-layouts': async (browser) => {
    const result = {};
    for (const [name, context] of [
      ['320-light', { viewport: { width: 320, height: 640 }, colorScheme: 'light' }],
      ['320-dark', { viewport: { width: 320, height: 640 }, colorScheme: 'dark' }],
      ['short', { viewport: { width: 640, height: 320 } }],
      ['forced-colors', { viewport: { width: 390, height: 844 }, forcedColors: 'active' }],
    ]) {
      result[name] = await onBothArms(
        browser,
        'desktop',
        async (s) => {
          await s.page.goto(`${s.base}/no-such-page`);
          await s.page.waitForTimeout(2500);
          const links = await s.page.evaluate(() =>
            [...document.querySelectorAll('a, [role="link"]')]
              .filter((element) => element.checkVisibility())
              .map((element) => {
                const r = element.getBoundingClientRect();
                return {
                  text: element.innerText.trim(),
                  y: Math.round(r.y),
                  right: Math.round(r.right),
                };
              })
          );
          const overflow = await s.page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth
          );
          const shot = await capture(s, `not-found-${name}-${s.arm}`);
          let recovered = null;
          if (name === '320-light') {
            const primary = s.page
              .getByRole('link', { name: /draw/i })
              .filter({ visible: true })
              .first();
            await primary.click();
            await s.page.waitForTimeout(2500);
            recovered = {
              path: new URL(s.page.url()).pathname,
              paper: await s.page.locator(s.paper).isVisible(),
            };
          }
          return { links, overflow, shot, recovered };
        },
        { context }
      );
    }
    return result;
  },

  // A render crash, induced the same way in both arms: every script the page has not yet loaded
  // fails, then Settings (lazy in both) is opened.
  'root-crash-lazy-chunk': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      await s.page.waitForTimeout(3000);
      const loaded = new Set(
        await s.page.evaluate(() =>
          performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname)
        )
      );
      const blocked = [];
      await s.ctx.route(/\.js($|\?)/, (route) => {
        const { pathname } = new URL(route.request().url());
        if (loaded.has(pathname)) return route.fallback();
        blocked.push(pathname);
        return route.abort('failed');
      });
      await button(s, 'Settings')
        .click()
        .catch(() => {});
      await s.page.waitForTimeout(4000);
      return {
        blocked: blocked.length,
        title: await s.page.title(),
        headings: await s.page.evaluate(readHeadings),
        buttons: await s.page
          .getByRole('button')
          .filter({ visible: true })
          .evaluateAll((elements) =>
            elements
              .map((element) => element.getAttribute('aria-label') || element.innerText.trim())
              .slice(0, 12)
          ),
        dialogs: await openDialogs(s),
        shot: await capture(s, `root-crash-${s.arm}`),
      };
    }),

  'invite-link': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      const api = await apiFixture(s);
      await boot(s, '/?ai_access_token=parity-invite-code');
      const url = new URL(s.page.url());
      await openSettings(s);
      await openSection(s, 'AI Art');
      const text = await dialogText(s);
      return {
        search: url.search,
        aiSwitch: await s.page
          .getByRole('switch', { name: 'Create AI Images' })
          .filter({ visible: true })
          .first()
          .getAttribute('aria-checked'),
        mentionsCode: /access code/i.test(text ?? ''),
        vault: await vaultState(s),
        api,
        shot: await capture(s, `invite-ai-settings-${s.arm}`),
      };
    }),

  // E0681 and E0682 driven the way their shipping specs drive them: the browser clears IndexedDB
  // under an open connection (Storage.clearDataForOrigin), and the key is saved again after it.
  'vault-save-reload-and-connection-loss': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      const api = await apiFixture(s);
      await s.ctx.addInitScript(() => {
        window.__persistCalls = 0;
        const original = navigator.storage.persist?.bind(navigator.storage);
        navigator.storage.persist = () => {
          window.__persistCalls += 1;
          return original ? original() : Promise.resolve(false);
        };
      });
      const clearIndexedDb = () =>
        s.cdp.send('Storage.clearDataForOrigin', {
          origin: new URL(s.page.url()).origin,
          storageTypes: 'indexeddb',
        });
      const reopen = async () => {
        await s.page.reload();
        await s.page.locator(s.paper).waitFor({ state: 'visible' });
        await s.page.waitForTimeout(1500);
        await enableAi(s);
        return vaultState(s);
      };
      await boot(s);
      await enableAi(s);
      await clearIndexedDb();
      await s.page.waitForTimeout(800);
      await submitKey(s, TEST_KEY);
      const savedAfterConnectionLoss = {
        ...(await vaultState(s)),
        persistCalls: await s.page.evaluate(() => window.__persistCalls),
      };
      const savedShot = await capture(s, `vault-saved-${s.arm}`);
      const afterReload = await reopen();
      await clearIndexedDb();
      await s.page.waitForTimeout(800);
      await s.page
        .getByRole('button', { name: 'Forget' })
        .filter({ visible: true })
        .first()
        .click();
      await s.page.waitForTimeout(1500);
      const afterForget = await vaultState(s);
      await submitKey(s, `${TEST_KEY.slice(0, -4)}9999`);
      const replacement = await vaultState(s);
      return {
        api,
        savedAfterConnectionLoss,
        savedShot,
        afterReload,
        afterForget,
        replacement,
        replacementAfterReload: await reopen(),
      };
    }),
};
