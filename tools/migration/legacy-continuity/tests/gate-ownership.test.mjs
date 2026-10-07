import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { capturedCommand } from '../command-evidence.mjs';
import { controlGroupObservation } from './process-group-observation.mjs';
import { digest } from '../contract.mjs';

const START_DEADLINE_MS = 2_000;
const CHILD_LIFETIME_MS = 1_000;
const DRAIN_DEADLINE_MS = 3_000;
const POLL_INTERVAL_MS = 25;
const IDENTITY_DEADLINE_MS = 1_000;

function groupExists(pid) {
  return controlGroupObservation(pid).status !== 'absent';
}

async function until(predicate, deadline) {
  while (!predicate() && Date.now() < deadline) await delay(POLL_INTERVAL_MS);
}

describe('legacy command stable leader', () => {
  it('captures an immediate target with separate gate identity and natural complete channels', async () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-fast-gate-control-'));
    const context = { root: owned, calls: [], artifacts: [] };
    try {
      const bytes = await capturedCommand(context, process.execPath, [
        '-e',
        "process.stdout.write('fast-output'); process.stderr.write('fast-error');",
      ]);
      const call = context.calls[0];
      expect(bytes.toString()).toBe('fast-output');
      expect(readFileSync(join(owned, '001.stderr.raw.txt'), 'utf8')).toBe('fast-error');
      expect(call.ownerRole).toBe('command-gate');
      expect(call.identity.pid).toBe(call.pid);
      expect(call.identity.ppid).toBe(process.pid);
      expect(call.identity.pgid).toBe(call.pid);
      expect(call.targetPid).not.toBe(call.pid);
      expect(call.targetResult).toMatchObject({
        kind: 'exit',
        pid: call.targetPid,
        code: 0,
        signal: null,
      });
      expect(call.gateSource.sha256).toBe(digest(readFileSync(call.gatePath)));
      expect(call.groupAbsent).toBe(true);
      expect(
        context.artifacts.map((artifact) => [artifact.complete, artifact.streamCompletion])
      ).toEqual([
        [true, 'natural-eof'],
        [true, 'natural-eof'],
      ]);
    } finally {
      if (context.calls.every((call) => !call.pid || !groupExists(call.pid)))
        rmSync(owned, { recursive: true });
    }
  });

  it('refuses a natural orphan before its inherited channels can close and restores a fast positive', async () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-inherited-output-control-'));
    const context = { root: owned, calls: [], artifacts: [] };
    const script = `const {spawn}=require('node:child_process'); spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${CHILD_LIFETIME_MS})'], {stdio:'inherit'}); process.exit(0);`;
    try {
      await expect(capturedCommand(context, process.execPath, ['-e', script])).rejects.toThrow(
        /L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL/
      );
      const call = context.calls[0];
      expect(call.targetResult).toMatchObject({ kind: 'exit', code: 0, signal: null });
      expect(call.naturalGroupChecks[0].groupPresent).toBe(true);
      expect(call.channelEndBeforeFinalization).toEqual({ stdout: false, stderr: false });
      expect(call.groupAbsent).toBe(false);
      expect(
        context.artifacts.map((artifact) => [artifact.complete, artifact.streamCompletion])
      ).toEqual([
        [false, 'forced-or-unsettled'],
        [false, 'forced-or-unsettled'],
      ]);
      await until(() => !groupExists(call.pid), Date.now() + DRAIN_DEADLINE_MS);
      expect(groupExists(call.pid)).toBe(false);
      expect(
        (
          await capturedCommand(context, process.execPath, [
            '-e',
            "process.stdout.write('restored');",
          ])
        ).toString()
      ).toBe('restored');
      expect(context.calls.at(-1).groupAbsent).toBe(true);
    } finally {
      if (context.calls.every((call) => !call.pid || !groupExists(call.pid)))
        rmSync(owned, { recursive: true });
    }
  });

  it('refuses a proved owned gate loss with a surviving target and restores a fast positive', async () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-gate-loss-control-'));
    const context = { root: owned, calls: [], artifacts: [] };
    try {
      const pending = capturedCommand(context, process.execPath, [
        '-e',
        `setTimeout(() => {}, ${CHILD_LIFETIME_MS});`,
      ]);
      pending.catch(() => {});
      await until(
        () => context.calls[0]?.identity?.status === 'observed' && context.calls[0]?.targetPid,
        Date.now() + START_DEADLINE_MS
      );
      const call = context.calls[0];
      expect(call.identity.status).toBe('observed');
      expect(call.identity.ppid).toBe(process.pid);
      expect(call.identity.pgid).toBe(call.pid);
      const live = execFileSync(
        '/bin/ps',
        [
          '-ww',
          '-p',
          String(call.pid),
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
        { encoding: 'utf8', timeout: IDENTITY_DEADLINE_MS, env: { ...process.env, LC_ALL: 'C' } }
      );
      expect(live.trim()).toBe(call.identity.raw.trim());
      process.kill(call.pid, 'SIGKILL');
      let failure;
      try {
        await pending;
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      expect(failure.errors).toHaveLength(2);
      expect(failure.errors[0].message).toMatch(/^L0_GATE_(EXIT_BEFORE_RELEASE|DISCONNECTED)$/);
      expect(String(failure.errors[1])).toContain('L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL');
      expect(call.gateFailure).toBe(String(failure.errors[0]));
      expect(call.gateFailures[0].reason).toBe(call.gateFailure);
      expect(call.groupAbsent).toBe(false);
      expect(context.artifacts.every((artifact) => artifact.complete === false)).toBe(true);
      expect(call.channelEndBeforeFinalization).toEqual({ stdout: false, stderr: false });
      expect(context.artifacts.map((artifact) => artifact.streamCompletion)).toEqual([
        'forced-or-unsettled',
        'forced-or-unsettled',
      ]);
      await until(() => !groupExists(call.pid), Date.now() + DRAIN_DEADLINE_MS);
      expect(groupExists(call.pid)).toBe(false);
      expect(
        (
          await capturedCommand(context, process.execPath, [
            '-e',
            "process.stdout.write('restored');",
          ])
        ).toString()
      ).toBe('restored');
      expect(context.calls.at(-1).groupAbsent).toBe(true);
    } finally {
      if (context.calls.every((call) => !call.pid || !groupExists(call.pid)))
        rmSync(owned, { recursive: true });
    }
  });
});
