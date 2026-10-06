import { afterEach, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../lib/proc.mjs';
import { createOwnedArtifact } from '../lib/web-host-ownership.mjs';
import { copiedBuildEnvironment, runCopiedChild } from '../lib/web-host-build.mjs';

const roots = [];
const PROCESS_CONTROL_TIMEOUT_MS = 30_000;
const PROCESS_READY_TIMEOUT_MS = 15_000;
const PROCESS_STOP_TIMEOUT_MS = 5_000;
const IDLE_INTERVAL_MS = 1_000;
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-web-child-')));
  roots.push(root);
  const owned = createOwnedArtifact(root);
  const copyRoot = join(owned.root, 'control');
  mkdirSync(copyRoot);
  return { owned, copyRoot, env: copiedBuildEnvironment(owned, copyRoot, 'release', {}) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function processIsRunning(pid) {
  const result = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  return (
    result.status === 0 && result.stdout.trim() !== '' && !result.stdout.trim().startsWith('Z')
  );
}
function stopFixtureGroup(pid) {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function controllerFixture(ignoreTermination) {
  const prepared = fixture();
  const marker = join(prepared.owned.root, 'ready.json');
  const result = join(prepared.owned.root, 'interruption.json');
  const descendant = `
if (${JSON.stringify(ignoreTermination)}) process.on('SIGTERM', () => {});
setInterval(() => {}, ${IDLE_INTERVAL_MS});
process.send('ready');`;
  const child = `
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
if (${JSON.stringify(ignoreTermination)}) process.on('SIGTERM', () => {});
else process.on('SIGTERM', () => {
  if (descendant.exitCode !== null || descendant.signalCode !== null) process.exit(0);
  descendant.once('exit', () => process.exit(0));
  descendant.kill('SIGTERM');
});
descendant.once('message', () => writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ child: process.pid, descendant: descendant.pid })));
setInterval(() => {}, ${IDLE_INTERVAL_MS});`;
  const controller = join(prepared.owned.root, 'controller.mjs');
  writeFileSync(
    controller,
    `
import { writeFileSync } from 'node:fs';
import { runCopiedChild } from ${JSON.stringify(pathToFileURL(join(ROOT, 'tools/migration/lib/web-host-build.mjs')).href)};
const signals = ['SIGINT', 'SIGTERM'];
const before = signals.map((name) => process.listenerCount(name));
let record;
let failure = null;
try {
  record = await runCopiedChild(${JSON.stringify({ ...prepared, label: 'interrupted-child', command: process.execPath, args: ['-e', child] })});
} catch (error) {
  failure = error.message;
  record = error.childRecord;
  process.exitCode = 1;
}
writeFileSync(${JSON.stringify(result)}, JSON.stringify({ record, failure, before, after: signals.map((name) => process.listenerCount(name)) }));
`
  );
  return { ...prepared, marker, result, controller };
}

it(
  'removes active interruption handlers after a successful copied child',
  async ({ signal }) => {
    const prepared = fixture();
    const before = ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name));
    const record = await runCopiedChild({
      ...prepared,
      label: 'positive-child',
      command: process.execPath,
      args: ['-e', 'process.stdout.write("owned child")'],
    });
    signal.throwIfAborted();
    expect(record).toMatchObject({ code: 0, interrupted: false, interruptionSignal: null });
    expect(['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name))).toEqual(before);
    expect(readFileSync(record.logPath, 'utf8')).toBe('owned child');
  },
  PROCESS_CONTROL_TIMEOUT_MS
);

it.for([
  {
    requestedSignal: 'SIGINT',
    ignoreTermination: false,
    escalated: false,
    expectedCode: 0,
    expectedSignal: null,
  },
  {
    requestedSignal: 'SIGTERM',
    ignoreTermination: false,
    escalated: false,
    expectedCode: 0,
    expectedSignal: null,
  },
  {
    requestedSignal: 'SIGINT',
    ignoreTermination: true,
    escalated: true,
    expectedCode: null,
    expectedSignal: 'SIGKILL',
  },
])(
  'records $requestedSignal and stops only its owned child group (escalated $escalated)',
  async (
    { requestedSignal, ignoreTermination, escalated, expectedCode, expectedSignal },
    { signal }
  ) => {
    const prepared = controllerFixture(ignoreTermination);
    const unrelated = spawn(
      process.execPath,
      ['-e', `setInterval(() => {}, ${IDLE_INTERVAL_MS})`],
      { detached: true, stdio: 'ignore' }
    );
    const unrelatedClosed = once(unrelated, 'close');
    const launcher = spawn(
      process.execPath,
      ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', prepared.controller],
      { detached: true, stdio: 'ignore', env: prepared.env }
    );
    const closed = once(launcher, 'close');
    let pids;
    try {
      await expect
        .poll(() => existsSync(prepared.marker), { timeout: PROCESS_READY_TIMEOUT_MS })
        .toBe(true);
      signal.throwIfAborted();
      pids = JSON.parse(readFileSync(prepared.marker, 'utf8'));
      expect(processIsRunning(pids.child)).toBe(true);
      expect(processIsRunning(pids.descendant)).toBe(true);
      expect(processIsRunning(unrelated.pid)).toBe(true);
      launcher.kill(requestedSignal);
      const [code] = await closed;
      signal.throwIfAborted();
      expect(code).toBe(1);
      const result = JSON.parse(readFileSync(prepared.result, 'utf8'));
      expect(result.record).toMatchObject({
        code: expectedCode,
        signal: expectedSignal,
        interrupted: true,
        interruptionSignal: requestedSignal,
        timedOut: false,
        termination: { groupPid: pids.child, gracefulSignal: 'SIGTERM', escalated },
      });
      expect(result.failure).toContain(`failed (${requestedSignal})`);
      expect(result.after).toEqual(result.before);
      await expect
        .poll(() => [processIsRunning(pids.child), processIsRunning(pids.descendant)], {
          timeout: PROCESS_STOP_TIMEOUT_MS,
        })
        .toEqual([false, false]);
      signal.throwIfAborted();
      expect(processIsRunning(unrelated.pid)).toBe(true);
    } finally {
      stopFixtureGroup(pids?.child);
      stopFixtureGroup(launcher.pid);
      stopFixtureGroup(unrelated.pid);
      await Promise.all([closed, unrelatedClosed]);
    }
  },
  PROCESS_CONTROL_TIMEOUT_MS
);
