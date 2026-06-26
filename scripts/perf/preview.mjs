// Build the production web bundle (with the engine PERF_MARKS baked in, since
// PERF_MARKS=true is inherited from the npm script's env) and serve it with
// `vite preview`, so the harness profiles the minified bundle that actually
// ships — not the unminified dev server. Returns { base, stop }.
//
// `vite preview` runs as a grandchild of this process (web.mjs → vite), so a
// plain child.kill() orphans it and leaks the port. We spawn a detached process
// group and kill the whole group on stop, and free the port up front, so every
// run serves the build it just produced (never a stale leftover server).

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, run, sleep, isWindows } from '../lib/utils.mjs';

const isUp = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

// Best-effort: kill whatever is listening on `port` so strictPort doesn't fail
// and we never reuse a stale server from a previous run.
function freePort(port) {
  if (isWindows) {
    spawnSync(
      'cmd',
      [
        '/c',
        `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`,
      ],
      { stdio: 'ignore' }
    );
    return;
  }
  const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  for (const pid of (out.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {}
  }
}

export async function buildAndPreview(port, { build = true, timeout = 90_000 } = {}) {
  if (build) {
    console.log('Building production bundle (PERF_MARKS=%s)…', process.env.PERF_MARKS ?? 'unset');
    run('npm', ['run', 'build']);
  }

  freePort(port);
  await sleep(500);

  const base = `http://localhost:${port}/`;
  console.log('Starting preview server…');
  const web = join(ROOT, 'scripts', 'web.mjs');
  const server = spawn(
    process.execPath,
    [web, 'vite', 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', detached: !isWindows }
  );

  const stop = () => {
    try {
      if (isWindows)
        spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-server.pid, 'SIGTERM');
    } catch {
      try {
        server.kill();
      } catch {}
    }
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
