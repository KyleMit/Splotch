import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidCommand } from '../android-command.mjs';
import { finishEvidence, COMMAND_CHILD_LEDGER } from '../command-evidence.mjs';
import { COMMAND_FAILURE_PHASES, serializeCommandError } from '../command-failure.mjs';
import { digest } from '../contract.mjs';

const adbControl = vi.hoisted(() => vi.fn());
vi.mock('../adb-server.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  guardedAdbCommand: adbControl,
}));

function context(root, socket) {
  return {
    root,
    calls: [],
    artifacts: [],
    lease: {
      adbPath: process.execPath,
      adbSha256: digest(readFileSync(process.execPath)),
      port: 40001,
      device: 'emulator-5660',
    },
    cdpConnections: [{ socket, wire: join(root, 'unused-wire.jsonl.txt') }],
  };
}

describe('legacy primary and cleanup error evidence', () => {
  it('preserves the real command and nested cleanup causes, then restores command-only failure evidence', async () => {
    const primary = new Error('actual primary fixture refusal');
    const cleanup = new Error('actual CDP close refusal', {
      cause: new Error('secondary channel cause'),
    });
    adbControl.mockRejectedValue(primary);
    const failedRoot = mkdtempSync(join(tmpdir(), 'splotch-l0-failure-phases-'));
    const restoredRoot = mkdtempSync(join(tmpdir(), 'splotch-l0-failure-restored-'));
    try {
      const failed = context(failedRoot, {
        close() {
          throw cleanup;
        },
        readyState: 1,
      });
      let actual;
      try {
        await androidCommand(failed);
      } catch (error) {
        actual = error;
      }
      expect(actual).toBeInstanceOf(AggregateError);
      expect(actual.errors[0]).toBe(primary);
      expect(actual.errors[1].errors).toEqual([cleanup]);
      expect(failed.failurePhases.map((row) => row.phase)).toEqual([
        COMMAND_FAILURE_PHASES.command,
        COMMAND_FAILURE_PHASES.cdpCleanup,
      ]);
      writeFileSync(join(failedRoot, COMMAND_CHILD_LEDGER), '');
      finishEvidence(failed, 'failed', {
        error: serializeCommandError(actual),
        phases: failed.failurePhases,
      });
      const saved = JSON.parse(readFileSync(join(failedRoot, 'outcome.json.txt')));
      expect(saved.detail.error.errors[1].errors[0]).toEqual({
        name: 'Error',
        message: cleanup.message,
        cause: { name: 'Error', message: cleanup.cause.message },
      });
      expect(saved.detail.phases).toEqual(failed.failurePhases);
      const restored = context(restoredRoot, undefined);
      restored.cdpConnections = [];
      await expect(androidCommand(restored)).rejects.toBe(primary);
      expect(restored.failurePhases).toEqual([
        {
          phase: COMMAND_FAILURE_PHASES.command,
          error: { name: 'Error', message: primary.message },
        },
      ]);
      expect(serializeCommandError(primary)).toEqual({ name: 'Error', message: primary.message });
    } finally {
      adbControl.mockReset();
      rmSync(failedRoot, { recursive: true });
      rmSync(restoredRoot, { recursive: true });
    }
  });

  it('retains nested aggregate children without reducing the root to a generic message', () => {
    const primary = new Error('source primary');
    const cleanup = new AggregateError(
      [new Error('forward owner changed'), new Error('channel unsettled')],
      'cleanup'
    );
    const value = serializeCommandError(
      new AggregateError([primary, cleanup], 'fixture and cleanup')
    );
    expect(value).toEqual({
      name: 'AggregateError',
      message: 'fixture and cleanup',
      errors: [
        { name: 'Error', message: 'source primary' },
        {
          name: 'AggregateError',
          message: 'cleanup',
          errors: [
            { name: 'Error', message: 'forward owner changed' },
            { name: 'Error', message: 'channel unsettled' },
          ],
        },
      ],
    });
  });
});
