import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, onTestFinished } from 'vitest';

// Real descriptors, a detached child and a caller whose own pipes must reach EOF are required to
// expose inherited-pipe hangs and EPIPE after release. The fixture logs on both streams for every
// request, so repeated requests still exercise the exact production stop/release lifecycle.

const repoRoot = join(import.meta.dirname, '..', '..');
const siteServerUrl = pathToFileURL(join(repoRoot, 'tools', 'lib', 'site-server.mjs')).href;

const READY_TIMEOUT_MS = 10_000;
const READY_POLL_MS = 250;
const CALLER_EXIT_TIMEOUT_MS = 20_000;
// One post-release write survives even when the wiring is broken — a destroyed
// socketpair end answers the first write with a RST and only the second one
// raises EPIPE — so a single diagnostic would let the defect pass.
const DIAGNOSTIC_REQUESTS = 5;
const EPIPE_SETTLE_MS = 1_000;

const diagnosticUrl = (port) => `http://127.0.0.1:${port}/diagnostic`;
const LOGGING_SERVER = `require('http').createServer((_request, response) => { console.log('request'); console.error('diagnostic'); response.writeHead(403).end(); }).listen(Number(process.argv[1]), '127.0.0.1');`;

// A port the OS assigns to this run. A fixed one is shared by every checkout
// running this suite at the same moment — parallel agent lanes start
// test:browserless seconds apart — and the child binds strictly, so the
// later server exits on the taken port while its caller hears the earlier one
// answer: a released server that looks dead on arrival. The ephemeral range
// also sits outside the ports sessions pick by hand.
function unusedPort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Boot a server the way --keep does, wait until it answers, report its pid,
// release it, and exit. RELEASABLE_STDIO rather than a copy of its value, so
// this is a guard on the stdio the driver actually ships. The caller's own
// stdio is piped — the shape of every agent Bash call and CI log capture, and
// the one a released server must not be able to hold open.
//
// An answer on the port does not say who gave it: another process can hold the
// port, and a child that lost the bind exits only once its config
// has loaded, while the holder answers at once. So readiness also needs lsof to
// name the spawned pid as the port's listener, and anything else (lsof missing
// included) fails as a port conflict rather than as a release regression.
const releasingCaller = (port) => `
  import { RELEASABLE_STDIO, portListenerPids, spawnOwnedProcess } from ${JSON.stringify(siteServerUrl)};
  const { server, release } = spawnOwnedProcess(process.execPath, ['-e', ${JSON.stringify(LOGGING_SERVER)}, String(${port})], RELEASABLE_STDIO);
  const deadline = Date.now() + ${READY_TIMEOUT_MS};
  for (;;) {
    try {
      await fetch('http://127.0.0.1:${port}/', { method: 'HEAD' });
      break;
    } catch {}
    if (Date.now() > deadline) throw new Error('owned server never listened on ${port}');
    await new Promise((resolve) => setTimeout(resolve, ${READY_POLL_MS}));
  }
  const listeners = portListenerPids(${port});
  if (!listeners.includes(server.pid)) {
    throw new Error(
      'port ${port} answered, but not from the owned server this caller started (pid ' +
        server.pid + '; listening: ' + (listeners.join(', ') || 'none lsof could name') + ')'
    );
  }
  process.stdout.write(String(server.pid));
  release();
`;

function stopReleasedGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // already gone, which several of these cases are asserting
  }
}

/**
 * Resolves only once the caller has exited *and* its stdio has reached EOF. The
 * group it released is stopped when the calling case ends, so one case going
 * wrong cannot orphan the server another case released.
 */
function runReleasingCaller(port) {
  let releasedPid = 0;
  onTestFinished(() => stopReleasedGroup(releasedPid));
  return new Promise((resolve, reject) => {
    const caller = spawn(process.execPath, ['--input-type=module', '-e', releasingCaller(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    caller.stdout.on('data', (chunk) => {
      stdout += chunk;
      releasedPid = Number(stdout.trim()) || releasedPid;
    });
    caller.stderr.on('data', (chunk) => (stderr += chunk));

    const giveUp = setTimeout(() => {
      caller.kill('SIGKILL');
      caller.stdout.destroy();
      caller.stderr.destroy();
      reject(
        new Error(
          `the releasing caller's stdio never reached EOF in ${CALLER_EXIT_TIMEOUT_MS}ms — the released server is holding it open\n${stderr}`
        )
      );
    }, CALLER_EXIT_TIMEOUT_MS);

    caller.on('close', (code) => {
      clearTimeout(giveUp);
      if (code === 0) resolve(Number(stdout.trim()));
      else reject(new Error(`the releasing caller exited ${code}\n${stderr}`));
    });
  });
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The 403 status, or what went wrong reaching a server that should be serving. */
const requestDenied = async (port) => {
  try {
    const response = await fetch(diagnosticUrl(port));
    await response.arrayBuffer();
    return response.status;
  } catch (error) {
    return `unreachable (${error.cause?.code ?? error.message})`;
  }
};

describe('a released owned server', () => {
  it(
    'outlives its caller and keeps serving through its own diagnostics',
    async () => {
      const port = await unusedPort();
      const pid = await runReleasingCaller(port);
      expect(pid).toBeGreaterThan(0);
      expect(isAlive(pid)).toBe(true);

      const duringDiagnostics = [];
      for (let request = 0; request < DIAGNOSTIC_REQUESTS; request++) {
        duringDiagnostics.push(await requestDenied(port));
      }
      expect(duringDiagnostics).toEqual(Array(DIAGNOSTIC_REQUESTS).fill(403));

      await sleep(EPIPE_SETTLE_MS);
      expect(isAlive(pid)).toBe(true);
      expect(await requestDenied(port)).toBe(403);
    },
    CALLER_EXIT_TIMEOUT_MS + READY_TIMEOUT_MS
  );

  // The shape of two checkouts running this suite at once, pinned: a port that
  // answers from someone else is refused by name instead of released.
  it(
    'is never vouched for by an answer from another process on its port',
    async () => {
      const holder = createHttpServer((_request, response) => {
        response.statusCode = 403;
        response.end();
      });
      await new Promise((resolve, reject) => {
        holder.once('error', reject);
        holder.listen(0, '127.0.0.1', resolve);
      });
      onTestFinished(() => holder.close());

      const refusal = runReleasingCaller(holder.address().port);
      await expect(refusal).rejects.toThrow('not from the owned server this caller started');
      await expect(refusal).rejects.toThrow(`listening: ${process.pid})`);
    },
    CALLER_EXIT_TIMEOUT_MS + READY_TIMEOUT_MS
  );
});
