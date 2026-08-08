import { chromium, type FullConfig } from '@playwright/test';
import { HARNESS_PROBE_CODE } from '../playwright.shared';

// Prove the server answering the port is the one this harness started.
//
// The production configs refuse server reuse and use Vite strictPort, so an
// occupied port fails before this hook. This probe remains defense in depth: a
// future harness change cannot silently run the report specs against a server
// loaded from a developer's real web/.env, the state that filed live issues
// from the /feedback spec (issue #646).
//
// The managed-code allowlist is declared by that same env, so asking whether a
// code only this harness sets is on it identifies the server in one request.
// /api/verify-access-code is exactly that question, and it charges its guess
// budget only on a failed code (ADR-0014) — so a match costs nothing, no spec
// uses the endpoint, and nothing is written either way.
// The whole value of the probe is the diagnosis it hands whoever hit it, so an
// unreachable port, a non-JSON body and the blind 429 the endpoint returns on a
// spent guess budget each report as themselves rather than as "wrong server".
async function assertHarnessServer(baseURL: string) {
  const outcome = await fetch(`${baseURL}/api/verify-access-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: HARNESS_PROBE_CODE }),
  }).catch((err: unknown) => err);
  const recognized =
    outcome instanceof Response && (await outcome.json().catch(() => null))?.ok === true;

  if (!recognized) {
    const answer = outcome instanceof Response ? `HTTP ${outcome.status}` : String(outcome);
    throw new Error(
      `globalSetup: whatever is serving ${baseURL} was not started by this run — it does not know ` +
        `the harness access code (it answered ${answer}), so it carries your web/.env rather than ` +
        "the suite's test credentials, and a report spec would file a real issue. Select another " +
        'unused SPLOTCH_E2E_PORT and rerun.'
    );
  }
}

// Warm Vite's dep optimizer once before the parallel workers run.
//
// On a cold dev server the first load of each route triggers dep optimization,
// during which in-flight module requests 504 ("Outdated Optimize Dep") and the
// page transiently errors before Vite auto-reloads it. With the suite's workers
// all hitting that at once it's a reload storm that flakes tests whose
// interactions can't ride it out (e.g. the ai-timer click-retry). Loading each
// route here — sequentially, polling through the auto-reload until it actually
// settles — means every worker afterwards gets an already-optimized server.
//
// The optimizer only exists under `vite dev` (DEV_SERVER=1). The default/CI run
// serves the production build via `vite preview`, which has no optimizer and no
// reload storm — so the ~6-8s warm-up is pure overhead there. Skip it.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? '';
  await assertHarnessServer(baseURL);

  if (!process.env.DEV_SERVER) return;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // [route, readiness predicate run in the page].
  const routes: [string, () => boolean][] = [
    ['/', () => !!document.getElementById('drawingCanvas')],
    ['/dev/engine', () => window.__engineReady === true],
    ['/dev/ai-timer', () => document.querySelectorAll('button').length > 0],
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
          await page
            .goto(baseURL + route, { waitUntil: 'commit', timeout: 60_000 })
            .catch(() => {});
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
    await page
      .goto(baseURL + '/dev/engine', { waitUntil: 'commit', timeout: 60_000 })
      .catch(() => {});
    let streakStart = Date.now();
    for (;;) {
      const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
      if (!ready) {
        streakStart = Date.now(); // a reload broke the streak — start over
        await page
          .goto(baseURL + '/dev/engine', { waitUntil: 'commit', timeout: 60_000 })
          .catch(() => {});
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
