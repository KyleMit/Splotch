import { chromium } from '@playwright/test';

const base = process.argv[2];
const out = {};
const sw = (page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    const cached = {};
    for (const key of keys) {
      const requests = await (await caches.open(key)).keys();
      cached[key] = {
        count: requests.length,
        expo: requests.filter((r) => r.url.includes('/_expo/')).length,
        sveltekit: requests.filter((r) => r.url.includes('/_app/')).length,
        shell: requests.filter((r) => r.url.includes('app-shell-build')).map((r) => r.url),
      };
    }
    return {
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      active: reg?.active?.state ?? null,
      waiting: reg?.waiting?.state ?? null,
      installing: reg?.installing?.state ?? null,
      cached,
    };
  });
const which = (page) =>
  page.evaluate(() => ({
    title: document.title,
    app: document.querySelector('script[src*="/_expo/"], #startup-scripts')
      ? 'rn'
      : document.querySelector('link[href*="/_app/"], script[src*="/_app/"]')
        ? 'sveltekit'
        : 'other',
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 100),
  }));
async function strokes(page, n) {
  const { width, height } = page.viewportSize();
  for (let i = 0; i < n; i += 1) {
    await page.mouse.move(width * 0.4, height * (0.3 + i * 0.08));
    await page.mouse.down();
    await page.mouse.move(width * 0.6, height * (0.35 + i * 0.08), {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
}
async function waitFor(page, predicate, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const state = await sw(page);
    if (predicate(state)) return state;
    await page.waitForTimeout(500);
  }
  return { timedOut: true, ...(await sw(page)) };
}
const switchTo = (root) => fetch(`${base}/__switch?root=${root}`);

const browser = await chromium.launch();
try {
  // A: the composed deploy on a fresh browser.
  await switchTo('composed');
  let context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  let page = await context.newPage();
  await page.goto(`${base}/`);
  await page.waitForSelector('html[data-controls-live]', { timeout: 60_000 });
  out.composedRoot = await which(page);
  await strokes(page, 4);
  out.composedWorker = await waitFor(page, (s) => s.active === 'activated', 60_000);
  await page.reload();
  out.composedWorkerAfterReload = await sw(page);
  out.apiSameOrigin = await page.evaluate(async () => {
    const r = await fetch('/api/free-generation-grant');
    return { status: r.status, servedBy: r.headers.get('x-served-by') };
  });
  for (const path of ['/privacy', '/changelog', '/beta', '/feedback', '/admin', '/no-such-page']) {
    const response = await page.goto(`${base}${path}`);
    out[`online ${path}`] = {
      status: response.status(),
      ...(await which(page)),
    };
  }
  // Every link to the drawing route on a retained SvelteKit page must load the export's document,
  // not a client-side render of SvelteKit's own `/`.
  for (const path of ['/privacy', '/changelog', '/beta']) {
    await page.goto(`${base}${path}`);
    await page.waitForTimeout(1500);
    const links = await page.locator('a[href="/"]').count();
    const results = [];
    for (let index = 0; index < links; index += 1) {
      await page.goto(`${base}${path}`);
      await page.waitForTimeout(1500);
      const documents = [];
      const onRequest = (request) => {
        if (request.isNavigationRequest()) documents.push(new URL(request.url()).pathname);
      };
      page.on('request', onRequest);
      await page.locator('a[href="/"]').nth(index).click();
      await page.waitForTimeout(3000);
      page.off('request', onRequest);
      results.push({ documents, ...(await which(page)) });
    }
    out[`links to / from ${path}`] = results;
  }
  await context.setOffline(true);
  for (const path of ['/', '/privacy', '/beta', '/no-such-page']) {
    try {
      const response = await page.goto(`${base}${path}`, { timeout: 15_000 });
      await page.waitForTimeout(3000);
      out[`offline ${path}`] = {
        status: response?.status(),
        ...(await which(page)),
      };
    } catch (error) {
      out[`offline ${path}`] = { error: String(error).slice(0, 120) };
    }
  }
  await context.close();

  // B: no JavaScript.
  context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  page = await context.newPage();
  for (const path of ['/', '/privacy', '/changelog', '/beta']) {
    const response = await page.goto(`${base}${path}`);
    out[`nojs ${path}`] = { status: response.status(), ...(await which(page)) };
  }
  await context.close();

  // C: handoff from an installed shipping worker.
  await switchTo('shipping');
  context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  await page.goto(`${base}/`);
  await page.waitForTimeout(3000);
  await strokes(page, 5);
  out.shippingWorker = await waitFor(page, (s) => s.active === 'activated', 60_000);
  await page.close();
  await switchTo('composed');
  page = await context.newPage();
  await page.goto(`${base}/`);
  out.handoffFirstDocument = await which(page);
  await page.waitForSelector('html[data-controls-live]', { timeout: 60_000 }).catch(() => {});
  out.handoffWorker = await waitFor(
    page,
    (s) =>
      s.active === 'activated' &&
      !s.waiting &&
      !s.installing &&
      Object.values(s.cached).some((c) => c.expo > 0),
    90_000
  );
  await page.close();
  page = await context.newPage();
  await page.goto(`${base}/`);
  out.handoffSecondLaunch = { ...(await which(page)), ...(await sw(page)) };
  await context.setOffline(true);
  await page.goto(`${base}/`);
  await page.waitForTimeout(3000);
  out.handoffOffline = await which(page);
  await context.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
