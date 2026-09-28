import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';
import {
  foreignPortListeners,
  freePort,
  portListenerOwners,
  portListenerPids,
  waitForPortRelease,
} from '../lib/vite-server.mjs';

const LISTEN_ON_ANY_PORT =
  'require("http").createServer((q,r)=>r.end("x")).listen(0,"127.0.0.1",function(){console.log(this.address().port)})';

async function listenFrom(cwd) {
  const child = spawn(process.execPath, ['-e', LISTEN_ON_ANY_PORT], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const port = await new Promise((resolve) => {
    child.stdout.on('data', (chunk) => resolve(Number(String(chunk).trim())));
  });
  return { child, port };
}

// The same listener command twice: once from somewhere that is deliberately not
// this checkout, once from this checkout's root.
const foreignRoot = mkdtempSync(join(tmpdir(), 'splotch-foreign-'));
const foreign = await listenFrom(foreignRoot);
const owned = await listenFrom(ROOT);

afterAll(() => {
  foreign.child.kill();
  owned.child.kill();
});

describe('foreignPortListeners', () => {
  it('identifies a listener owned by another checkout', () => {
    expect(foreignPortListeners(foreign.port, ROOT)).toContain(foreign.child.pid);
  });

  it('does not claim a listener owned by this checkout', () => {
    expect(foreignPortListeners(foreign.port, foreignRoot)).not.toContain(foreign.child.pid);
  });

  it('distinguishes identical listener commands by checkout cwd', () => {
    expect(portListenerOwners(owned.port, ROOT)).toContainEqual({
      pid: owned.child.pid,
      cwd: realpathSync(ROOT),
      owned: true,
    });
    expect(portListenerOwners(foreign.port, ROOT)).toContainEqual({
      pid: foreign.child.pid,
      cwd: realpathSync(foreignRoot),
      owned: false,
    });
  });
});

describe('freePort', () => {
  // The regression this covers: a caller that reached freePort() without a
  // separate ownership pre-check SIGTERMed another worktree's preview server
  // before anything could report which build it was serving. The refusal lives
  // in freePort so that no caller can forget it.
  it('refuses a listener owned by another checkout and leaves it running', () => {
    expect(() => freePort(foreign.port)).toThrow(
      `port ${foreign.port} is held by a listener outside this checkout (pid ${foreign.child.pid})`
    );

    expect(foreign.child.killed).toBe(false);
    expect(portListenerPids(foreign.port)).toContain(foreign.child.pid);
  });

  it("stops this checkout's own listener", async () => {
    freePort(owned.port);
    await waitForPortRelease(owned.port);

    expect(portListenerPids(owned.port)).not.toContain(owned.child.pid);
  });
});
