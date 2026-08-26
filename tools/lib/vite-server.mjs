// Lifecycle for the throwaway vite servers the smoke and perf scripts boot.
//
// vite parents helper processes (esbuild), and wrapper spawns (`npx vite`)
// would add another layer — so a plain child.kill() can orphan the process
// that actually holds the port. spawnViteServer() therefore runs vite's bin
// directly with node (no npx/shell wrapper) in a detached process group, and
// stop() kills the whole group.

import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './proc.mjs';

const PORT_RELEASE_TIMEOUT_MS = 5_000;
const PORT_RELEASE_POLL_INTERVAL_MS = 50;

// Best-effort: kill whatever is listening on `port` so strictPort doesn't fail
// and we never reuse a stale server from a previous run.
export function portListenerPids(port) {
  const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (out.error) return [];
  return (out.stdout || '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

// A listener's working directory is what identifies which checkout owns it. Two
// worktrees of this repo are different owners even though both are "Splotch".
export function listenerWorkingDirectory(pid) {
  const out = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
  });
  if (out.error) return null;
  const line = (out.stdout || '').split('\n').find((entry) => entry.startsWith('n'));
  return line ? line.slice(1) : null;
}

export function portListenerOwners(port, root) {
  const resolvedRoot = realPath(root);
  return portListenerPids(port).map((pid) => {
    const cwd = listenerWorkingDirectory(pid);
    const resolvedCwd = cwd ? realPath(cwd) : null;
    return {
      pid,
      cwd: resolvedCwd,
      owned:
        resolvedCwd !== null &&
        (resolvedCwd === resolvedRoot || resolvedCwd.startsWith(`${resolvedRoot}/`)),
    };
  });
}

// Listeners on this port that belong to some OTHER checkout. freePort() SIGTERMs
// every listener it finds, which is right for this session's own leftovers and
// wrong for anyone else's — it killed another worktree's preview server before the
// build-identity assertion could even report which build it was serving, while the
// error text told the reader to pick a free port instead of stopping it.
//
// A listener whose working directory cannot be read counts as foreign: refusing to
// start is recoverable, and killing something unidentified is not.
export function foreignPortListeners(port, root) {
  return portListenerOwners(port, root)
    .filter((listener) => !listener.owned)
    .map((listener) => listener.pid);
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

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

export async function waitForPortRelease(port) {
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  for (;;) {
    const pids = portListenerPids(port);
    if (pids.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `port ${port} is still held by pid ${pids.join(', ')} after ${PORT_RELEASE_TIMEOUT_MS}ms`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_RELEASE_POLL_INTERVAL_MS));
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
