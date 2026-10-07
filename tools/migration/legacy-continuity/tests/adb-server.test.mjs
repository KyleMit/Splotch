import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { digest } from '../contract.mjs';
import {
  lsofRecords,
  requireExpectedServerIdentity,
  requireIsolatedServerLease,
  isolatedServerArgv,
  ADB_SERVER_LAUNCH_SCHEMA,
} from '../adb-server.mjs';

const SERVER = {
  pid: 60376,
  ppid: 60375,
  pgid: 60375,
  birth: 'Thu Sep 24 22:56:56 2026',
  argv: '/selected/sdk/adb -L tcp:127.0.0.1:54285 server nodaemon',
};
const PROCESS = `${SERVER.pid} ${SERVER.ppid} ${SERVER.pgid} ${SERVER.birth} ${SERVER.argv}\n`;
const EXECUTABLE = 'p60376\nftxt\ntREG\nD0x100000e\ni1083174\nn/selected/sdk/adb\n';
const LISTENER = 'p60376\nf10\ntIPv4\nn127.0.0.1:54285\n';

describe('legacy owned isolated adb ownership frames', () => {
  it.each([
    ['duplicate inode', EXECUTABLE.replace('i1083174', 'i1083174\ni1083174')],
    ['missing device', EXECUTABLE.replace('D0x100000e\n', '')],
    ['header only', 'p60376\n'],
    ['missing descriptor', EXECUTABLE.replace('ftxt\n', '')],
    ['missing process', EXECUTABLE.replace('p60376\n', '')],
    ['duplicate process', EXECUTABLE + EXECUTABLE],
    ['truncated frame', EXECUTABLE.slice(0, -1)],
    ['empty field', EXECUTABLE.replace('tREG', 't')],
  ])('refuses %s and restores the complete executable mapping', (_, frame) => {
    expect(() => lsofRecords(Buffer.from(frame), 'executable')).toThrow(/L0_LSOF_/);
    expect(lsofRecords(Buffer.from(EXECUTABLE), 'executable')).toEqual([
      {
        pid: SERVER.pid,
        descriptor: 'txt',
        t: 'REG',
        D: '0x100000e',
        i: '1083174',
        n: '/selected/sdk/adb',
      },
    ]);
  });

  it('keeps listener frames separate from executable frames', () => {
    expect(lsofRecords(Buffer.from(LISTENER), 'listener')[0]).toMatchObject({
      pid: SERVER.pid,
      t: 'IPv4',
    });
    expect(() => lsofRecords(Buffer.from(LISTENER), 'executable')).toThrow(/FIELDS_MISSING/);
    expect(lsofRecords(Buffer.from(EXECUTABLE), 'executable')[0].t).toBe('REG');
  });

  it.each(['pid', 'ppid', 'pgid', 'birth', 'argv'])(
    'refuses a changed %s and restores the preserved owned process',
    (field) => {
      const changed = {
        ...SERVER,
        [field]: typeof SERVER[field] === 'number' ? SERVER[field] + 1 : 'changed',
      };
      expect(() => requireExpectedServerIdentity(Buffer.from(PROCESS), changed)).toThrow(
        /L0_ADB_SERVER_/
      );
      expect(requireExpectedServerIdentity(Buffer.from(PROCESS), SERVER)).toMatchObject(SERVER);
    }
  );

  it('refuses unavailable process output before returning an owned identity', () => {
    expect(() => requireExpectedServerIdentity(Buffer.from(''), SERVER)).toThrow(/UNOBSERVABLE/);
    expect(requireExpectedServerIdentity(Buffer.from(PROCESS), SERVER).pid).toBe(SERVER.pid);
  });
});

describe('legacy isolated adb launch association', () => {
  function launchLease() {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'splotch-l0-isolated-launch-'));
    const path = join(root, 'launch.json.txt');
    const lease = {
      unitNonce: 'a'.repeat(32),
      adbPath: '/selected/sdk/adb',
      adbSha256: 'b'.repeat(64),
      adbServer: { ...SERVER, owner: 'L0', scope: 'owned-isolated', protocol: 41, port: 54285 },
    };
    const gatePath = fileURLToPath(new URL('../run-command-gate.mjs', import.meta.url));
    const gateBytes = readFileSync(gatePath);
    const gateSource = { path: gatePath, bytes: gateBytes.length, sha256: digest(gateBytes) };
    lease.runnerInputs = [gateSource];
    const record = {
      gateSource,
      schema: ADB_SERVER_LAUNCH_SCHEMA,
      owner: 'L0',
      unitNonce: lease.unitNonce,
      clientSha256: lease.adbSha256,
      argv: isolatedServerArgv(lease),
      targetPid: SERVER.pid,
      gateIdentity: {
        status: 'observed',
        pid: SERVER.ppid,
        pgid: SERVER.pgid,
        argv: [process.execPath, gatePath].join(' '),
      },
      identity: { status: 'observed', ...SERVER },
    };
    writeFileSync(path, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
    const bytes = readFileSync(path);
    lease.adbServer.launchReceipt = {
      path,
      realpath: realpathSync(path),
      bytes: bytes.length,
      sha256: digest(bytes),
    };
    return { root, lease };
  }

  it.each([
    [
      'default port',
      (lease) => {
        lease.adbServer.port = 5037;
      },
    ],
    [
      'foreign owner',
      (lease) => {
        lease.adbServer.owner = 'foreign';
      },
    ],
    [
      'changed process',
      (lease) => {
        lease.adbServer.birth = 'changed';
      },
    ],
    [
      'changed unit',
      (lease) => {
        lease.unitNonce = 'c'.repeat(32);
      },
    ],
    [
      'changed launch binding',
      (lease) => {
        lease.adbServer.launchReceipt.sha256 = 'd'.repeat(64);
      },
    ],
    [
      'absent launch binding',
      (lease) => {
        delete lease.adbServer.launchReceipt;
      },
    ],
    [
      'changed gate source',
      (lease) => {
        lease.runnerInputs[0].sha256 = 'e'.repeat(64);
      },
    ],
  ])('refuses %s before SDK admission and restores the owned launch', (_, mutate) => {
    const { root, lease } = launchLease();
    try {
      const changed = structuredClone(lease);
      mutate(changed);
      expect(() => requireIsolatedServerLease(changed)).toThrow(/L0_ADB_/);
      expect(requireIsolatedServerLease(lease)).toEqual(lease.adbServer);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
