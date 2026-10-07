import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const OWNERSHIP_DEADLINE_MS = 2_000;
const POLL_INTERVAL_MS = 100;
const TEARDOWN_DEADLINE_MS = OWNERSHIP_DEADLINE_MS;
const GROUP_RELEASE_DEADLINE_MS = 4_000;

export function processIdentityRecord(raw) {
  const match = raw
    .trim()
    .match(
      /^(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+([\s\S]+)$/
    );
  if (!match) return { status: 'unavailable', raw, reason: 'L0_PROCESS_IDENTITY_FORMAT' };
  return {
    status: 'observed',
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    birth: match[4],
    argv: match[5],
    raw,
  };
}

export function recordProcessGroup(call) {
  let observation;
  try {
    process.kill(-call.pid, 0);
    observation = { status: 'present' };
  } catch (error) {
    observation =
      error.code === 'ESRCH'
        ? { status: 'absent' }
        : { status: 'indeterminate', code: error.code ?? null, error: String(error) };
  }
  call.groupObservations ??= [];
  call.groupObservations.push({ at: new Date().toISOString(), ...observation });
  return observation;
}

function groupExists(call) {
  const observation = recordProcessGroup(call);
  assert.notEqual(observation.status, 'indeterminate', 'L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL');
  return observation.status === 'present';
}

export function captureProcessIdentity(pid, timeoutMs) {
  try {
    const result = spawnSync(
      '/bin/ps',
      [
        '-ww',
        '-p',
        String(pid),
        '-o',
        'pid=',
        '-o',
        'ppid=',
        '-o',
        'pgid=',
        '-o',
        'lstart=',
        '-o',
        'args=',
      ],
      { timeout: timeoutMs, env: { ...process.env, LC_ALL: 'C' } }
    );
    const stdout = result.stdout ?? Buffer.alloc(0);
    const stderr = result.stderr ?? Buffer.alloc(0);
    const raw = stdout.toString('utf8');
    if (
      result.status !== 0 ||
      result.signal !== null ||
      result.error ||
      stderr.length ||
      !Buffer.from(raw, 'utf8').equals(stdout)
    ) {
      return {
        status: 'unavailable',
        reason: 'L0_PROCESS_IDENTITY_RESULT_REFUSED',
        exitCode: result.status ?? null,
        signal: result.signal ?? null,
        error: result.error ? String(result.error) : null,
        stdoutHex: stdout.toString('hex'),
        stderrHex: stderr.toString('hex'),
      };
    }
    const identity = processIdentityRecord(raw);
    if (raw.trim().split(/\r?\n/).length !== 1 || identity.pid !== pid) {
      return {
        status: 'unavailable',
        reason: 'L0_PROCESS_IDENTITY_ROW_REFUSED',
        stdoutHex: stdout.toString('hex'),
        stderrHex: stderr.toString('hex'),
      };
    }
    return identity;
  } catch (error) {
    return {
      status: 'unavailable',
      error: String(error),
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    };
  }
}

export function requireLiveCommandOwner(call, deadline = Date.now() + TEARDOWN_DEADLINE_MS) {
  const remaining = Math.min(TEARDOWN_DEADLINE_MS, deadline - Date.now());
  assert.ok(remaining > 0, 'L0_OWNERSHIP_PHASE_DEADLINE_NO_SIGNAL');
  const live = captureProcessIdentity(call.pid, remaining);
  call.signalIdentityChecks ??= [];
  call.signalIdentityChecks.push({ at: new Date().toISOString(), live });
  assert.ok(
    call.identity?.status === 'observed' &&
      live.status === 'observed' &&
      live.pid === call.pid &&
      live.ppid === process.pid &&
      live.pgid === call.pid &&
      call.identity.ppid === live.ppid &&
      call.identity.pgid === live.pgid &&
      call.identity.birth === live.birth &&
      call.identity.argv === live.argv,
    'L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL'
  );
}

export async function releaseOwnedCommandGroup(
  call,
  finalDeadline = Date.now() + GROUP_RELEASE_DEADLINE_MS
) {
  if (!groupExists(call)) return;
  requireLiveCommandOwner(call, finalDeadline);
  process.kill(-call.pid, 'SIGTERM');
  const deadline = Math.min(Date.now() + TEARDOWN_DEADLINE_MS, finalDeadline);
  while (groupExists(call) && Date.now() < deadline) await delay(POLL_INTERVAL_MS);
  if (groupExists(call)) {
    requireLiveCommandOwner(call, finalDeadline);
    process.kill(-call.pid, 'SIGKILL');
  }
  const killDeadline = Math.min(Date.now() + TEARDOWN_DEADLINE_MS, finalDeadline);
  while (groupExists(call) && Date.now() < killDeadline) await delay(POLL_INTERVAL_MS);
  assert.ok(!groupExists(call), 'L0_OWNED_COMMAND_GROUP_REMAINS');
}
