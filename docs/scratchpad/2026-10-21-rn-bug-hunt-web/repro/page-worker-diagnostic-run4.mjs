import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { connect, open, boot, stroke, expect, ENGINE, OUT, BASE } from './driver.mjs';
import { installAiFixture } from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const WORKER_ACTIVATION_TIMEOUT_MS = 45_000;
const LATE_ERROR_WINDOW_MS = 1_000;
const evidence = `${OUT}/evidence/run4`;
const paths = [
  '/',
  '/privacy',
  '/changelog',
  '/beta?os=ios',
  '/feedback',
  '/admin',
  '/design',
  '/worker-unknown/deep/path',
];
const cases = process.env.HUNT_WORKER_CASES?.split(',') ?? [
  'fast-sw-1',
  'fast-sw-2',
  'fast-sw-3',
  'settled-sw-1',
  'settled-sw-2',
  'settled-block-1',
  'settled-block-2',
];
mkdirSync(`${evidence}/worker-diagnostic`, { recursive: true });
const browser = await connect();
try {
  for (const id of cases) {
    const serviceWorkers = id.includes('block') ? 'block' : 'allow';
    const settled = id.startsWith('settled');
    const s = await open(browser, 'phone', { serviceWorkers });
    let phase = 'boot';
    const events = [];
    const row = {
      at: new Date().toISOString(),
      engine: ENGINE,
      id,
      serviceWorkers,
      settled,
      observations: [],
      events,
    };
    s.page.on('pageerror', (error) =>
      events.push({
        phase,
        url: s.page.url(),
        type: 'pageerror',
        message: error.message,
        stack: error.stack,
        at: new Date().toISOString(),
      })
    );
    s.page.on('console', (message) => {
      if (message.type() === 'error')
        events.push({
          phase,
          url: s.page.url(),
          type: 'console',
          message: message.text(),
          at: new Date().toISOString(),
        });
    });
    try {
      await installAiFixture(s.ctx);
      await boot(s);
      for (let i = 0; i < 3; i++) await stroke(s);
      if (serviceWorkers === 'allow')
        await expect
          .poll(
            () =>
              s.page.evaluate(
                async () => !!(await navigator.serviceWorker.getRegistration())?.active
              ),
            { timeout: WORKER_ACTIVATION_TIMEOUT_MS }
          )
          .toBe(true);
      phase = 'root-reload';
      await s.page.reload();
      if (serviceWorkers === 'allow')
        await expect
          .poll(() => s.page.evaluate(() => !!navigator.serviceWorker.controller))
          .toBe(true);
      for (const path of paths) {
        phase = path;
        const response = await s.page.goto(`${BASE}${path}`);
        if (settled) {
          if (path === '/')
            await s.page
              .locator('html[data-drawing-live][data-controls-live]')
              .waitFor({ state: 'attached' });
          else await expect.poll(() => s.page.evaluate(() => document.fonts.status)).toBe('loaded');
          await new Promise((resolve) => setTimeout(resolve, LATE_ERROR_WINDOW_MS));
        }
        const observed = await s.page.evaluate(() => ({
          title: document.title,
          heading: [...document.querySelectorAll('h1')]
            .filter((e) => e.checkVisibility())
            .map((e) => e.textContent),
          controller: navigator.serviceWorker.controller?.scriptURL ?? null,
          root: document.getElementById('root')?.innerHTML.slice(0, 800),
          theme: document.documentElement.getAttribute('data-theme'),
        }));
        row.observations.push({
          path,
          status: response.status(),
          fromWorker: response.fromServiceWorker(),
          ...observed,
        });
        if (settled || events.some((e) => e.phase === phase && e.type === 'pageerror'))
          await s.page.screenshot({
            path: `${evidence}/worker-diagnostic/${ENGINE}-${id}-${path.replaceAll(/[^a-z0-9]/gi, '_')}.png`,
          });
      }
      row.errors = s.errors;
      row.external = s.external;
      row.pass = s.errors.length === 0 && s.external.length === 0;
      writeFileSync(
        `${evidence}/worker-diagnostic/${ENGINE}-${id}-final.aria.txt`,
        await s.page.locator('body').ariaSnapshot()
      );
    } catch (error) {
      row.error = String(error.stack);
      row.pass = false;
    } finally {
      await s.ctx.close();
      appendFileSync(`${evidence}/worker-diagnostic.jsonl`, JSON.stringify(row) + '\n');
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await browser.close();
}
