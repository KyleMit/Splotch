import { appendFileSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit, expect } from '@playwright/test';
import { PAGE_TEXT_WITHOUT_JS } from '../../../../tools/migration/check-native-web-pages-without-js.mjs';
import { isMain } from '../../../../tools/lib/proc.mjs';
import { BETA_COPY } from '../../../../experiments/native-architecture/src/pageDocument/betaCopy.ts';
import {
  BETA_PLATFORM_ATTRIBUTE,
  BETA_PLATFORM_LABELS,
  betaPathFor,
} from '../../../../web/src/lib/components/beta/betaPlatform.ts';

export const OUT = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
export const EVIDENCE = `${OUT}/evidence/run4`;
export const BASE = process.env.HUNT_BASE ?? 'http://127.0.0.1:6150';
const PAGE_ACTION_TIMEOUT_MS = 10_000;
const PAGE_READ_TIMEOUT_MS = 15_000;
const STATUS_HEARTBEAT_MS = 900_000;
const BOX_TOLERANCE_PX = 2;

const ENGINE = process.env.HUNT_ENGINE ?? 'chromium';
const profiles = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
  narrow: { width: 320, height: 740 },
  short: { width: 915, height: 412 },
};
const schemes = {
  light: { colorScheme: 'light' },
  dark: { colorScheme: 'dark' },
  forced: { colorScheme: 'light', forcedColors: 'active' },
  forcedDark: { colorScheme: 'dark', forcedColors: 'active' },
};
const routes = [
  ['drawing', '/'],
  ['privacy', '/privacy'],
  ['changelog', '/changelog'],
  ['beta', '/beta'],
  ['beta-ios', '/beta?os=ios'],
  ['beta-android', '/beta?os=android'],
  ['feedback', '/feedback'],
  ['admin', '/admin'],
  ['design', '/design'],
  ['notFound', '/run4-unknown/deep/path'],
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const privacy = JSON.parse(
  readFileSync('experiments/native-architecture/src/information/privacy.generated.json', 'utf8')
).web;
const releaseNotes = JSON.parse(
  readFileSync(
    'experiments/native-architecture/src/information/releaseNotes.generated.json',
    'utf8'
  )
);
const fullText = {
  privacy: [
    privacy.updated,
    ...privacy.highlights,
    ...privacy.sections.flatMap((section) =>
      section.blocks.flatMap((block) => block.spans.map((span) => span.text.trim()).filter(Boolean))
    ),
  ],
  changelog: Object.values(releaseNotes).flatMap((sections) =>
    sections.flatMap((section) => section.blocks.map((block) => block.text))
  ),
};

export async function localContext(browser, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options });
  const external = [],
    requests = [],
    errors = [],
    timeline = [],
    consoleErrors = [],
    violations = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === BASE || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    window.__qaCsp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__qaCsp.push({
        directive: e.violatedDirective,
        blocked: e.blockedURI,
        disposition: e.disposition,
      })
    );
  });
  context.on('request', (r) =>
    requests.push({
      method: r.method(),
      url: r.url(),
      body: r.url().includes('/api/') ? r.postData() : null,
      authorization: r.headers().authorization ?? null,
    })
  );
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_ACTION_TIMEOUT_MS);
  page.on('pageerror', (e) => {
    errors.push(String(e));
    timeline.push({
      type: 'pageerror',
      url: page.url(),
      at: new Date().toISOString(),
      message: e.message,
      stack: e.stack,
    });
  });
  if (process.env.HUNT_TRACE_NAV === '1') {
    await context.exposeBinding('__qaLifecycle', ({ page }, event) =>
      timeline.push({ ...event, observedUrl: page.url(), at: new Date().toISOString() })
    );
    await context.addInitScript(() => {
      for (const type of ['beforeunload', 'pagehide', 'pageshow'])
        addEventListener(
          type,
          () => void window.__qaLifecycle({ type, url: location.href, ready: document.readyState })
        );
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame())
        timeline.push({ type: 'navigated', url: frame.url(), at: new Date().toISOString() });
    });
  }
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('dialog', (d) => d.accept());
  return { context, page, external, requests, errors, timeline, consoleErrors, violations };
}

export async function fontsReady(page) {
  await expect
    .poll(() => page.evaluate(() => document.fonts.status), { timeout: PAGE_READ_TIMEOUT_MS })
    .toBe('loaded');
}

export async function reactHydrated(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.getElementById('root');
          const key = root && Object.keys(root).find((key) => key.startsWith('__reactContainer$'));
          return key ? root[key]?.stateNode?.current?.memoizedState?.isDehydrated : null;
        }),
      { timeout: PAGE_READ_TIMEOUT_MS }
    )
    .toBe(false);
}

export async function receipt(page) {
  return page.evaluate(() => {
    const shown = (e) => e.checkVisibility({ visibilityProperty: true });
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const links = [...document.querySelectorAll('a[href]')].filter(shown).map((e) => ({
      text: e.textContent.trim(),
      href: e.getAttribute('href'),
      rect: rect(e),
    }));
    const anchors = links
      .filter((x) => x.href.startsWith('#'))
      .map((x) => {
        const target = document.getElementById(decodeURIComponent(x.href.slice(1)));
        return { ...x, found: !!target, shown: !!target && shown(target) };
      });
    const scrollers = [...document.querySelectorAll('*')]
      .filter((e) => {
        const style = getComputedStyle(e);
        return (
          shown(e) && /(auto|scroll)/.test(style.overflowY) && e.scrollHeight > e.clientHeight + 2
        );
      })
      .map((e) => ({
        tag: e.tagName,
        id: e.id,
        testid: e.getAttribute('data-testid'),
        height: e.clientHeight,
        total: e.scrollHeight,
        scroll: e.scrollTop,
        rect: rect(e),
      }));
    const overflow = [...document.querySelectorAll('h1,h2,h3,p,input,textarea,a,button')]
      .filter(shown)
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width && (r.left < -2 || r.right > innerWidth + 2);
      })
      .map((e) => ({
        tag: e.tagName,
        text: e.textContent.slice(0, 100),
        label: e.getAttribute('aria-label'),
        rect: rect(e),
      }));
    return {
      title: document.title,
      headings: [...document.querySelectorAll('h1')].filter(shown).map((e) => e.textContent),
      text: document.body.innerText,
      links,
      anchors,
      scrollers,
      overflow,
      variants: [...document.querySelectorAll('[data-page-variant],[data-admin-theme]')]
        .filter(shown)
        .map((e) => e.getAttribute('data-page-variant') ?? e.getAttribute('data-admin-theme')),
      viewport: {
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
      },
      browserContext: {
        userAgent: navigator.userAgent,
        devicePixelRatio,
        maxTouchPoints: navigator.maxTouchPoints,
      },
      visualViewport: window.visualViewport
        ? {
            width: visualViewport.width,
            height: visualViewport.height,
            scale: visualViewport.scale,
          }
        : null,
      csp: window.__qaCsp ?? [],
      media: {
        dark: matchMedia('(prefers-color-scheme:dark)').matches,
        forcedColors: matchMedia('(forced-colors:active)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion:reduce)').matches,
      },
      beta: document.documentElement.getAttribute('data-beta-os'),
      images: [...document.images]
        .filter(shown)
        .map((e) => ({ src: e.currentSrc, complete: e.complete, width: e.naturalWidth })),
    };
  });
}

export async function followAnchor(page, href) {
  const link = page
    .locator(`a[href=${JSON.stringify(href)}]`)
    .filter({ visible: true })
    .first();
  if (process.env.HUNT_LINK_MODE === 'keyboard') {
    await link.focus();
    await link.press('Enter');
  } else await link.click();
  await expect
    .poll(
      () =>
        page.evaluate((href) => {
          const target = document.getElementById(decodeURIComponent(href.slice(1)));
          if (!target || !target.checkVisibility()) return null;
          const r = target.getBoundingClientRect();
          return r.top >= -1 && r.top < innerHeight;
        }, href),
      { timeout: PAGE_ACTION_TIMEOUT_MS }
    )
    .toBe(true);
  return page.evaluate(
    (href) => ({
      href,
      hash: location.hash,
      top: document.getElementById(decodeURIComponent(href.slice(1))).getBoundingClientRect().top,
    }),
    href
  );
}

async function feedback(s, id) {
  const { page, context } = s;
  const sent = [];
  let fail = true;
  await context.route('**/api/report', async (route) => {
    sent.push({
      method: route.request().method(),
      body: route.request().postDataJSON(),
      url: route.request().url(),
    });
    await route.fulfill({
      status: fail ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        fail ? { ok: false, error: 'Fixture: could not send your report.' } : { ok: true }
      ),
    });
  });
  const field = page.getByRole('textbox').filter({ visible: true }).first();
  await field.fill('Run four local fixture report. No real support issue.');
  await button(page, 'Send report').click();
  await expect(page.getByRole('alert')).toContainText('Fixture: could not send your report.');
  await expect(field).toHaveValue('Run four local fixture report. No real support issue.');
  const failure = await page.getByRole('alert').innerText();
  await page.screenshot({ path: `${EVIDENCE}/pages/${id}-feedback-failure.png` });
  fail = false;
  await button(page, 'Send report').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Thank you — your report is in.'
  );
  await expect(page.getByText('Your report was sent.', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/pages/${id}-feedback-success.png` });
  expect(sent).toHaveLength(2);
  expect(
    sent.every(
      (x) => x.method === 'POST' && new URL(x.url).origin === BASE && x.body.kind === 'bug'
    )
  ).toBe(true);
  expect(sent.every((x) => x.body.device === undefined)).toBe(true);
  const another = page.getByRole('link', { name: 'Send another', exact: true });
  await another.focus();
  await another.press('Enter');
  await expect(field).toHaveValue('');
  await context.unroute('**/api/report');
  return { sent, failure, draftRetained: true, reset: true };
}

export async function admin(s, id) {
  const { page } = s;
  const field = page.getByLabel('Admin access key', { exact: true });
  await expect(field).toBeEnabled();
  await field.fill('run4-wrong-test-secret');
  await button(page, 'Sign in').click();
  await expect(page.getByText('Incorrect access key.', { exact: true })).toBeVisible();
  await field.fill('run4-test-secret');
  await field.press('Enter');
  await expect(button(page, 'Sign out')).toBeVisible();
  await expect(page.getByText('run4-fixture-code', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('4/500', { exact: true }).first()).toBeVisible();
  const signedIn = await receipt(page);
  await page.screenshot({ path: `${EVIDENCE}/pages/${id}-admin-signed-in.png` });
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(JSON.stringify(stored)).not.toContain('run4-test-secret');
  const code = `run4-${id}`;
  await page.getByLabel('New access code', { exact: true }).fill(code);
  await button(page, 'Add code').click();
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/pages/${id}-admin-added-code.png` });
  await page.reload();
  await expect(button(page, 'Sign out')).toBeVisible();
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
  const remove = page.getByRole('button', { name: `Remove ${code}`, exact: true });
  await remove.click();
  await expect(page.getByText(code, { exact: true })).toHaveCount(0);
  await button(page, 'Sign out').click();
  await expect(field).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('splotch-admin-session'))).toBeNull();
  return {
    rejectedWrongSecret: true,
    listed: true,
    stats: true,
    addedRemoved: true,
    reloadRetained: true,
    signedOut: true,
    stored,
    signedIn,
  };
}

async function matrix(browser, profile, scheme, js, route) {
  const [name, path] = route;
  const take = process.env.HUNT_TAKE ?? 'matrix';
  const id = `${take}-${ENGINE}-${profile}-${scheme}-js${js ? 'on' : 'off'}-${name}`;
  const s = await localContext(browser, {
    viewport: profiles[profile],
    hasTouch: profile !== 'desktop',
    javaScriptEnabled: js,
    ...(process.env.HUNT_MOBILE === '1' && ENGINE !== 'firefox' && profile !== 'desktop'
      ? { isMobile: true }
      : {}),
    ...schemes[scheme],
    reducedMotion: process.env.HUNT_MOTION ?? 'reduce',
  });
  const { page } = s;
  const row = {
    id,
    take,
    mobileViewportMode:
      process.env.HUNT_MOBILE === '1' && ENGINE !== 'firefox' && profile !== 'desktop',
    reducedMotion: process.env.HUNT_MOTION ?? 'reduce',
    at: new Date().toISOString(),
    engine: ENGINE,
    browserVersion: browser.version(),
    profile,
    scheme,
    js,
    path,
    status: 'PASS',
  };
  try {
    const response = await page.goto(BASE + path);
    row.http = response.status();
    row.documentSha256 = hash(await response.body());
    expect(row.http).toBe(name === 'notFound' ? 404 : 200);
    if (js && name === 'drawing')
      await page.locator('html[data-controls-live]').waitFor({ state: 'attached' });
    if (js && name === 'feedback') await expect(button(page, 'Send report')).toBeEnabled();
    if (js && profile === 'short') {
      const about = button(page, 'About this page').filter({ visible: true });
      if (await about.count())
        await expect(async () => {
          if ((await about.getAttribute('aria-expanded')) !== 'true') await about.click();
          await expect(about).toHaveAttribute('aria-expanded', 'true', { timeout: 250 });
        }).toPass({ timeout: PAGE_READ_TIMEOUT_MS });
    }
    if (js && name === 'changelog') {
      await expect(button(page, /Show \d+ older releases/)).toBeVisible();
      await expect(async () => {
        const older = button(page, /Show \d+ older releases/);
        if (await older.isVisible()) await older.click();
        await expect(older).toHaveCount(0);
      }).toPass({ timeout: PAGE_READ_TIMEOUT_MS });
    }
    await fontsReady(page);
    const read = await receipt(page);
    row.initial = read;
    writeFileSync(
      `${EVIDENCE}/pages/${id}-initial.aria.txt`,
      await page.locator('body').ariaSnapshot()
    );
    const key = name.startsWith('beta') ? 'beta' : name;
    if (PAGE_TEXT_WITHOUT_JS[key]) {
      const expected = PAGE_TEXT_WITHOUT_JS[key]();
      expect(read.headings).toEqual([expected.heading]);
      let text = [...expected.text, ...(fullText[key] ?? [])];
      if (js && key === 'feedback') text = text.filter((x) => !x.includes('needs JavaScript'));
      if (js && key === 'beta') {
        const chosen = await page.locator('html').getAttribute(BETA_PLATFORM_ATTRIBUTE);
        text = text.filter((x) => x !== (chosen === 'ios' ? BETA_COPY.android : BETA_COPY.ios));
      }
      const compact = read.text.replace(/\s+/g, ' ').toLowerCase();
      row.missing = text.filter((x) => !compact.includes(x.replace(/\s+/g, ' ').toLowerCase()));
      expect(row.missing).toEqual([]);
    }
    if (name === 'drawing' && !js)
      expect(read.headings).toContain('Splotch needs JavaScript to draw');
    if (name === 'admin' && !js) {
      expect(read.text).toContain('The admin console needs JavaScript to sign in.');
      row.noScriptAdminLabelCount = await page
        .getByLabel('Admin access key', { exact: true })
        .filter({ visible: true })
        .count();
      await expect(page.locator('input[type="password"]').filter({ visible: true })).toBeDisabled();
    }
    row.layoutProblems =
      read.viewport.scrollWidth > profiles[profile].width + BOX_TOLERANCE_PX
        ? [
            `Document scroll width ${read.viewport.scrollWidth}px at ${profiles[profile].width}px viewport`,
          ]
        : [];
    await expect
      .poll(async () => (await receipt(page)).images.filter((x) => !x.complete || !x.width))
      .toEqual([]);
    await page.screenshot({ path: `${EVIDENCE}/pages/${id}-top.png` });
    row.anchorTargets = read.anchors;
    expect(read.anchors.filter((x) => !x.found)).toEqual([]);
    const anchors = read.anchors.filter(
      (x) => x.text.length > 1 && x.found && x.shown && !/back to top/i.test(x.text)
    );
    if (anchors.length) row.followed = await followAnchor(page, anchors.at(-1).href);
    if (name.startsWith('beta') && js) {
      const requested = new URL(path, BASE).searchParams.get('os');
      if (requested) expect(read.beta).toBe(requested);
      const platform = read.beta ?? (path.includes('ios') ? 'ios' : 'android');
      if (name !== 'beta')
        await expect(page.locator(`[data-beta-panel="${platform}"]`)).toBeVisible();
      const other = platform === 'ios' ? 'android' : 'ios';
      const choice = page.getByRole('radio', { name: BETA_PLATFORM_LABELS[other], exact: true });
      if (await choice.isVisible()) await choice.click();
      else {
        const alternate = page
          .locator(`a[href=${JSON.stringify(betaPathFor(other))}]`)
          .filter({ visible: true });
        await expect(alternate).toBeVisible();
        await alternate.click();
      }
      await expect(page.locator(`[data-beta-panel="${other}"]`)).toBeVisible();
      expect(new URL(page.url()).searchParams.get('os')).toBe(other);
      await expect(page.locator(`#beta-platform-${other}`)).toHaveAttribute('aria-checked', 'true');
      await page.reload();
      await expect(page.locator(`[data-beta-panel="${other}"]`)).toBeVisible();
      await expect(page.locator(`#beta-platform-${other}`)).toHaveAttribute('aria-checked', 'true');
    }
    if (name === 'feedback' && js) row.form = await feedback(s, id);
    if (name === 'admin' && js) row.admin = await admin(s, id);
    await page.evaluate(() => {
      for (const e of document.querySelectorAll('*')) {
        if (e.checkVisibility() && /(auto|scroll)/.test(getComputedStyle(e).overflowY))
          e.scrollTop = e.scrollHeight;
      }
      scrollTo(0, document.documentElement.scrollHeight);
    });
    await fontsReady(page);
    row.bottom = await receipt(page);
    await page.screenshot({ path: `${EVIDENCE}/pages/${id}-bottom.png` });
    if (!['drawing'].includes(name)) {
      const home = page
        .getByRole('link', { name: /^(Start drawing|Back to drawing)$/ })
        .filter({ visible: true })
        .first();
      await expect(home).toHaveAttribute('href', '/');
      await home.click();
      await expect(page).toHaveURL(BASE + '/');
      if (js) await page.locator('html[data-controls-live]').waitFor({ state: 'attached' });
      else
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          'Splotch needs JavaScript to draw'
        );
      row.backToDrawing = true;
    }
    row.network = s.requests;
    row.errors = s.errors;
    row.timeline = s.timeline;
    row.consoleErrors = s.consoleErrors;
    row.external = s.external;
    row.csp = [...read.csp, ...row.bottom.csp];
    expect(s.errors).toEqual([]);
    expect(s.external).toEqual([]);
    expect(row.csp).toEqual([]);
    expect(row.layoutProblems).toEqual([]);
    const expectedHttp = name === 'feedback' ? [404, 503] : name === 'admin' ? [404, 403] : [404];
    expect(
      s.consoleErrors.filter(
        (x) =>
          !expectedHttp.some((status) => new RegExp(`^Failed to load resource:.*${status}`).test(x))
      )
    ).toEqual([]);
  } catch (error) {
    row.status = 'REVIEW';
    row.error = String(error.stack).slice(0, 4500);
    row.errors = s.errors;
    row.timeline = s.timeline;
    row.consoleErrors = s.consoleErrors;
    row.external = s.external;
    row.state = await receipt(page).catch(() => null);
    await page.screenshot({ path: `${EVIDENCE}/pages/${id}-review.png` }).catch(() => {});
  } finally {
    await page
      .locator('body')
      .ariaSnapshot()
      .then((tree) => writeFileSync(`${EVIDENCE}/pages/${id}.aria.txt`, tree))
      .catch(() => {});
    await s.context.close();
    appendFileSync(`${EVIDENCE}/pages-observations.jsonl`, JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ id, status: row.status, error: row.error?.slice(0, 250) }));
  }
  return row;
}

if (isMain(import.meta.url)) {
  mkdirSync(`${EVIDENCE}/pages`, { recursive: true });
  const browser = await { chromium, webkit, firefox }[ENGINE].connect('ws://127.0.0.1:6190/');
  const started = Date.now();
  let lastStatus = 0;
  try {
    for (const profile of (process.env.HUNT_PROFILES ?? 'phone,tablet,desktop,narrow').split(','))
      for (const scheme of (process.env.HUNT_SCHEMES ?? 'light,dark,forced').split(','))
        for (const js of (process.env.HUNT_JS ?? 'on,off').split(',').map((x) => x === 'on'))
          for (const route of routes.filter(
            (x) => !process.env.HUNT_PAGES || process.env.HUNT_PAGES.split(',').includes(x[0])
          )) {
            await matrix(browser, profile, scheme, js, route);
            if (Date.now() - lastStatus > STATUS_HEARTBEAT_MS) {
              appendFileSync(
                `${OUT}/status.md`,
                `\n- ${new Date().toISOString()} — RUN 4 pages ${ENGINE}: completed ${profile}/${scheme}/JS ${js}/${route[0]}; raw verdicts and captures saved.\n`
              );
              lastStatus = Date.now();
            }
          }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ engine: ENGINE, ms: Date.now() - started, done: true }));
}
