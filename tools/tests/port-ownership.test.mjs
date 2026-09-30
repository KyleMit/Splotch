import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, onTestFinished } from 'vitest';
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

// Every test spawns the listeners it inspects, because freePort stops one: a
// listener shared across tests is gone for whichever test runs after that.
async function listenFrom(cwd, script = LISTEN_ON_ANY_PORT) {
  const child = spawn(process.execPath, ['-e', script], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  onTestFinished(() => child.kill());
  const port = await firstPrintedPort(child);
  return { child, port };
}

// A listener that dies before printing its port would otherwise leave the test
// waiting out its timeout with no reason; reject with what the child reported.
function firstPrintedPort(child) {
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) =>
      reject(
        new Error(
          `listener exited before printing a port (code ${code}, signal ${signal}): ${stderr.trim()}`
        )
      )
    );
    child.stdout.once('data', (chunk) => {
      const line = String(chunk).trim();
      if (/^[1-9]\d*$/.test(line)) resolve(Number(line));
      else reject(new Error(`listener printed ${JSON.stringify(line)} instead of a port`));
    });
  });
}

// The same listener command from two places: somewhere that is deliberately not
// this checkout, and this checkout's root.
const foreignRoot = mkdtempSync(join(tmpdir(), 'splotch-foreign-'));

afterAll(() => rmSync(foreignRoot, { recursive: true, force: true }));

describe('listenFrom', () => {
  it('rejects with the exit code when the listener exits before printing a port', async () => {
    await expect(
      listenFrom(foreignRoot, 'console.error("cannot bind");process.exit(3)')
    ).rejects.toThrow('listener exited before printing a port (code 3, signal null): cannot bind');
  });

  it('rejects a printed line that is not a port', async () => {
    await expect(listenFrom(foreignRoot, 'console.log("ready")')).rejects.toThrow(
      'listener printed "ready" instead of a port'
    );
  });
});

describe('foreignPortListeners', () => {
  it('identifies a listener owned by another checkout', async () => {
    const foreign = await listenFrom(foreignRoot);

    expect(foreignPortListeners(foreign.port, ROOT)).toContain(foreign.child.pid);
  });

  it('does not claim a listener owned by this checkout', async () => {
    const foreign = await listenFrom(foreignRoot);

    expect(foreignPortListeners(foreign.port, foreignRoot)).not.toContain(foreign.child.pid);
  });

  it('distinguishes identical listener commands by checkout cwd', async () => {
    const [owned, foreign] = await Promise.all([listenFrom(ROOT), listenFrom(foreignRoot)]);

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
  it('refuses a listener owned by another checkout and leaves it running', async () => {
    const foreign = await listenFrom(foreignRoot);

    expect(() => freePort(foreign.port)).toThrow(
      `port ${foreign.port} is held by a listener outside this checkout (pid ${foreign.child.pid})`
    );

    expect(foreign.child.killed).toBe(false);
    expect(portListenerPids(foreign.port)).toContain(foreign.child.pid);
  });

  it("stops this checkout's own listener", async () => {
    const owned = await listenFrom(ROOT);

    freePort(owned.port);
    await waitForPortRelease(owned.port);

    expect(portListenerPids(owned.port)).not.toContain(owned.child.pid);
  });
});
