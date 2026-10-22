// Process ownership for the exported site host used by the run-splotch driver.

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './proc.mjs';

// lsof is the only witness to which process holds a port, so a listing it could
// not produce throws: read as an empty answer, it would report a held port free.
// lsof exits 1 both when nothing matches and when it fails outright; stderr is
// what tells the failure from the empty answer.
export function portListenerPids(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`lsof could not be launched to check port ${port}: ${result.error.message}`, {
      cause: result.error,
    });
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

// A stdio target the OS owns outright, so it stays writable after this process
// is gone: 'ignore' (/dev/null) or an already-open file descriptor. Everything
// else — 'pipe', 'inherit', a stream — is a handle borrowed from this process
// and dies with it, which is what release() cannot tolerate.
const isDurableSink = (stream) => stream === 'ignore' || Number.isInteger(stream);

// What a server destined for release() is spawned with: it logs nowhere, which
// is the price of outliving the process that started it. One export because the
// run-splotch driver's --keep and the live guard on a released server
// (tools/tests/site-server-release.test.mjs) have to be describing the same
// server for that guard to mean anything.
export const RELEASABLE_STDIO = { stdout: 'ignore', stderr: 'ignore' };

export function spawnSiteServer(port, options = {}) {
  return spawnOwnedProcess(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      join(ROOT, 'e2e', 'server', 'serve.ts'),
      '--port',
      String(port),
    ],
    options
  );
}

/** @public Used by the live stdio regression through its releasing subprocess. */
export function spawnOwnedProcess(command, args, { stdout = 'ignore', stderr = 'inherit' } = {}) {
  const server = spawn(command, args, {
    cwd: ROOT,
    env: process.env,
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
  // off and the child is unref'd, so this process can exit while the site keeps
  // serving (the run-splotch driver's --keep). A released server may hold no
  // stream of this process's on either fd, and the two ways of holding one fail
  // in opposite directions. 'inherit' gives the child a dup of our own fd, so
  // the survivor pins the caller's stderr pipe open (an agent's Bash call,
  // `2>&1 | tee`, a CI log collector) and the reader never sees EOF. 'pipe' is a
  // handle that keeps our event loop alive until it is destroyed, and destroying
  // it kills the survivor instead: the child's write to the half-closed
  // socketpair draws a RST and the next one dies of EPIPE. Only a durable sink survives
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
