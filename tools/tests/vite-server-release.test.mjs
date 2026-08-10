import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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

// Its own port. The suite runs in parallel with the rest of tests/ and vite is
// spawned --strictPort, so sharing one with another script would read as a
// release regression.
const PORT = 5197;
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

const deniedUrl = `http://localhost:${PORT}/@fs${join(repoRoot, 'package.json')}`;

// Boot a server the way --keep does, wait until it answers, report its pid,
// release it, and exit. RELEASABLE_STDIO rather than a copy of its value, so
// this is a guard on the stdio the driver actually ships. The caller's own
// stdio is piped — the shape of every agent Bash call and CI log capture, and
// the one a released server must not be able to hold open.
const releasingCaller = `
  import { RELEASABLE_STDIO, spawnViteServer } from ${JSON.stringify(viteServerUrl)};
  const { server, release } = spawnViteServer(${PORT}, RELEASABLE_STDIO);
  const deadline = Date.now() + ${READY_TIMEOUT_MS};
  for (;;) {
    try {
      await fetch('http://localhost:${PORT}/', { method: 'HEAD' });
      break;
    } catch {}
    if (Date.now() > deadline) throw new Error('vite never listened on ${PORT}');
    await new Promise((resolve) => setTimeout(resolve, ${READY_POLL_MS}));
  }
  process.stdout.write(String(server.pid));
  release();
`;

let releasedPid = 0;

/** Resolves only once the caller has exited *and* its stdio has reached EOF. */
function runReleasingCaller() {
  return new Promise((resolve, reject) => {
    const caller = spawn(process.execPath, ['--input-type=module', '-e', releasingCaller], {
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
const requestDenied = async () => {
  try {
    const response = await fetch(deniedUrl);
    await response.arrayBuffer();
    return response.status;
  } catch (error) {
    return `unreachable (${error.cause?.code ?? error.message})`;
  }
};

afterAll(() => {
  if (!releasedPid) return;
  try {
    process.kill(-releasedPid, 'SIGTERM');
  } catch {
    // already gone, which several of these cases are asserting
  }
});

describe('a released vite server', () => {
  it(
    'outlives its caller and keeps serving through its own diagnostics',
    async () => {
      const pid = await runReleasingCaller();
      expect(pid).toBeGreaterThan(0);
      expect(isAlive(pid)).toBe(true);

      const duringDiagnostics = [];
      for (let request = 0; request < DIAGNOSTIC_REQUESTS; request++) {
        duringDiagnostics.push(await requestDenied());
      }
      expect(duringDiagnostics).toEqual(Array(DIAGNOSTIC_REQUESTS).fill(403));

      await sleep(EPIPE_SETTLE_MS);
      expect(isAlive(pid)).toBe(true);
      expect(await requestDenied()).toBe(403);
    },
    CALLER_EXIT_TIMEOUT_MS + READY_TIMEOUT_MS
  );
});
