import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { isMain, parseOrFail, runMain, sleep } from './lib/proc.mjs';

// The vite dev port and the netlify dev port — the drift guard
// (tools/tests/dev-ports.test.mjs) holds these to web/vite.config.ts and
// web/netlify.toml, which this plain-Node script cannot import.
const DEV_PORTS = [5173, 8888];
const PORT_TERM_GRACE_MS = 1_000;
const PORT_KILL_GRACE_MS = 1_000;
const PORT_RECHECK_INTERVAL_MS = 50;

function listenerPids(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`lsof was terminated by ${result.signal} while checking port ${port}.`);
  }
  const pids = (result.stdout || '')
    .split('\n')
    .map((pid) => pid.trim())
    .filter(Boolean)
    .map(Number);
  // lsof exits 1 both when no process matches and when it fails outright;
  // stderr output is what distinguishes an operational failure from the
  // normal empty result.
  if (result.status !== 0 && !pids.length && result.stderr?.trim()) {
    throw new Error(`lsof failed while checking port ${port}: ${result.stderr.trim()}`);
  }
  return pids;
}

function signalEach(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

async function waitForPortToClear(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pids = listenerPids(port);
    if (!pids.length || Date.now() >= deadline) return pids;
    await sleep(PORT_RECHECK_INTERVAL_MS);
  }
}

// The `ports` parameter is a test seam — production always runs the DEV_PORTS default.
export async function killDevPorts(ports = DEV_PORTS) {
  for (const port of ports) signalEach(listenerPids(port), 'SIGTERM');
  for (const port of ports) {
    let pids = await waitForPortToClear(port, PORT_TERM_GRACE_MS);
    if (!pids.length) continue;
    signalEach(pids, 'SIGKILL');
    pids = await waitForPortToClear(port, PORT_KILL_GRACE_MS);
    if (pids.length) {
      throw new Error(`Port ${port} is still in use after SIGKILL (pids ${pids.join(', ')}).`);
    }
  }
}

if (isMain(import.meta.url)) {
  parseOrFail(() => parseArgs({}));
  runMain(killDevPorts);
}
