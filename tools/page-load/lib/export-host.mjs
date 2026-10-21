// Starts the host the page-load gate measures: the React Native web export served as the Netlify
// deploy serves it (tools/page-load/serve-export.mjs), in a process of its own. The runner drives
// Lighthouse with a blocking spawn, which would stall a server in the runner's own process.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { ROOT, fail } from '../../lib/proc.mjs';

export const EXPORT_HOST_READY_PREFIX = '[page-load] serving the export at ';
export const EXPORT_HOST_STOP_FLAG = 'stop-when-stdin-closes';
const SERVE_SCRIPT = join(ROOT, 'tools/page-load/serve-export.mjs');
// e2e/playwright.config.ts starts the same TypeScript host with the same flags.
const NODE_TYPESCRIPT_FLAGS = [
  '--experimental-strip-types',
  '--disable-warning=ExperimentalWarning',
];
const HOST_START_TIMEOUT_MS = 60_000;
const SHUTDOWN_GRACE_MS = 5_000;
// Every file the document names under the folder Expo gives its hashed bundles and styles.
const EXPORT_ASSET_URL = /\/_expo\/static\/[A-Za-z0-9_./-]+/g;

export const exportAssetUrls = (html) => [...new Set(html.match(EXPORT_ASSET_URL) ?? [])];

// Exported for the tests, which hand it a stand-in child instead of starting a real host.
export function whenReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(
      () => settle(reject, new Error(`the export host was not ready within ${timeoutMs}ms`)),
      timeoutMs
    );
    const onExit = (code, signal) =>
      settle(
        reject,
        new Error(
          `the export host exited (${signal ?? `code ${code}`}) before it was ready; ` +
            'its output is above. A port already in use is the usual cause: pick a free one.'
        )
      );
    function settle(outcome, value) {
      clearTimeout(timer);
      child.off('exit', onExit);
      lines.close();
      outcome(value);
    }
    child.once('exit', onExit);
    lines.on('line', (line) => {
      if (line.startsWith(EXPORT_HOST_READY_PREFIX)) settle(resolve);
    });
  });
}

function stopper(child) {
  return () =>
    new Promise((stopped) => {
      if (child.exitCode !== null || child.signalCode !== null) return stopped();
      const forced = setTimeout(() => child.kill('SIGKILL'), SHUTDOWN_GRACE_MS);
      child.once('exit', () => {
        clearTimeout(forced);
        stopped();
      });
      child.kill('SIGTERM');
    });
}

// A document that 404s, or one naming a bundle the host cannot serve, would be timed as the
// not-found page or as markup that never starts: a plausible number for the wrong page.
async function assertExportServes(base) {
  const document = await fetch(base);
  if (!document.ok) fail(`${base} answered ${document.status}: no export is published there`);
  for (const url of exportAssetUrls(await document.text())) {
    const asset = await fetch(new URL(url, base));
    if (!asset.ok) {
      fail(
        `${base} names ${url}, which answered ${asset.status}: the export on disk is incomplete ` +
          'or from another build. Rebuild it with npm run build:site.'
      );
    }
  }
}

/** Resolves to `{ base, stop }` once the host answers; `stop` resolves once it has exited. */
export async function startExportHost(port) {
  const child = spawn(
    process.execPath,
    [...NODE_TYPESCRIPT_FLAGS, SERVE_SCRIPT, '--port', String(port), `--${EXPORT_HOST_STOP_FLAG}`],
    // The held-open stdin is how the host learns its runner is gone, whatever way it went.
    { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] }
  );
  const stop = stopper(child);
  try {
    await whenReady(child, HOST_START_TIMEOUT_MS);
    child.stdout.resume();
    const base = `http://127.0.0.1:${port}/`;
    await assertExportServes(base);
    return { base, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
