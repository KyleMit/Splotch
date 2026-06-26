// Build the production web bundle (with the engine PERF_MARKS baked in, since
// PERF_MARKS=true is inherited from the npm script's env) and serve it with
// `vite preview`, so the harness profiles the minified bundle that actually
// ships — not the unminified dev server. Returns { base, stop } like
// app-driver's ensureDevServer.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, run, sleep } from '../lib/utils.mjs';

const isUp = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

export async function buildAndPreview(port, { build = true, timeout = 90_000 } = {}) {
  if (build) {
    console.log('Building production bundle (PERF_MARKS=%s)…', process.env.PERF_MARKS ?? 'unset');
    run('npm', ['run', 'build']);
  }

  const base = `http://localhost:${port}/`;
  if (await isUp(base)) {
    console.log(`Reusing preview server at ${base}`);
    return { base, stop: () => {} };
  }

  console.log('Starting preview server…');
  const web = join(ROOT, 'scripts', 'web.mjs');
  const server = spawn(
    process.execPath,
    [web, 'vite', 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' }
  );
  const stop = () => {
    try {
      server.kill();
    } catch {}
  };
  process.on('exit', stop);
  process.on('SIGINT', () => {
    stop();
    process.exit(1);
  });

  const deadline = Date.now() + timeout;
  while (!(await isUp(base))) {
    if (Date.now() > deadline) {
      stop();
      throw new Error(`Preview server at ${base} did not become ready within ${timeout}ms`);
    }
    await sleep(500);
  }
  console.log('Server ready.');
  return { base, stop };
}
