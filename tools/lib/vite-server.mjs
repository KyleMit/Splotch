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

// The one listing failure freePort() tolerates: without lsof it cannot clear
// the port, and the strictPort start that follows still refuses a held one.
class LsofUnavailableError extends Error {}

// lsof is the only witness to which process holds a port, so a listing it could
// not produce throws: read as an empty answer, it would report a held port free.
// lsof exits 1 both when nothing matches and when it fails outright; stderr is
// what tells the failure from the empty answer.
export function portListenerPids(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (result.error) {
    throw new LsofUnavailableError(
      `lsof could not be launched to check port ${port}: ${result.error.message}`,
      { cause: result.error }
    );
  }
  if (result.signal) {
    throw new Error(`lsof was terminated by ${result.signal} while checking port ${port}.`);
  }
  const pids = (result.stdout || '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  if (result.status !== 0 && !pids.length && result.stderr?.trim()) {
    throw new Error(`lsof failed while checking port ${port}: ${result.stderr.trim()}`);
  }
  return pids;
}

// A listener's working directory is what identifies which checkout owns it. Two
// worktrees of this repo are different owners even though both are "Splotch".
function listenerWorkingDirectory(pid) {
  const out = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
  });
  if (out.error) return null;
  const line = (out.stdout || '').split('\n').find((entry) => entry.startsWith('n'));
  return line ? line.slice(1) : null;
}

export function portListenerOwners(port, root) {
  return listenerOwners(portListenerPids(port), root);
}

function listenerOwners(pids, root) {
  const resolvedRoot = realPath(root);
  return pids.map((pid) => {
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

const foreignPids = (owners) =>
  owners.filter((listener) => !listener.owned).map((listener) => listener.pid);

// Listeners on this port that belong to some OTHER checkout. A listener whose
// working directory cannot be read counts as foreign: refusing to start is
// recoverable, and killing something unidentified is not. A test seam: the
// production callers read portListenerOwners() instead.
export function foreignPortListeners(port, root) {
  return foreignPids(portListenerOwners(port, root));
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// What freePort() throws for a listener outside this checkout, so a caller can
// tell that refusal from a port that would not clear.
export class ForeignListenerError extends Error {}

// Clears this checkout's own leftover server off `port` so strictPort doesn't
// fail and a run never reuses a stale server, resolving once the port is
// released. It throws rather than touch a listener from another checkout, and
// owns that refusal itself because a caller-side pre-check is one a new caller
// forgets: an unguarded call killed another worktree's preview server before
// anything could report which build it was serving.
//
// Ownership is decided on the same pid list the SIGTERMs go to, so a listener
// that appears between the check and the kill is never signalled unvetted.
export async function freePort(port) {
  let pids;
  try {
    pids = portListenerPids(port);
  } catch (error) {
    if (!(error instanceof LsofUnavailableError)) throw error;
    console.warn(
      `Unable to check or clear port ${port} automatically because lsof could not be launched. If the port is in use, stop its listener before retrying.`
    );
    return;
  }
  const foreign = foreignPids(listenerOwners(pids, ROOT));
  if (foreign.length) {
    throw new ForeignListenerError(
      `port ${port} is held by a listener outside this checkout (pid ${foreign.join(', ')}). ` +
        "Choose a free port — stopping it would take down another session's server."
    );
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  await waitForPortRelease(port);
}

async function waitForPortRelease(port) {
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
