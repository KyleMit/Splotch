import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const HAND_BACK_READY_TIMEOUT_MS = 10_000;
const HAND_BACK_CLOSE_TIMEOUT_MS = 5_000;
const HAND_BACK_CLEANUP_TIMEOUT_MS = 5_000;
const HAND_BACK_OVERHEAD_MS = 1_000;
const HAND_BACK_POLL_MS = 50;
export const HAND_BACK_WINDOW_MS = HAND_BACK_READY_TIMEOUT_MS + HAND_BACK_CLOSE_TIMEOUT_MS;
export const HAND_BACK_TEST_TIMEOUT_MS =
  HAND_BACK_READY_TIMEOUT_MS +
  HAND_BACK_CLOSE_TIMEOUT_MS +
  HAND_BACK_CLEANUP_TIMEOUT_MS +
  HAND_BACK_OVERHEAD_MS;

function fixtureDetails(fixture, phase) {
  return (
    `${phase}: marker=${existsSync(fixture.marker)}, exit=${fixture.child.exitCode}, ` +
    `signal=${fixture.child.signalCode}, stdout=${JSON.stringify(fixture.stdout)}, ` +
    `stderr=${JSON.stringify(fixture.stderr)}`
  );
}

function startHandBackFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'hand-back-signal-'));
  const marker = join(directory, 'handing-back');
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./signal-during-hand-back.mjs', import.meta.url)), marker],
    {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const fixture = {
    directory,
    marker,
    child,
    stdout: '',
    stderr: '',
    status: null,
    spawnError: null,
  };
  child.stdout.on('data', (chunk) => (fixture.stdout += chunk));
  child.stderr.on('data', (chunk) => (fixture.stderr += chunk));
  // close includes the final stdout bytes; exit can precede stream draining.
  child.once('error', (error) => (fixture.spawnError = error));
  fixture.closed = new Promise((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal }))
  ).then((status) => (fixture.status = status));
  return fixture;
}

async function waitForHandBackMarker(fixture, signal) {
  const deadline = performance.now() + HAND_BACK_READY_TIMEOUT_MS;
  while (!existsSync(fixture.marker)) {
    signal.throwIfAborted();
    if (fixture.spawnError || fixture.status || performance.now() >= deadline)
      throw new Error(fixtureDetails(fixture, 'readiness failed'), {
        cause: fixture.spawnError,
      });
    await delay(HAND_BACK_POLL_MS);
  }
  signal.throwIfAborted();
  if (performance.now() >= deadline)
    throw new Error(fixtureDetails(fixture, 'readiness marker arrived after deadline'));
}

async function waitForFixtureClose(fixture, timeoutMs, phase) {
  const deadline = performance.now() + timeoutMs;
  let timer;
  try {
    const status = await Promise.race([
      fixture.closed,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(fixtureDetails(fixture, `${phase} timed out`))),
          timeoutMs
        );
      }),
    ]);
    if (performance.now() >= deadline)
      throw new Error(fixtureDetails(fixture, `${phase} completed after deadline`));
    return status;
  } finally {
    clearTimeout(timer);
  }
}

function fixtureIsLive({ child, status }) {
  return !!child.pid && status === null && child.exitCode === null && child.signalCode === null;
}

function killFixtureGroup(fixture) {
  if (!fixtureIsLive(fixture)) return;
  const { child } = fixture;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function interruptHandBackFixture(signal) {
  const fixture = startHandBackFixture();
  const failures = [];
  let status;
  try {
    await waitForHandBackMarker(fixture, signal);
    if (!fixtureIsLive(fixture))
      throw new Error(fixtureDetails(fixture, 'fixture exited before group SIGINT'));
    process.kill(-fixture.child.pid, 'SIGINT');
    status = await waitForFixtureClose(fixture, HAND_BACK_CLOSE_TIMEOUT_MS, 'signal/close');
    signal.throwIfAborted();
  } catch (error) {
    failures.push(error);
  }
  for (const cleanup of [
    () => killFixtureGroup(fixture),
    () => waitForFixtureClose(fixture, HAND_BACK_CLEANUP_TIMEOUT_MS, 'cleanup/close'),
    () => rmSync(fixture.directory, { recursive: true, force: true }),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      fixtureDetails(fixture, 'signal hand-back or cleanup failed')
    );
  return { status, stdout: fixture.stdout, diagnostics: fixtureDetails(fixture, 'closed') };
}
