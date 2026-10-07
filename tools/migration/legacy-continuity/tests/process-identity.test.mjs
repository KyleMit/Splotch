import { describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  captureProcessIdentity,
  releaseOwnedCommandGroup,
  requireLiveCommandOwner,
} from '../process-ownership.mjs';
import { controlGroupObservation } from './process-group-observation.mjs';

const psControl = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  psControl.mockImplementation(actual.spawnSync);
  return { ...actual, spawnSync: psControl };
});

const CHILD_LIFETIME_MS = 5_000;
const CONTROL_DEADLINE_MS = 10_000;
const IDENTITY_DEADLINE_MS = 1_000;

const mutations = [
  [
    'successful diagnostic stderr',
    (row) => ({ ...row, stderr: Buffer.from('permission diagnostic\n') }),
  ],
  [
    'malformed UTF8 argv',
    (row) => ({
      ...row,
      stdout: Buffer.concat([row.stdout.subarray(0, -2), Buffer.from([0xff, 0x0a])]),
    }),
  ],
  ['nonzero status', (row) => ({ ...row, status: 1 })],
  ['incomplete status', (row) => ({ ...row, status: null })],
  ['missing status', (row) => ({ ...row, status: undefined })],
  ['reported signal', (row) => ({ ...row, signal: 'SIGTERM' })],
  ['reported error', (row) => ({ ...row, error: new Error('observed process query error') })],
  ['duplicate rows', (row) => ({ ...row, stdout: Buffer.concat([row.stdout, row.stdout]) })],
  [
    'wrong requested PID',
    (row) => ({
      ...row,
      stdout: Buffer.from(row.stdout.toString('utf8').replace(/^\s*\d+/, '999999')),
    }),
  ],
];

describe('legacy process identity result boundary', () => {
  it(
    'refuses each incomplete observation before signaling and restores the actual owned identity',
    async () => {
      const actual = await vi.importActual('node:child_process');
      const child = spawn(
        process.execPath,
        ['-e', `process.stdout.write('ready');setTimeout(() => {}, ${CHILD_LIFETIME_MS});`],
        {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      const exited = once(child, 'exit');
      await once(child.stdout, 'data');
      const call = {
        pid: child.pid,
        identity: captureProcessIdentity(child.pid, IDENTITY_DEADLINE_MS),
      };
      expect(call.identity).toMatchObject({
        status: 'observed',
        pid: child.pid,
        ppid: process.pid,
        pgid: child.pid,
      });
      const realKill = process.kill.bind(process);
      const signals = vi.spyOn(process, 'kill').mockImplementation(realKill);
      try {
        for (const [name, change] of mutations) {
          psControl.mockImplementation((...argv) => change(actual.spawnSync(...argv)));
          expect(captureProcessIdentity(child.pid, IDENTITY_DEADLINE_MS).status, name).toBe(
            'unavailable'
          );
          await expect(releaseOwnedCommandGroup(call)).rejects.toThrow(
            'L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL'
          );
          expect(
            signals.mock.calls.every(([pid, signal]) => pid === -child.pid && signal === 0),
            name
          ).toBe(true);
          psControl.mockImplementation(actual.spawnSync);
          expect(captureProcessIdentity(child.pid, IDENTITY_DEADLINE_MS)).toMatchObject(
            call.identity
          );
          expect(() => requireLiveCommandOwner(call)).not.toThrow();
        }
      } finally {
        psControl.mockImplementation(actual.spawnSync);
        signals.mockRestore();
        await exited;
        expect(controlGroupObservation(child.pid).status).toBe('absent');
      }
    },
    CONTROL_DEADLINE_MS
  );
});
