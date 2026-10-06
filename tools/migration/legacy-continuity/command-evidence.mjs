import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertNonce, digest, FIXTURE_COMMANDS } from './contract.mjs';

const COMMAND_DEADLINE_MS = 10_000;
const TEARDOWN_DEADLINE_MS = 2_000;
const POLL_INTERVAL_MS = 100;

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
  assert.ok(
    parent === '/private/tmp' || parent.startsWith('/private/tmp/'),
    'L0_OWNED_OUTPUT_ROOT_REQUIRED'
  );
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

function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function processIdentity(pid) {
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
      { encoding: 'utf8', timeout: COMMAND_DEADLINE_MS, env: { ...process.env, LC_ALL: 'C' } }
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
  const live = processIdentity(call.pid);
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
  if (!groupExists(call.pid)) return;
  requireLiveOwner(call);
  process.kill(-call.pid, 'SIGTERM');
  const deadline = Date.now() + TEARDOWN_DEADLINE_MS;
  while (groupExists(call.pid) && Date.now() < deadline) await delay(POLL_INTERVAL_MS);
  if (groupExists(call.pid)) {
    requireLiveOwner(call);
    process.kill(-call.pid, 'SIGKILL');
  }
  const killDeadline = Date.now() + TEARDOWN_DEADLINE_MS;
  while (groupExists(call.pid) && Date.now() < killDeadline) await delay(POLL_INTERVAL_MS);
  assert.ok(!groupExists(call.pid), 'L0_OWNED_COMMAND_GROUP_REMAINS');
}

export async function capturedCommand(context, executable, args) {
  const id = String(context.calls.length + 1).padStart(3, '0');
  const stdoutName = `${id}.stdout.raw.txt`;
  const stderrName = `${id}.stderr.raw.txt`;
  const out = createWriteStream(join(context.root, stdoutName), {
    flags: 'wx',
  });
  const err = createWriteStream(join(context.root, stderrName), {
    flags: 'wx',
  });
  const call = {
    id,
    executable,
    args,
    startedAt: new Date().toISOString(),
    deadlineMs: COMMAND_DEADLINE_MS,
  };
  context.calls.push(call);
  const child = spawn(executable, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  call.pid = child.pid;
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  completed.catch(() => {});
  const outClosed = new Promise((resolve, reject) => {
    out.once('close', resolve);
    out.once('error', reject);
  });
  const errClosed = new Promise((resolve, reject) => {
    err.once('close', resolve);
    err.once('error', reject);
  });
  let timer;
  let output;
  let commandError;
  let ownershipError;
  try {
    call.identity = child.pid
      ? processIdentity(child.pid)
      : { status: 'unavailable', reason: 'L0_CHILD_NOT_SPAWNED' };
    assert.ok(
      call.identity.status === 'observed' &&
        call.identity.ppid === process.pid &&
        call.identity.pgid === child.pid &&
        call.identity.argv === [executable, ...args].join(' '),
      'L0_SPAWN_IDENTITY_UNQUALIFIED'
    );
    const result = await Promise.race([
      completed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('L0_COMMAND_DEADLINE')), COMMAND_DEADLINE_MS);
      }),
    ]);
    call.exitCode = result.code;
    call.signal = result.signal;
    await Promise.all([outClosed, errClosed]);
    assert.equal(result.code, 0, `L0_COMMAND_EXIT_REFUSED: ${result.code}`);
    output = readFileSync(join(context.root, stdoutName));
  } catch (error) {
    call.failure = String(error);
    commandError = error;
  } finally {
    clearTimeout(timer);
    try {
      if (child.pid) await endGroup(call);
    } catch (error) {
      call.unresolvedOwnership = String(error);
      child.unref();
      ownershipError = error;
    } finally {
      child.stdout.unpipe(out);
      child.stderr.unpipe(err);
      child.stdout.destroy();
      child.stderr.destroy();
      out.end();
      err.end();
      await Promise.all([outClosed, errClosed]);
      call.endedAt = new Date().toISOString();
      call.groupAbsent = child.pid ? !groupExists(child.pid) : true;
      for (const name of [stdoutName, stderrName]) {
        const bytes = readFileSync(join(context.root, name));
        context.artifacts.push({
          path: name,
          bytes: bytes.length,
          sha256: digest(bytes),
        });
      }
      writeFileSync(
        join(context.root, 'commands.json.txt'),
        JSON.stringify(context.calls, null, 2) + '\n'
      );
    }
  }
  if (commandError && ownershipError)
    throw new AggregateError([commandError, ownershipError], 'L0_COMMAND_AND_OWNERSHIP_UNRESOLVED');
  if (ownershipError) throw ownershipError;
  if (commandError) throw commandError;
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
