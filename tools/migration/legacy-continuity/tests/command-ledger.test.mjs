import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  capturedCommand,
  settleCommandChildren,
  COMMAND_CHILD_LEDGER,
} from '../command-evidence.mjs';
import {
  configureCommandTiming,
  commandRemainingMs,
  beginCommandCleanup,
} from '../command-timing.mjs';

const ledgerControl = vi.hoisted(() => ({ refuseQualifiedWrite: false }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    writeSync: (fd, bytes, ...args) => {
      if (
        ledgerControl.refuseQualifiedWrite &&
        JSON.parse(bytes.toString()).phase === 'gate-qualified'
      )
        return 0;
      return actual.writeSync(fd, bytes, ...args);
    },
  };
});

const FAILURE_EXIT = 7;
const CONTROL_DEADLINE_MS = 3_000;
const CUT_DELAY_MS = 100;

describe('legacy inner command admission and ledger', () => {
  it.each([0, FAILURE_EXIT])(
    'records ownership before the target starts and preserves exit %i through independent settlement',
    async (code) => {
      const root = mkdtempSync(join(tmpdir(), 'splotch-l0-ledger-control-'));
      const context = { root, calls: [], artifacts: [] };
      const ledger = join(root, COMMAND_CHILD_LEDGER);
      const script = `const fs=require('node:fs');const rows=fs.readFileSync(${JSON.stringify(ledger)},'utf8').trim().split('\\n').map(JSON.parse);if(!rows.some(row=>row.phase==='gate-qualified'&&row.call.identity.pid===row.call.pid))process.exit(9);process.stdout.write('qualified-before-target',()=>process.exit(${code}));`;
      try {
        let failure;
        try {
          await capturedCommand(context, process.execPath, ['-e', script]);
        } catch (error) {
          failure = error;
        }
        expect(
          failure && { code: failure.code, actual: failure.actual, expected: failure.expected }
        ).toEqual(code === 0 ? undefined : { code: 'ERR_ASSERTION', actual: code, expected: 0 });
        expect(failure?.message?.split('\n')[0]).toBe(
          code === 0 ? undefined : `L0_COMMAND_EXIT_REFUSED: ${code}`
        );
        expect(readFileSync(join(root, '001.stdout.raw.txt'), 'utf8')).toBe(
          'qualified-before-target'
        );
        await settleCommandChildren(context);
        const rows = readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
        const phases = rows.map((row) => row.phase);
        expect(phases.indexOf('gate-spawned')).toBeLessThan(phases.indexOf('gate-qualified'));
        expect(phases.indexOf('gate-qualified')).toBeLessThan(phases.indexOf('target-started'));
        expect(rows.at(-1).phase).toBe('independently-settled');
        expect(rows.at(-1).call.targetResult.code).toBe(code);
        expect(rows.at(-1).call.finalGroupObservation.status).toBe('absent');
      } finally {
        if (context.calls.every((call) => call.groupAbsent)) rmSync(root, { recursive: true });
      }
    },
    CONTROL_DEADLINE_MS
  );

  it('refuses expired work before spawning a child and restores a bounded positive', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-l0-cut-control-'));
    const context = { root, calls: [], artifacts: [], phase: 'work', workDeadline: Date.now() - 1 };
    try {
      await expect(
        capturedCommand(context, process.execPath, ['-e', 'process.exit(0)'])
      ).rejects.toThrow(/PHASE_DEADLINE/);
      expect(context.calls).toHaveLength(0);
      context.workDeadline = Date.now() + CONTROL_DEADLINE_MS;
      expect(
        (
          await capturedCommand(context, process.execPath, [
            '-e',
            "process.stdout.write('restored');",
          ])
        ).toString()
      ).toBe('restored');
    } finally {
      if (context.calls.every((call) => call.groupAbsent)) rmSync(root, { recursive: true });
    }
  });

  it('keeps cancellation and cleanup cuts anchored to the original lease', () => {
    const start = Date.now();
    const context = configureCommandTiming(
      {
        workExpiresAt: new Date(start + CUT_DELAY_MS).toISOString(),
        cleanupExpiresAt: new Date(start + CUT_DELAY_MS * 2).toISOString(),
        expiresAt: new Date(start + CUT_DELAY_MS * 3).toISOString(),
      },
      'android'
    );
    context.workCancelled = true;
    expect(() => commandRemainingMs(context, CUT_DELAY_MS)).toThrow(/WORK_CANCELLED/);
    beginCommandCleanup(context);
    expect(commandRemainingMs(context, CUT_DELAY_MS)).toBeGreaterThan(0);
    context.cleanupDeadline = Date.now() - 1;
    expect(() => commandRemainingMs(context, CUT_DELAY_MS)).toThrow(/PHASE_DEADLINE/);
  });
});

it(
  'refuses a nonprogressing qualified ledger write before target start and restores actual execution',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-l0-ledger-refusal-'));
    const context = { root, calls: [], artifacts: [] };
    ledgerControl.refuseQualifiedWrite = true;
    try {
      await expect(
        capturedCommand(context, process.execPath, ['-e', "process.stdout.write('unadmitted');"])
      ).rejects.toThrow(/LEDGER_WRITE_NO_PROGRESS/);
      expect(context.calls[0].targetPid).toBeUndefined();
      expect(context.calls[0].ledgerFailure).toContain('LEDGER_WRITE_NO_PROGRESS');
      expect(readFileSync(join(root, '001.stdout.raw.txt'), 'utf8')).toBe('');
      ledgerControl.refuseQualifiedWrite = false;
      expect(
        (
          await capturedCommand(context, process.execPath, [
            '-e',
            "process.stdout.write('restored-ledger');",
          ])
        ).toString()
      ).toBe('restored-ledger');
      await settleCommandChildren(context);
      expect(context.calls.every((call) => call.groupAbsent)).toBe(true);
    } finally {
      ledgerControl.refuseQualifiedWrite = false;
      if (context.calls.every((call) => call.groupAbsent)) rmSync(root, { recursive: true });
    }
  },
  CONTROL_DEADLINE_MS * 2
);
