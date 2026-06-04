import { chromium } from '@playwright/test';

// Warm Vite's dep optimizer once before the parallel workers run.
//
// On a cold dev server the first load of each route triggers dep optimization,
// during which in-flight module requests 504 ("Outdated Optimize Dep") and the
// page transiently errors before Vite auto-reloads it. With the suite's workers
// all hitting that at once it's a reload storm that flakes tests whose
// interactions can't ride it out (e.g. the ai-timer click-retry). Loading each
// route here — sequentially, polling through the auto-reload until it actually
// settles — means every worker afterwards gets an already-optimized server.
export default async function globalSetup(config) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // [route, readiness predicate run in the page].
  const routes = [
    ['/', () => !!document.getElementById('drawingCanvas')],
    ['/dev/engine', () => window.__engineReady === true],
    ['/dev/ai-timer', () => document.querySelectorAll('button').length > 0]
  ];
  const deadline = Date.now() + 180_000;

  try {
    for (const [route, ready] of routes) {
      let lastNav = 0;
      for (;;) {
        // Navigate once, then poll. Re-navigate only every 15s as insurance —
        // polling (not re-loading) is what lets us ride Vite's auto-reload to a
        // settled page instead of perpetually interrupting it.
        if (Date.now() - lastNav > 15_000) {
          await page.goto(baseURL + route, { waitUntil: 'commit', timeout: 60_000 }).catch(() => {});
          lastNav = Date.now();
        }
        const ok = await page.evaluate(ready).catch(() => false);
        if (ok) break;
        if (Date.now() > deadline) throw new Error(`globalSetup: ${route} never became ready`);
        await page.waitForTimeout(500);
      }
    }

    // Settle gate: Vite can report a route ready a beat before the optimizer has
    // fully quiesced, so the first worker wave still catches one last reload.
    // Require the heaviest route to hold ready continuously (any reload resets
    // the streak) so workers only start once optimization has truly stopped.
    await page.goto(baseURL + '/dev/engine', { waitUntil: 'commit', timeout: 60_000 }).catch(() => {});
    let streakStart = Date.now();
    for (;;) {
      const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
      if (!ready) {
        streakStart = Date.now(); // a reload broke the streak — start over
        await page.goto(baseURL + '/dev/engine', { waitUntil: 'commit', timeout: 60_000 }).catch(() => {});
      } else if (Date.now() - streakStart >= 3_000) {
        break;
      }
      if (Date.now() > deadline) throw new Error('globalSetup: server never stabilized');
      await page.waitForTimeout(500);
    }
  } finally {
    await browser.close();
  }
}
