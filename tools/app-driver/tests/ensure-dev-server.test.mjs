import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { portListenerPids, spawnViteServer } from '../../lib/vite-server.mjs';
import { ensureDevServer } from '../lib/app-driver.mjs';

// Only the vite spawn is faked, by a plain HTTP server on the port it is handed:
// what is under test is which port this run serves on and whether the answer
// comes from the process it started. Readiness and listener lookup are real.
vi.mock('../../lib/vite-server.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  spawnViteServer: vi.fn(),
}));

// A real readiness wait on a local listener takes milliseconds; a run that picks
// an occupied port waits this long and fails instead of hanging for the default.
const READY_TIMEOUT_MS = 5_000;

const HTTP_ON_PORT =
  'require("http").createServer((q,r)=>r.end("x")).listen(Number(process.argv[1]),"localhost",function(){console.log(this.address().port)})';
const SILENT_TCP_ON_PORT =
  'require("net").createServer(()=>{}).listen(Number(process.argv[1]),"localhost",function(){console.log(this.address().port)})';

async function listenFrom(cwd, script, port = 0) {
  const child = spawn(process.execPath, ['-e', script, String(port)], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  onTestFinished(() => child.kill());
  const boundPort = await new Promise((resolve) => {
    child.stdout.on('data', (chunk) => resolve(Number(String(chunk).trim())));
  });
  return { child, port: boundPort };
}

function closedPort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, 'localhost', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const foreignRoot = mkdtempSync(join(tmpdir(), 'splotch-foreign-'));

afterAll(() => rmSync(foreignRoot, { recursive: true, force: true }));

// The spawned "vite": this checkout's own server on exactly the port handed to it.
function spawnsOwnServer() {
  spawnViteServer.mockImplementation((port) => {
    const child = spawn(process.execPath, ['-e', HTTP_ON_PORT, String(port)], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    onTestFinished(() => child.kill());
    return { server: child, stop: vi.fn(() => child.kill()) };
  });
}

beforeEach(() => {
  spawnViteServer.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
});

const servedPort = (base) => Number(new URL(base).port);

describe('ensureDevServer', () => {
  it('starts its own server on the requested port when nothing holds it', async () => {
    spawnsOwnServer();
    const port = await closedPort();

    const { base } = await ensureDevServer(port, READY_TIMEOUT_MS);

    expect(base).toBe(`http://localhost:${port}/`);
    expect(spawnViteServer).toHaveBeenCalledExactlyOnceWith(port);
  });

  it("moves off a port another checkout's server answers on and leaves that server running", async () => {
    spawnsOwnServer();
    const foreign = await listenFrom(foreignRoot, HTTP_ON_PORT);

    const { base } = await ensureDevServer(foreign.port, READY_TIMEOUT_MS);

    expect(servedPort(base)).not.toBe(foreign.port);
    expect(spawnViteServer).toHaveBeenCalledExactlyOnceWith(servedPort(base));
    expect(foreign.child.killed).toBe(false);
    expect(portListenerPids(foreign.port)).toContain(foreign.child.pid);
  });

  // A stale `vite preview` of this checkout answers from this checkout's cwd
  // while serving an old build.
  it('never reuses a server this checkout left running', async () => {
    spawnsOwnServer();
    const stale = await listenFrom(ROOT, HTTP_ON_PORT);

    const { base } = await ensureDevServer(stale.port, READY_TIMEOUT_MS);

    expect(servedPort(base)).not.toBe(stale.port);
    expect(spawnViteServer).toHaveBeenCalledExactlyOnceWith(servedPort(base));
    expect(portListenerPids(stale.port)).toContain(stale.child.pid);
  });

  it('moves off a port that is bound but not answering yet', async () => {
    spawnsOwnServer();
    const silent = await listenFrom(ROOT, SILENT_TCP_ON_PORT);

    const { base } = await ensureDevServer(silent.port, READY_TIMEOUT_MS);

    expect(servedPort(base)).not.toBe(silent.port);
  });

  // The race after the probe: another process binds the port first, vite's
  // --strictPort exits, and the answer comes from the other process.
  it('rejects an answer from a process other than the one it started', async () => {
    const stop = vi.fn();
    const port = await closedPort();
    const winners = [];
    spawnViteServer.mockImplementation(() => {
      winners.push(listenFrom(foreignRoot, HTTP_ON_PORT, port));
      return { server: { pid: process.pid, exitCode: null }, stop };
    });

    await expect(ensureDevServer(port, READY_TIMEOUT_MS)).rejects.toThrow(
      `port ${port} is not served by the dev server this run started (pid ${process.pid}`
    );
    expect(stop).toHaveBeenCalledOnce();
    await Promise.all(winners);
  });
});
