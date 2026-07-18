// Lifecycle for the throwaway vite servers the smoke and perf scripts boot.
//
// vite parents helper processes (esbuild), and wrapper spawns (`npx vite`)
// would add another layer — so a plain child.kill() can orphan the process
// that actually holds the port. spawnViteServer() therefore runs vite's bin
// directly with node (no npx/shell wrapper) in a detached process group, and
// stop() kills the whole group.

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './utils.mjs';

// Best-effort: kill whatever is listening on `port` so strictPort doesn't fail
// and we never reuse a stale server from a previous run.
export function freePort(port) {
  const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  for (const pid of (out.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

export function spawnViteServer(port, env = {}, command = 'dev') {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [vite, command, '--port', String(port), '--strictPort'], {
    cwd: join(ROOT, 'web'),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });

  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      try {
        server.kill();
      } catch {
        // already gone
      }
    }
  };
  process.on('exit', stop);
  process.on('SIGINT', () => {
    stop();
    process.exit(1);
  });

  return { server, stop };
}
