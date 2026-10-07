import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { assertNonce, digest, FIXTURE_COMMANDS } from './contract.mjs';
import { spawnCommandGate } from './run-command-gate.mjs';

const COMMAND_DEADLINE_MS = 10_000;
const TEARDOWN_DEADLINE_MS = 2_000;
const POLL_INTERVAL_MS = 100;

function isTemporaryParent(parent) {
  return [tmpdir(), '/tmp'].some((path) => {
    const root = realpathSync(path);
    return parent === root || parent.startsWith(root + '/');
  });
}

export function commandContext(options) {
  assertNonce(options.nonce);
  assert.ok(FIXTURE_COMMANDS.includes(options.command), 'L0_COMMAND_INVALID');
  const leaseBytes = readFileSync(options.lease);
  const lease = JSON.parse(leaseBytes);
  assert.equal(lease.owner, 'L0', 'L0_LEASE_OWNER_INVALID');
  assert.equal(lease.platform, options.platform, 'L0_LEASE_PLATFORM_INVALID');
  assert.equal(lease.applicationId, 'art.splotch.app', 'L0_LEASE_APPLICATION_INVALID');
  assert.ok(Number.isFinite(Date.parse(lease.expiresAt)), 'L0_LEASE_EXPIRY_INVALID');
  if (options.platform === 'android')
    assert.ok(Date.parse(lease.expiresAt) > Date.now(), 'L0_LEASE_EXPIRED');
  assert.match(lease.deviceName, /^splotch-l0-[a-z0-9-]+$/, 'L0_OWNED_DEVICE_NAME_REQUIRED');
  assert.ok(typeof lease.device === 'string' && lease.device.length > 0, 'L0_DEVICE_REQUIRED');
  const fixtureRoot = realpathSync(options.fixture);
  assert.equal(fixtureRoot, lease.fixtureRoot, 'L0_LEASE_SOURCE_ROOT_MISMATCH');
  const inputBytes = readFileSync(join(fixtureRoot, '.splotch-l0-source.json'));
  const input = JSON.parse(inputBytes);
  assert.equal(input.root, fixtureRoot, 'L0_SOURCE_RECEIPT_ROOT_MISMATCH');
  assert.equal(digest(inputBytes), lease.sourceReceiptSha256, 'L0_SOURCE_RECEIPT_CHANGED');
  assert.equal(input.configuration.path, '/legacy-continuity.html', 'L0_FIXTURE_ROUTE_CHANGED');
  assert.match(lease.artifactSha256, /^[a-f0-9]{64}$/, 'L0_ARTIFACT_IDENTITY_REQUIRED');
  const root = resolve(options.output);
  assert.ok(
    basename(root).startsWith('splotch-legacy-continuity-'),
    'L0_OWNED_OUTPUT_NAME_REQUIRED'
  );
  const parent = realpathSync(dirname(root));
  assert.ok(isTemporaryParent(parent), 'L0_OWNED_OUTPUT_ROOT_REQUIRED');
  assert.ok(!existsSync(root), 'L0_EXISTING_OUTPUT_REFUSED');
  mkdirSync(root);
  const context = {
    ...options,
    root,
    fixtureRoot,
    input,
    lease,
    calls: [],
    artifacts: [],
  };
  evidence(
    context,
    'inputs.json.txt',
    JSON.stringify(
      {
        options,
        lease,
        leaseSha256: digest(leaseBytes),
        sourceReceiptSha256: digest(inputBytes),
        node: {
          version: process.version,
          path: process.execPath,
          sha256: digest(readFileSync(process.execPath)),
        },
        scope: 'local fixture mechanics only; qualification and acceptance remain separate',
      },
      null,
      2
    )
  );
  return context;
}

export function evidence(context, name, bytes) {
  assert.match(name, /^[a-zA-Z0-9_.-]+$/, 'L0_EVIDENCE_NAME_INVALID');
  const target = join(context.root, name);
  assert.ok(!existsSync(target), 'L0_EVIDENCE_REPLACEMENT_REFUSED');
  writeFileSync(target, bytes);
  const data = readFileSync(target);
  context.artifacts.push({
    path: name,
    bytes: data.length,
    sha256: digest(data),
  });
  return data;
}

function observeGroup(call) {
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
  const observation = observeGroup(call);
  assert.notEqual(observation.status, 'indeterminate', 'L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL');
  return observation.status === 'present';
}

function processIdentity(pid, timeoutMs) {
  try {
    const raw = execFileSync(
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
      { encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, LC_ALL: 'C' } }
    );
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
  } catch (error) {
    return {
      status: 'unavailable',
      error: String(error),
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    };
  }
}

function requireLiveOwner(call) {
  const live = processIdentity(call.pid, TEARDOWN_DEADLINE_MS);
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

async function endGroup(call) {
  if (!groupExists(call)) return;
  requireLiveOwner(call);
  process.kill(-call.pid, 'SIGTERM');
  const deadline = Date.now() + TEARDOWN_DEADLINE_MS;
  while (groupExists(call) && Date.now() < deadline) await delay(POLL_INTERVAL_MS);
  if (groupExists(call)) {
    requireLiveOwner(call);
    process.kill(-call.pid, 'SIGKILL');
  }
  const killDeadline = Date.now() + TEARDOWN_DEADLINE_MS;
  while (groupExists(call) && Date.now() < killDeadline) await delay(POLL_INTERVAL_MS);
  assert.ok(!groupExists(call), 'L0_OWNED_COMMAND_GROUP_REMAINS');
}

async function beforeDeadline(promise, deadline) {
  const remaining = deadline - Date.now();
  assert.ok(remaining > 0, 'L0_COMMAND_DEADLINE');
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('L0_COMMAND_DEADLINE')), remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function releaseCompletedGate(call, gate) {
  const result = await beforeDeadline(gate.release(), Date.now() + TEARDOWN_DEADLINE_MS);
  call.gateExit = result;
  assert.equal(result.code, 0, 'L0_GATE_RELEASE_FAILED');
  const observation = observeGroup(call);
  call.naturalGroupChecks ??= [];
  call.naturalGroupChecks.push({
    at: new Date().toISOString(),
    status: observation.status,
    groupPresent:
      observation.status === 'present' ? true : observation.status === 'absent' ? false : null,
  });
  assert.notEqual(observation.status, 'indeterminate', 'L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL');
  if (observation.status === 'present') {
    requireLiveOwner(call);
    assert.fail('L0_NATURAL_TARGET_GROUP_REMAINS');
  }
}

export async function capturedCommand(context, executable, args) {
  const deadline = Date.now() + COMMAND_DEADLINE_MS;
  const id = String(context.calls.length + 1).padStart(3, '0');
  const stdoutName = `${id}.stdout.raw.txt`;
  const stderrName = `${id}.stderr.raw.txt`;
  const out = createWriteStream(join(context.root, stdoutName), { flags: 'wx' });
  const err = createWriteStream(join(context.root, stderrName), { flags: 'wx' });
  const call = {
    id,
    executable,
    args,
    startedAt: new Date().toISOString(),
    deadlineMs: COMMAND_DEADLINE_MS,
    deadlineAt: new Date(deadline).toISOString(),
  };
  context.calls.push(call);
  const gate = spawnCommandGate(call);
  const child = gate.child;
  call.pid = child.pid;
  const naturalEnd = { stdout: false, stderr: false };
  child.stdout.once('end', () => {
    naturalEnd.stdout = true;
  });
  child.stderr.once('end', () => {
    naturalEnd.stderr = true;
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  const destinations = [
    { path: stdoutName, channel: 'stdout', stream: out, closed: false },
    { path: stderrName, channel: 'stderr', stream: err, closed: false },
  ];
  const destinationClosed = destinations.map(
    (destination) =>
      new Promise((resolve) => {
        destination.stream.once('close', () => {
          destination.closed = true;
          resolve();
        });
      })
  );
  const outClosed = new Promise((resolve, reject) => {
    out.once('close', resolve);
    out.once('error', reject);
  });
  const errClosed = new Promise((resolve, reject) => {
    err.once('close', resolve);
    err.once('error', reject);
  });
  for (const pending of [outClosed, errClosed]) pending.catch(() => {});
  let cancelled = false;
  let output, commandError, ownershipError, outputError;
  const assertRunning = () => assert.ok(!cancelled && Date.now() < deadline, 'L0_COMMAND_DEADLINE');
  const operation = async () => {
    await gate.ready;
    assertRunning();
    const identityRemainingMs = deadline - Date.now();
    assert.ok(identityRemainingMs > 0, 'L0_COMMAND_DEADLINE');
    call.identity = child.pid
      ? processIdentity(child.pid, identityRemainingMs)
      : { status: 'unavailable', reason: 'L0_CHILD_NOT_SPAWNED' };
    assertRunning();
    assert.ok(
      call.identity.status === 'observed' &&
        call.identity.ppid === process.pid &&
        call.identity.pgid === child.pid &&
        call.identity.argv === [process.execPath, call.gatePath].join(' '),
      'L0_SPAWN_IDENTITY_UNQUALIFIED'
    );
    await gate.start(executable, args);
    assertRunning();
    const result = await gate.result;
    call.exitCode = result.code;
    call.signal = result.signal;
    assertRunning();
    assert.equal(result.code, 0, `L0_COMMAND_EXIT_REFUSED: ${result.code}`);
    await releaseCompletedGate(call, gate);
    assertRunning();
    await Promise.all([outClosed, errClosed]);
    output = readFileSync(join(context.root, stdoutName));
    assertRunning();
  };
  try {
    await beforeDeadline(Promise.race([operation(), gate.fault]), deadline);
  } catch (error) {
    if (
      call.naturalGroupChecks?.at(-1)?.status &&
      call.naturalGroupChecks.at(-1).status !== 'absent'
    ) {
      call.unresolvedOwnership = String(error);
      ownershipError = error;
    } else {
      call.failure = String(error);
      commandError = error;
    }
  } finally {
    cancelled = true;
    try {
      if (gate.terminal) await releaseCompletedGate(call, gate);
      else if (child.pid) await endGroup(call);
    } catch (error) {
      call.unresolvedOwnership = String(error);
      ownershipError = error;
    }
    if (child.connected) child.disconnect();
    child.unref();
    call.channelEndBeforeFinalization = { ...naturalEnd };
    child.stdout.unpipe(out);
    child.stderr.unpipe(err);
    child.stdout.destroy();
    child.stderr.destroy();
    out.end();
    err.end();
    try {
      await beforeDeadline(Promise.all([outClosed, errClosed]), Date.now() + TEARDOWN_DEADLINE_MS);
    } catch (error) {
      call.outputFinalizationFailure = String(error);
      outputError = error;
      out.destroy();
      err.destroy();
      try {
        await beforeDeadline(Promise.all(destinationClosed), Date.now() + TEARDOWN_DEADLINE_MS);
      } catch (closeError) {
        call.outputCloseFailure = String(closeError);
        outputError = new AggregateError([error, closeError], 'L0_OUTPUT_FINALIZATION_UNSETTLED');
      }
    }
    if (call.gateFailure && !commandError) commandError = new Error(call.gateFailure);
    call.endedAt = new Date().toISOString();
    const finalGroup = child.pid ? observeGroup(call) : { status: 'absent' };
    call.groupAbsent = finalGroup.status === 'absent';
    if (finalGroup.status === 'indeterminate') {
      ownershipError ??= new Error('L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL');
      call.unresolvedOwnership ??= String(ownershipError);
    }
    call.targetResult = gate.terminal ?? null;
    for (const destination of destinations) {
      const { path: name, channel, closed } = destination;
      if (!closed) {
        call.unsettledOutputPaths ??= [];
        call.unsettledOutputPaths.push({
          path: name,
          status: 'close-unsettled',
          hashOmitted: true,
        });
        continue;
      }
      const bytes = readFileSync(join(context.root, name));
      const natural = call.channelEndBeforeFinalization[channel];
      const complete =
        natural &&
        gate.terminal?.kind === 'exit' &&
        call.groupAbsent &&
        !ownershipError &&
        !outputError &&
        !call.gateFailure &&
        !call.failure?.includes('L0_COMMAND_DEADLINE');
      context.artifacts.push({
        path: name,
        bytes: bytes.length,
        sha256: digest(bytes),
        complete,
        streamCompletion: natural ? 'natural-eof' : 'forced-or-unsettled',
      });
    }
    writeFileSync(
      join(context.root, 'commands.json.txt'),
      JSON.stringify(context.calls, null, 2) + '\n'
    );
  }
  const failures = [commandError, ownershipError, outputError].filter(Boolean);
  if (failures.length > 1)
    throw new AggregateError(failures, 'L0_COMMAND_AND_OWNERSHIP_UNRESOLVED');
  if (failures.length === 1) throw failures[0];
  return output;
}

export function finishEvidence(context, status, detail) {
  const commandsPath = join(context.root, 'commands.json.txt');
  if (existsSync(commandsPath)) {
    const bytes = readFileSync(commandsPath);
    context.artifacts.push({
      path: 'commands.json.txt',
      bytes: bytes.length,
      sha256: digest(bytes),
    });
  }
  evidence(
    context,
    'outcome.json.txt',
    JSON.stringify(
      {
        status,
        detail,
        scope: 'local mechanics; no upgrade/channel/runtime acceptance',
        artifacts: context.artifacts,
        commands: context.calls,
      },
      null,
      2
    ) + '\n'
  );
}
