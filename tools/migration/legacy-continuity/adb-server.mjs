import assert from 'node:assert/strict';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { capturedCommand, evidence } from './command-evidence.mjs';
import { processIdentityRecord } from './process-ownership.mjs';
import { commandRemainingMs } from './command-timing.mjs';
import { digest } from './contract.mjs';

const PROBE_DEADLINE_MS = 1_000;
const PROTOCOL_CLOSE_DEADLINE_MS = 1_000;
const HOST_VERSION_REQUEST = Buffer.from('000chost:version');
const SERVER_PROTOCOL = 41;
const DEFAULT_SERVER_PORT = 5037;
export const ADB_SERVER_LAUNCH_SCHEMA = 'L0_ADB_ISOLATED_LAUNCH_V1';

export function lsofRecords(bytes, kind) {
  assert.ok(['listener', 'executable'].includes(kind), 'L0_LSOF_KIND_INVALID');
  const names = kind === 'listener' ? ['t', 'n'] : ['t', 'D', 'i', 'n'];
  const records = [];
  let pid,
    entry,
    processRecords = 0;
  const pids = new Set();
  const finish = () => {
    if (!entry) return;
    assert.ok(
      names.every((field) => Object.hasOwn(entry, field)),
      'L0_LSOF_FIELDS_MISSING'
    );
    records.push(entry);
    processRecords++;
    entry = undefined;
  };
  const text = bytes.toString();
  assert.ok(text.endsWith('\n'), 'L0_LSOF_FRAME_INCOMPLETE');
  for (const line of text.slice(0, -1).split('\n')) {
    const field = line[0],
      value = line.slice(1);
    assert.ok(value.length > 0, 'L0_LSOF_FIELD_EMPTY');
    if (field === 'p') {
      finish();
      assert.ok(pid === undefined || processRecords > 0, 'L0_LSOF_PROCESS_WITHOUT_MAPPING');
      assert.match(value, /^[1-9]\d*$/, 'L0_LSOF_PID_INVALID');
      pid = Number(value);
      assert.ok(Number.isSafeInteger(pid), 'L0_LSOF_PID_INVALID');
      assert.ok(!pids.has(pid), 'L0_LSOF_PROCESS_DUPLICATE');
      pids.add(pid);
      processRecords = 0;
    } else if (field === 'f') {
      finish();
      assert.ok(pid !== undefined, 'L0_LSOF_MAPPING_WITHOUT_PROCESS');
      assert.match(value, /^(?:txt|[0-9]+[rwu]?)$/, 'L0_LSOF_DESCRIPTOR_INVALID');
      entry = { pid, descriptor: value };
    } else {
      assert.ok(entry && names.includes(field), 'L0_LSOF_FIELD_ORDER_INVALID');
      assert.ok(!Object.hasOwn(entry, field), 'L0_LSOF_FIELD_DUPLICATE');
      entry[field] = value;
    }
  }
  finish();
  assert.ok(processRecords > 0 && records.length > 0, 'L0_LSOF_PROCESS_WITHOUT_MAPPING');
  return records;
}

export function requireExpectedServerIdentity(bytes, expected) {
  const observed = processIdentityRecord(bytes.toString());
  assert.equal(observed.status, 'observed', 'L0_ADB_SERVER_PROCESS_UNOBSERVABLE');
  for (const field of ['pid', 'ppid', 'pgid', 'birth', 'argv'])
    assert.equal(observed[field], expected[field], `L0_ADB_SERVER_${field.toUpperCase()}_CHANGED`);
  return observed;
}

export function isolatedServerArgv(lease) {
  return [lease.adbPath, '-L', `tcp:127.0.0.1:${lease.adbServer.port}`, 'server', 'nodaemon'];
}

export function requireIsolatedServerLease(lease) {
  const expected = lease.adbServer;
  assert.ok(
    expected &&
      expected.owner === 'L0' &&
      expected.scope === 'owned-isolated' &&
      expected.protocol === SERVER_PROTOCOL,
    'L0_ADB_OWNED_ISOLATED_SERVER_REQUIRED'
  );
  assert.ok(
    Number.isSafeInteger(expected.port) &&
      expected.port > 1024 &&
      expected.port <= 65535 &&
      expected.port !== DEFAULT_SERVER_PORT,
    'L0_ADB_DEFAULT_OR_INVALID_SERVER_PORT_REFUSED'
  );
  assert.ok(
    typeof lease.unitNonce === 'string' && /^[a-f0-9]{32}$/.test(lease.unitNonce),
    'L0_ADB_UNIT_NONCE_REQUIRED'
  );
  assert.ok(
    ['pid', 'ppid', 'pgid'].every(
      (field) => Number.isSafeInteger(expected[field]) && expected[field] > 0
    ),
    'L0_ADB_LAUNCH_PROCESS_IDS_INVALID'
  );
  const binding = expected.launchReceipt;
  assert.ok(binding && typeof binding.path === 'string', 'L0_ADB_LAUNCH_RECEIPT_REQUIRED');
  const metadata = lstatSync(binding.path);
  assert.ok(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.nlink === 1 &&
      metadata.uid === process.getuid() &&
      (metadata.mode & 0o777) === 0o600,
    'L0_ADB_LAUNCH_RECEIPT_NOT_PRIVATE'
  );
  assert.equal(realpathSync(binding.path), binding.realpath, 'L0_ADB_LAUNCH_RECEIPT_PATH_CHANGED');
  const bytes = readFileSync(binding.path);
  assert.equal(bytes.length, binding.bytes, 'L0_ADB_LAUNCH_RECEIPT_SIZE_CHANGED');
  assert.equal(digest(bytes), binding.sha256, 'L0_ADB_LAUNCH_RECEIPT_CHANGED');
  const record = JSON.parse(bytes);
  assert.equal(record.schema, ADB_SERVER_LAUNCH_SCHEMA, 'L0_ADB_LAUNCH_SCHEMA_INVALID');
  assert.equal(record.owner, 'L0', 'L0_ADB_LAUNCH_OWNER_INVALID');
  assert.equal(record.unitNonce, lease.unitNonce, 'L0_ADB_LAUNCH_UNIT_CHANGED');
  assert.equal(record.clientSha256, lease.adbSha256, 'L0_ADB_LAUNCH_CLIENT_CHANGED');
  assert.deepEqual(record.argv, isolatedServerArgv(lease), 'L0_ADB_LAUNCH_ARGUMENTS_CHANGED');
  assert.equal(record.targetPid, expected.pid, 'L0_ADB_LAUNCH_PID_CHANGED');
  assert.equal(record.gateIdentity?.status, 'observed', 'L0_ADB_LAUNCH_GATE_UNQUALIFIED');
  assert.equal(record.gateIdentity.pid, expected.ppid, 'L0_ADB_LAUNCH_PARENT_CHANGED');
  assert.equal(record.gateIdentity.pgid, expected.pgid, 'L0_ADB_LAUNCH_GROUP_CHANGED');
  assert.equal(record.gateIdentity.pid, record.gateIdentity.pgid, 'L0_ADB_LAUNCH_GROUP_INVALID');
  const gateInput = lease.runnerInputs?.find((input) =>
    input.path.endsWith('/run-command-gate.mjs')
  );
  assert.ok(gateInput, 'L0_ADB_LAUNCH_GATE_SOURCE_REQUIRED');
  for (const field of ['path', 'bytes', 'sha256'])
    assert.equal(record.gateSource?.[field], gateInput[field], 'L0_ADB_LAUNCH_GATE_SOURCE_CHANGED');
  assert.equal(
    record.gateIdentity.argv,
    [process.execPath, gateInput.path].join(' '),
    'L0_ADB_LAUNCH_GATE_ARGUMENTS_CHANGED'
  );
  assert.equal(expected.argv, record.argv.join(' '), 'L0_ADB_LAUNCH_EXECUTABLE_ARGUMENTS_CHANGED');
  assert.equal(record.identity?.status, 'observed', 'L0_ADB_LAUNCH_PROCESS_UNQUALIFIED');
  for (const field of ['pid', 'ppid', 'pgid', 'birth', 'argv'])
    assert.equal(
      record.identity[field],
      expected[field],
      `L0_ADB_LAUNCH_${field.toUpperCase()}_CHANGED`
    );
  return expected;
}

function selectedClient(context) {
  const expected = requireIsolatedServerLease(context.lease);
  const path = context.lease.adbPath;
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'L0_ADB_CLIENT_TYPE_CHANGED');
  assert.equal(realpathSync(path), expected.executable, 'L0_ADB_CLIENT_PATH_CHANGED');
  assert.equal(digest(readFileSync(path)), context.lease.adbSha256, 'L0_ADB_CLIENT_CHANGED');
  assert.equal(stat.dev, expected.device, 'L0_ADB_CLIENT_DEVICE_CHANGED');
  assert.equal(stat.ino, expected.inode, 'L0_ADB_CLIENT_INODE_CHANGED');
  return expected;
}

async function hostVersion(context, expected, name) {
  const observation = {
    requestHex: HOST_VERSION_REQUEST.toString('hex'),
    receivedHex: '',
    closed: false,
  };
  const socket = createConnection({ host: '127.0.0.1', port: expected.port });
  const closed = new Promise((resolve) =>
    socket.once('close', () => {
      observation.closed = true;
      resolve();
    })
  );
  let timer, closeTimer, failure;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('L0_ADB_PROTOCOL_DEADLINE')),
        commandRemainingMs(context, PROBE_DEADLINE_MS)
      );
      socket.once('error', reject);
      socket.once('connect', () => socket.write(HOST_VERSION_REQUEST));
      socket.on('data', (bytes) => {
        observation.receivedHex += bytes.toString('hex');
        const received = Buffer.from(observation.receivedHex, 'hex');
        if (received.length >= 12) {
          try {
            assert.equal(received.length, 12, 'L0_ADB_PROTOCOL_UNEXPECTED_BYTES');
            assert.equal(
              received.subarray(0, 8).toString(),
              'OKAY0004',
              'L0_ADB_PROTOCOL_RESPONSE_INVALID'
            );
            assert.match(
              received.subarray(8).toString(),
              /^[a-fA-F0-9]{4}$/,
              'L0_ADB_PROTOCOL_VERSION_INVALID'
            );
            observation.protocol = parseInt(received.subarray(8).toString(), 16);
            assert.equal(observation.protocol, expected.protocol, 'L0_ADB_PROTOCOL_CHANGED');
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
      socket.once('end', () => {
        if (Buffer.from(observation.receivedHex, 'hex').length !== 12)
          reject(new Error('L0_ADB_PROTOCOL_INCOMPLETE'));
      });
    });
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timer);
    socket.destroy();
    try {
      await Promise.race([
        closed,
        new Promise((_, reject) => {
          closeTimer = setTimeout(
            () => reject(new Error('L0_ADB_PROTOCOL_CHANNEL_UNSETTLED')),
            commandRemainingMs(context, PROTOCOL_CLOSE_DEADLINE_MS)
          );
        }),
      ]);
    } catch (error) {
      failure = failure ? new AggregateError([failure, error]) : error;
    }
    clearTimeout(closeTimer);
    observation.failure = failure ? String(failure) : null;
    evidence(context, name, JSON.stringify(observation, null, 2) + '\n');
  }
  if (failure) throw failure;
  return observation;
}

/**
 * External native service supervision uses this guard before device boot and during cleanup.
 * @public
 */
export async function qualifyAdbServer(context, boundary) {
  assert.equal(process.platform, 'darwin', 'L0_OWNED_ADB_GUARD_REQUIRES_MACOS');
  const expected = selectedClient(context);
  const probe = async (path, args) => {
    const output = await capturedCommand(context, path, args, PROBE_DEADLINE_MS);
    const call = context.calls.at(-1);
    assert.equal(
      readFileSync(join(context.root, `${call.id}.stderr.raw.txt`)).length,
      0,
      'L0_ADB_INSPECTION_STDERR_UNOBSERVABLE'
    );
    return output;
  };
  const psArgs = [
    '-ww',
    '-p',
    String(expected.pid),
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
  ];
  const before = requireExpectedServerIdentity(await probe('/bin/ps', psArgs), expected);
  const listeners = lsofRecords(
    await probe('/usr/sbin/lsof', ['-nP', `-iTCP:${expected.port}`, '-sTCP:LISTEN', '-Fpftn']),
    'listener'
  );
  assert.ok(
    listeners.every(
      (row) =>
        row.pid === expected.pid &&
        ['IPv4', 'IPv6'].includes(row.t) &&
        row.n === `127.0.0.1:${expected.port}`
    ),
    'L0_ADB_LISTENER_OWNERSHIP_CHANGED'
  );
  const mappings = lsofRecords(
    await probe('/usr/sbin/lsof', ['-a', '-p', String(expected.pid), '-d', 'txt', '-FpftDin']),
    'executable'
  );
  const executable = mappings.filter((row) => row.n === expected.executable);
  assert.ok(
    executable.length === 1 &&
      executable[0].pid === expected.pid &&
      executable[0].t === 'REG' &&
      /^[0-9]+$/.test(executable[0].i) &&
      /^0x[a-fA-F0-9]+$/.test(executable[0].D) &&
      Number(executable[0].i) === expected.inode &&
      parseInt(executable[0].D, 16) === expected.device,
    'L0_ADB_SERVER_EXECUTABLE_CHANGED'
  );
  const protocol = await hostVersion(context, expected, `${boundary}.protocol.json.txt`);
  const after = requireExpectedServerIdentity(await probe('/bin/ps', psArgs), expected);
  selectedClient(context);
  evidence(
    context,
    `${boundary}.guard.json.txt`,
    JSON.stringify(
      {
        before,
        after,
        listeners,
        executable: executable[0],
        protocol,
        serverOwnedByL0: true,
        launchReceipt: expected.launchReceipt,
        signals: [],
      },
      null,
      2
    ) + '\n'
  );
}

export async function guardedAdbCommand(context, args) {
  const boundary = `adb-${String((context.adbBoundaryCount ?? 0) + 1).padStart(3, '0')}`;
  context.adbBoundaryCount = (context.adbBoundaryCount ?? 0) + 1;
  assert.ok(!context.adbServerUnresolved, 'L0_ADB_SERVER_UNRESOLVED_NO_FURTHER_CONSUMPTION');
  try {
    await qualifyAdbServer(context, `${boundary}-before`);
  } catch (error) {
    context.adbServerUnresolved = String(error);
    throw error;
  }
  let output, primary, after;
  const sdkCallIndex = context.calls.length;
  try {
    output = await capturedCommand(context, context.lease.adbPath, [
      '-H',
      '127.0.0.1',
      '-P',
      String(context.lease.adbServer.port),
      '-s',
      context.lease.device,
      ...args,
    ]);
  } catch (error) {
    primary = error;
  } finally {
    context.lastAdbCall = context.calls[sdkCallIndex];
  }
  const priorPhase = context.phase;
  context.phase = 'cleanup';
  try {
    await qualifyAdbServer(context, `${boundary}-after`);
  } catch (error) {
    context.adbServerUnresolved = String(error);
    after = error;
  } finally {
    context.phase = priorPhase;
  }
  if (primary && after)
    throw new AggregateError([primary, after], 'L0_ADB_PRIMARY_AND_SERVER_FAILURE');
  if (primary || after) throw primary ?? after;
  return output;
}
