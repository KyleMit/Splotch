import assert from 'node:assert/strict';
import {
  createWriteStream,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertNonce, digest, FIXTURE_COMMANDS } from './contract.mjs';
import { spawnCommandGate } from './run-command-gate.mjs';
import {
  captureProcessIdentity,
  recordProcessGroup,
  releaseOwnedCommandGroup,
  requireLiveCommandOwner,
  OWNERSHIP_DEADLINE_MS,
} from './process-ownership.mjs';

import {
  configureCommandTiming,
  commandRemainingMs,
  beginCommandCleanup,
} from './command-timing.mjs';
import { verifyRunnerInputs } from './runner-inputs.mjs';
import { requireIsolatedServerLease } from './adb-server.mjs';

const COMMAND_DEADLINE_MS = 10_000;
const TEARDOWN_DEADLINE_MS = OWNERSHIP_DEADLINE_MS;
export const COMMAND_CHILD_LEDGER = 'command-children.jsonl.txt';

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
  const timing = configureCommandTiming(lease, options.platform);
  if (options.platform === 'android') {
    verifyRunnerInputs(lease);
    requireIsolatedServerLease(lease);
  }
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
  writeFileSync(join(root, COMMAND_CHILD_LEDGER), '', { flag: 'wx' });
  const context = {
    ...options,
    ...timing,
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

async function releaseCompletedGate(call, gate, deadline) {
  const result = await beforeDeadline(gate.release(), deadline);
  call.gateExit = result;
  assert.equal(result.code, 0, 'L0_GATE_RELEASE_FAILED');
  const observation = recordProcessGroup(call);
  call.naturalGroupChecks ??= [];
  call.naturalGroupChecks.push({
    at: new Date().toISOString(),
    status: observation.status,
    groupPresent:
      observation.status === 'present' ? true : observation.status === 'absent' ? false : null,
  });
  assert.notEqual(observation.status, 'indeterminate', 'L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL');
  if (observation.status === 'present') {
    requireLiveCommandOwner(call);
    assert.fail('L0_NATURAL_TARGET_GROUP_REMAINS');
  }
}

/**
 * External native service supervision shares the fixture commands' durable spawn ledger.
 * @public
 */
export function recordCommandPhase(context, call, phase) {
  const fd = openSync(join(context.root, COMMAND_CHILD_LEDGER), 'a');
  try {
    const bytes = Buffer.from(
      JSON.stringify({ at: new Date().toISOString(), ownerPid: process.pid, phase, call }) + '\n'
    );
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      assert.ok(
        Number.isInteger(written) && written > 0 && written <= bytes.length - offset,
        'L0_COMMAND_LEDGER_WRITE_NO_PROGRESS'
      );
      offset += written;
    }
    fsyncSync(fd);
  } catch (error) {
    call.ledgerFailure ??= String(error);
    call.ledgerFailures ??= [];
    call.ledgerFailures.push({ phase, reason: String(error) });
    throw error;
  } finally {
    closeSync(fd);
  }
}

export async function capturedCommand(context, executable, args, boundMs = COMMAND_DEADLINE_MS) {
  const deadline = Date.now() + commandRemainingMs(context, boundMs);
  const id = String(context.calls.length + 1).padStart(3, '0');
  const stdoutName = `${id}.stdout.raw.txt`;
  const stderrName = `${id}.stderr.raw.txt`;
  const call = {
    id,
    executable,
    args,
    startedAt: new Date().toISOString(),
    deadlineMs: deadline - Date.now(),
    deadlineAt: new Date(deadline).toISOString(),
  };
  context.calls.push(call);
  recordCommandPhase(context, call, 'admitted');
  const out = createWriteStream(join(context.root, stdoutName), { flags: 'wx' });
  const err = createWriteStream(join(context.root, stderrName), { flags: 'wx' });
  const gate = spawnCommandGate(call, (phase) => recordCommandPhase(context, call, phase));
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
  const assertRunning = () => {
    assert.ok(!cancelled && Date.now() < deadline, 'L0_COMMAND_DEADLINE');
    commandRemainingMs(context, COMMAND_DEADLINE_MS);
  };
  const operation = async () => {
    await gate.ready;
    assertRunning();
    const identityRemainingMs = deadline - Date.now();
    assert.ok(identityRemainingMs > 0, 'L0_COMMAND_DEADLINE');
    call.identity = child.pid
      ? captureProcessIdentity(child.pid, identityRemainingMs)
      : { status: 'unavailable', reason: 'L0_CHILD_NOT_SPAWNED' };
    assertRunning();
    assert.ok(
      call.identity.status === 'observed' &&
        call.identity.ppid === process.pid &&
        call.identity.pgid === child.pid &&
        call.identity.argv === [process.execPath, call.gatePath].join(' '),
      'L0_SPAWN_IDENTITY_UNQUALIFIED'
    );
    recordCommandPhase(context, call, 'gate-qualified');
    await gate.start(executable, args);
    assertRunning();
    const result = await gate.result;
    call.exitCode = result.code;
    call.signal = result.signal;
    assertRunning();
    assert.equal(result.code, 0, `L0_COMMAND_EXIT_REFUSED: ${result.code}`);
    await releaseCompletedGate(
      call,
      gate,
      Math.min(Date.now() + TEARDOWN_DEADLINE_MS, context.cleanupDeadline ?? Infinity)
    );
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
      if (gate.terminal)
        await releaseCompletedGate(
          call,
          gate,
          Math.min(Date.now() + TEARDOWN_DEADLINE_MS, context.cleanupDeadline ?? Infinity)
        );
      else if (child.pid)
        await releaseOwnedCommandGroup(
          call,
          Math.min(Date.now() + TEARDOWN_DEADLINE_MS * 2, context.cleanupDeadline ?? Infinity)
        );
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
      await beforeDeadline(
        Promise.all([outClosed, errClosed]),
        Math.min(Date.now() + TEARDOWN_DEADLINE_MS, context.cleanupDeadline ?? Infinity)
      );
    } catch (error) {
      call.outputFinalizationFailure = String(error);
      outputError = error;
      out.destroy();
      err.destroy();
      try {
        await beforeDeadline(
          Promise.all(destinationClosed),
          Math.min(Date.now() + TEARDOWN_DEADLINE_MS, context.cleanupDeadline ?? Infinity)
        );
      } catch (closeError) {
        call.outputCloseFailure = String(closeError);
        outputError = new AggregateError([error, closeError], 'L0_OUTPUT_FINALIZATION_UNSETTLED');
      }
    }
    if (call.gateFailure && !commandError) commandError = new Error(call.gateFailure);
    call.endedAt = new Date().toISOString();
    const finalGroup = child.pid ? recordProcessGroup(call) : { status: 'absent' };
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
    try {
      recordCommandPhase(context, call, 'finalized');
    } catch (error) {
      call.ledgerFailure = String(error);
      outputError ??= error;
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

export async function settleCommandChildren(context) {
  beginCommandCleanup(context);
  const failures = [];
  for (const call of context.calls) {
    try {
      if (call.pid && recordProcessGroup(call).status !== 'absent') {
        commandRemainingMs(context, TEARDOWN_DEADLINE_MS);
        await releaseOwnedCommandGroup(
          call,
          Math.min(Date.now() + TEARDOWN_DEADLINE_MS * 2, context.cleanupDeadline ?? Infinity)
        );
      }
      call.finalGroupObservation = call.pid ? recordProcessGroup(call) : { status: 'absent' };
      call.groupAbsent = call.finalGroupObservation.status === 'absent';
      assert.ok(call.groupAbsent, 'L0_INNER_COMMAND_GROUP_UNSETTLED');
    } catch (error) {
      call.finalSettlementFailure = String(error);
      failures.push(error);
    }
    try {
      recordCommandPhase(context, call, 'independently-settled');
    } catch (error) {
      failures.push(error);
    }
  }
  writeFileSync(
    join(context.root, 'commands.json.txt'),
    JSON.stringify(context.calls, null, 2) + '\n'
  );
  if (context.platform === 'android') verifyRunnerInputs(context.lease);
  if (failures.length) throw new AggregateError(failures, 'L0_INNER_COMMAND_SETTLEMENT_FAILED');
}

export function finishEvidence(context, status, detail) {
  const ledgerBytes = readFileSync(join(context.root, COMMAND_CHILD_LEDGER));
  context.artifacts.push({
    path: COMMAND_CHILD_LEDGER,
    bytes: ledgerBytes.length,
    sha256: digest(ledgerBytes),
    complete: context.calls.every(
      (call) => call.groupAbsent === true && !call.ledgerFailure && !call.finalSettlementFailure
    ),
  });
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
