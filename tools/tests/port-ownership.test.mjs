import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  foreignPortListeners,
  freePort,
  portListenerOwners,
  portListenerPids,
} from '../lib/vite-server.mjs';

// A listener started from somewhere that is deliberately not this checkout.
const foreignRoot = mkdtempSync(join(tmpdir(), 'splotch-foreign-'));
const child = spawn(
  process.execPath,
  [
    '-e',
    'require("http").createServer((q,r)=>r.end("x")).listen(0,"127.0.0.1",function(){console.log(this.address().port)})',
  ],
  { cwd: foreignRoot, stdio: ['ignore', 'pipe', 'ignore'] }
);
const port = await new Promise((resolve) => {
  child.stdout.on('data', (chunk) => resolve(Number(String(chunk).trim())));
});

const ownedChild = spawn(
  process.execPath,
  [
    '-e',
    'require("http").createServer((q,r)=>r.end("x")).listen(0,"127.0.0.1",function(){console.log(this.address().port)})',
  ],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }
);
const ownedPort = await new Promise((resolve) => {
  ownedChild.stdout.on('data', (chunk) => resolve(Number(String(chunk).trim())));
});

afterAll(() => {
  child.kill();
  ownedChild.kill();
});

describe('foreignPortListeners', () => {
  // The regression this covers: buildAndPreview called freePort() before the
  // build-identity assertion, and freePort SIGTERMs every listener on the port.
  // Another worktree's preview server was killed before anything could report
  // which build it was serving — while the assertion's own message told the
  // reader to choose a free port rather than stop it.
  it('identifies a listener owned by another checkout', () => {
    expect(foreignPortListeners(port, process.cwd())).toContain(child.pid);
  });

  it('does not claim a listener owned by this checkout', () => {
    expect(foreignPortListeners(port, foreignRoot)).not.toContain(child.pid);
  });

  it('distinguishes identical listener commands by checkout cwd', () => {
    expect(portListenerOwners(ownedPort, process.cwd())).toContainEqual({
      pid: ownedChild.pid,
      cwd: process.cwd(),
      owned: true,
    });
    expect(portListenerOwners(port, process.cwd())).toContainEqual({
      pid: child.pid,
      cwd: realpathSync(foreignRoot),
      owned: false,
    });
  });

  // The point of the guard is that the other session's server stays up.
  it('leaves the foreign listener alive — refusing is the whole behaviour', () => {
    expect(foreignPortListeners(port, process.cwd())).toContain(child.pid);

    expect(child.killed).toBe(false);
    expect(portListenerPids(port)).toContain(child.pid);
  });
});

describe('freePort', () => {
  // Still the right tool for this session's own leftovers; the guard above is what
  // decides whether it may be reached at all.
  it('stops a listener when it is called', async () => {
    freePort(port);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(portListenerPids(port)).not.toContain(child.pid);
  });
});
