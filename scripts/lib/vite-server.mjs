// Lifecycle for the throwaway vite servers the smoke and perf scripts boot.
//
// vite parents helper processes (esbuild), and wrapper spawns (`npx vite`)
// would add another layer — so a plain child.kill() can orphan the process
// that actually holds the port. spawnViteServer() therefore runs vite's bin
// directly with node (no npx/shell wrapper) in a detached process group, and
// stop() kills the whole group.

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './proc.mjs';

// Best-effort: kill whatever is listening on `port` so strictPort doesn't fail
// and we never reuse a stale server from a previous run.
export function freePort(port) {
  const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (out.error) {
    console.warn(
      `Unable to check or clear port ${port} automatically because lsof could not be launched. If the port is in use, stop its listener before retrying.`
    );
    return;
  }
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

export function spawnViteServer(
  port,
  { env = {}, command = 'dev', stdout = 'ignore', stderr = 'inherit' } = {}
) {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [vite, command, '--port', String(port), '--strictPort'], {
    cwd: join(ROOT, 'web'),
    env: { ...process.env, ...env },
    stdio: ['ignore', stdout, stderr],
    detached: true,
  });

  const kill = () => {
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
  const onInterrupt = () => {
    kill();
    process.exit(1);
  };

  // stop() and release() drop their own safety-net listeners, so a caller that
  // boots one server per iteration (scripts/e2e-sweep.mjs) doesn't accumulate a
  // listener and a captured child per rep — Node starts warning about the leak
  // at eleven.
  const dropSafetyNets = () => {
    process.off('exit', kill);
    process.off('SIGINT', onInterrupt);
  };
  const stop = () => {
    dropSafetyNets();
    kill();
  };

  // release() hands the detached group over to the OS: the exit/SIGINT nets come
  // off, the pipes this process holds are dropped, and the child is unref'd, so
  // this process can exit while vite keeps serving (the run-splotch driver's
  // --keep). Both pipes must go: each is a handle that keeps the event loop alive
  // after the child is unref'd, which is what makes a hand-rolled server hang on
  // exit in the first place. An 'inherit' stream cannot be dropped here — the
  // child holds a dup of this process's own fd, so a released vite pins the
  // caller's stderr pipe open (an agent's Bash call, `2>&1 | tee`, a CI log
  // collector) and the reader never sees EOF. A caller that releases therefore
  // spawns every stream it does not want held as 'pipe' or 'ignore'.
  const release = () => {
    dropSafetyNets();
    server.stdout?.destroy();
    server.stderr?.destroy();
    server.unref();
  };
  process.on('exit', kill);
  process.on('SIGINT', onInterrupt);

  return { server, stop, release };
}
