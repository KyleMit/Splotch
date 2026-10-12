import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, onTestFinished } from 'vitest';

// The half of release() a mocked child cannot reach: what the survivor and the
// caller do once the caller is gone. Both stdio hazards are invisible until
// then — an inherited stream leaves the caller's own pipe open so whatever ran
// it never sees EOF, and a piped stream release() had to drop kills the
// survivor on its next log line — so this boots a real vite, releases it from a
// real subprocess, and then makes vite log. Requesting a path outside
// `server.fs.allow` is the cheapest post-release write there is: vite answers
// 403 and reports the refusal through its logger, which is stderr.
//
// Live on purpose, and not gated: an assertion about a real process's fds has
// no offline form, and the failure it guards ships green under every mock.

const repoRoot = join(import.meta.dirname, '..', '..');
const viteServerUrl = pathToFileURL(join(repoRoot, 'tools', 'lib', 'vite-server.mjs')).href;

const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 250;
// Generous because a cold `vite dev` optimizes deps on its first boot, and this
// budget is also the hang detector: an inherited stream never trips an
// assertion, it just never ends.
const CALLER_EXIT_TIMEOUT_MS = 150_000;
// One post-release write survives even when the wiring is broken — a destroyed
// socketpair end answers the first write with a RST and only the second one
// raises EPIPE — so a single diagnostic would let the defect pass.
const DIAGNOSTIC_REQUESTS = 5;
const EPIPE_SETTLE_MS = 1_000;

const deniedUrl = (port) => `http://localhost:${port}/@fs${join(repoRoot, 'package.json')}`;

// A port the OS assigns to this run. A fixed one is shared by every checkout
// running this suite at the same moment — parallel agent lanes start
// test:browserless seconds apart — and vite is spawned --strictPort, so the
// later server exits on the taken port while its caller hears the earlier one
// answer: a released server that looks dead on arrival. The ephemeral range
// also sits outside the ports sessions pick by hand.
function unusedPort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, 'localhost', () => {
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
// port, and a --strictPort vite that lost the bind exits only once its config
// has loaded, while the holder answers at once. So readiness also needs lsof to
// name the spawned pid as the port's listener, and anything else (lsof missing
// included) fails as a port conflict rather than as a release regression.
const releasingCaller = (port) => `
  import { RELEASABLE_STDIO, portListenerPids, spawnViteServer } from ${JSON.stringify(viteServerUrl)};
  const { server, release } = spawnViteServer(${port}, RELEASABLE_STDIO);
  const deadline = Date.now() + ${READY_TIMEOUT_MS};
  for (;;) {
    try {
      await fetch('http://localhost:${port}/', { method: 'HEAD' });
      break;
    } catch {}
    if (Date.now() > deadline) throw new Error('vite never listened on ${port}');
    await new Promise((resolve) => setTimeout(resolve, ${READY_POLL_MS}));
  }
  const listeners = portListenerPids(${port});
  if (!listeners.includes(server.pid)) {
    throw new Error(
      'port ${port} answered, but not from the vite server this caller started (pid ' +
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
    const response = await fetch(deniedUrl(port));
    await response.arrayBuffer();
    return response.status;
  } catch (error) {
    return `unreachable (${error.cause?.code ?? error.message})`;
  }
};

describe('a released vite server', () => {
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
      await new Promise((resolve) => holder.listen(0, 'localhost', resolve));
      onTestFinished(() => holder.close());

      const refusal = runReleasingCaller(holder.address().port);
      await expect(refusal).rejects.toThrow('not from the vite server this caller started');
      await expect(refusal).rejects.toThrow(`listening: ${process.pid})`);
    },
    CALLER_EXIT_TIMEOUT_MS + READY_TIMEOUT_MS
  );
});
