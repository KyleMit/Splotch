import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { portListenerOwners, portListenerPids, spawnViteServer } from '../../lib/vite-server.mjs';
import { ensureDevServer } from '../lib/app-driver.mjs';

// The spawn is faked: what is under test is which port this checkout's own
// server lands on, not vite booting. Ownership is read from real listeners.
vi.mock('../../lib/vite-server.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    portListenerOwners: vi.fn(actual.portListenerOwners),
    spawnViteServer: vi.fn(() => ({ stop: vi.fn() })),
  };
});
vi.mock('../../lib/net.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  waitForUrl: vi.fn(async () => {}),
}));

const LISTEN_ON_ANY_PORT =
  'require("http").createServer((q,r)=>r.end("x")).listen(0,"127.0.0.1",function(){console.log(this.address().port)})';

async function listenFrom(cwd) {
  const child = spawn(process.execPath, ['-e', LISTEN_ON_ANY_PORT], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  onTestFinished(() => child.kill());
  const port = await new Promise((resolve) => {
    child.stdout.on('data', (chunk) => resolve(Number(String(chunk).trim())));
  });
  return { child, port };
}

function closedPort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const foreignRoot = mkdtempSync(join(tmpdir(), 'splotch-foreign-'));

afterAll(() => rmSync(foreignRoot, { recursive: true, force: true }));

beforeEach(() => {
  spawnViteServer.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
});

const servedPort = (base) => Number(new URL(base).port);

describe('ensureDevServer', () => {
  it("serves this checkout's build on another port when another checkout holds the requested one", async () => {
    const foreign = await listenFrom(foreignRoot);

    const { base } = await ensureDevServer(foreign.port);

    expect(servedPort(base)).not.toBe(foreign.port);
    expect(spawnViteServer).toHaveBeenCalledExactlyOnceWith(servedPort(base));
    expect(foreign.child.killed).toBe(false);
    expect(portListenerPids(foreign.port)).toContain(foreign.child.pid);
  });

  it('reuses a server this checkout owns without stopping it on stop()', async () => {
    const owned = await listenFrom(ROOT);

    const { base, stop } = await ensureDevServer(owned.port);
    stop();

    expect(base).toBe(`http://localhost:${owned.port}/`);
    expect(spawnViteServer).not.toHaveBeenCalled();
    expect(portListenerPids(owned.port)).toContain(owned.child.pid);
  });

  // lsof missing, or a listener it cannot see: an answer nobody can attribute is
  // treated like a stranger's.
  it('moves off a port that answers from a listener lsof cannot attribute', async () => {
    const unattributed = await listenFrom(ROOT);
    portListenerOwners.mockReturnValueOnce([]);

    const { base } = await ensureDevServer(unattributed.port);

    expect(servedPort(base)).not.toBe(unattributed.port);
    expect(spawnViteServer).toHaveBeenCalledExactlyOnceWith(servedPort(base));
  });

  it('starts on the requested port when nothing holds it', async () => {
    const port = await closedPort();

    const { base } = await ensureDevServer(port);

    expect(base).toBe(`http://localhost:${port}/`);
    expect(spawnViteServer).toHaveBeenCalledExactlyOnceWith(port);
  });
});
