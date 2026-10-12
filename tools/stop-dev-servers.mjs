import { parseArgs } from 'node:util';
import { ROOT, isMain, parseOrFail, runMain, sleep } from './lib/proc.mjs';
import { portListenerOwners, portListenerPids } from './lib/vite-server.mjs';

// The vite dev port and the netlify dev port — the drift guard
// (tools/tests/dev-ports.test.mjs) holds these to web/vite.config.ts and
// web/netlify.toml, which this plain-Node script cannot import.
const DEV_PORTS = [5173, 8888];
const PORT_TERM_GRACE_MS = 1_000;
const PORT_KILL_GRACE_MS = 1_000;
const PORT_RECHECK_INTERVAL_MS = 50;

// The listeners to signal, judged on the same listing that gets signalled. A
// listener outside this checkout (another worktree's server, an unrelated
// program, or one whose cwd cannot be read) refuses the run instead.
function ownedListenerPids(port) {
  const listeners = portListenerOwners(port, ROOT);
  const foreign = listeners.filter((listener) => !listener.owned);
  if (foreign.length) {
    const holders = foreign.map(({ pid, cwd }) => `pid ${pid} (cwd ${cwd ?? 'unreadable'})`);
    throw new Error(
      `Port ${port} is held by ${holders.join(', ')}, outside this checkout. ` +
        "dev:stop stops only this checkout's dev servers."
    );
  }
  return listeners.map((listener) => listener.pid);
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
    const pids = portListenerPids(port);
    if (!pids.length || Date.now() >= deadline) return pids;
    await sleep(PORT_RECHECK_INTERVAL_MS);
  }
}

// The `ports` parameter is a test seam — production always runs the DEV_PORTS default.
export async function killDevPorts(ports = DEV_PORTS) {
  // Every port is judged before any is signalled, so a refusal leaves all of them untouched.
  for (const pids of ports.map(ownedListenerPids)) signalEach(pids, 'SIGTERM');
  for (const port of ports) {
    if (!(await waitForPortToClear(port, PORT_TERM_GRACE_MS)).length) continue;
    signalEach(ownedListenerPids(port), 'SIGKILL');
    const pids = await waitForPortToClear(port, PORT_KILL_GRACE_MS);
    if (pids.length) {
      throw new Error(`Port ${port} is still in use after SIGKILL (pids ${pids.join(', ')}).`);
    }
  }
}

if (isMain(import.meta.url)) {
  parseOrFail(() => parseArgs({}));
  runMain(killDevPorts);
}
