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

// A stdio target the OS owns outright, so it stays writable after this process
// is gone: 'ignore' (/dev/null) or an already-open file descriptor. Everything
// else — 'pipe', 'inherit', a stream — is a handle borrowed from this process
// and dies with it, which is what release() cannot tolerate.
const isDurableSink = (stream) => stream === 'ignore' || Number.isInteger(stream);

// What a server destined for release() is spawned with: it logs nowhere, which
// is the price of outliving the process that started it. One export because the
// run-splotch driver's --keep and the live guard on a released server
// (tools/tests/vite-server-release.test.mjs) have to be describing the same
// server for that guard to mean anything.
export const RELEASABLE_STDIO = { stdout: 'ignore', stderr: 'ignore' };

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
  // boots one server per iteration doesn't accumulate a listener and a captured
  // child per rep — Node starts warning about the leak at eleven.
  const dropSafetyNets = () => {
    process.off('exit', kill);
    process.off('SIGINT', onInterrupt);
  };
  const stop = () => {
    dropSafetyNets();
    kill();
  };

  // release() hands the detached group over to the OS: the exit/SIGINT nets come
  // off and the child is unref'd, so this process can exit while vite keeps
  // serving (the run-splotch driver's --keep). A released server may hold no
  // stream of this process's on either fd, and the two ways of holding one fail
  // in opposite directions. 'inherit' gives the child a dup of our own fd, so
  // the survivor pins the caller's stderr pipe open (an agent's Bash call,
  // `2>&1 | tee`, a CI log collector) and the reader never sees EOF. 'pipe' is a
  // handle that keeps our event loop alive until it is destroyed, and destroying
  // it kills the survivor instead: the child's write to the half-closed
  // socketpair draws a RST and the next one dies of EPIPE — two vite log lines,
  // which one fs-allowlist 403 already produces. Only a durable sink survives
  // both, so release() refuses the rest rather than picking which way to break.
  const release = () => {
    if (!isDurableSink(stdout) || !isDurableSink(stderr)) {
      throw new Error(
        `release() needs a server spawned with durable stdio sinks, got stdout=${stdout} stderr=${stderr}: pass 'ignore' or a file descriptor on both streams.`
      );
    }
    dropSafetyNets();
    server.unref();
  };
  process.on('exit', kill);
  process.on('SIGINT', onInterrupt);

  return { server, stop, release };
}
