import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capturedCommand, finishEvidence } from '../command-evidence.mjs';
import { digest } from '../contract.mjs';
import { controlGroupObservation } from './process-group-observation.mjs';

const FAILED_EXIT_CODE = 7;
const OUTPUT_BYTES = 'indeterminate-owner-output';

describe('legacy command indeterminate group observation', () => {
  it.each([0, FAILED_EXIT_CODE])(
    'preserves target exit %i and finalized evidence when group probes refuse, then restores a positive',
    async (exitCode) => {
      const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-group-observation-control-'));
      const context = { root: owned, calls: [], artifacts: [] };
      const actualKill = process.kill.bind(process);
      const denied = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid < 0 && signal === 0)
          throw Object.assign(new Error('L0_CONTROL_GROUP_PROBE_DENIED'), { code: 'EPERM' });
        return actualKill(pid, signal);
      });
      try {
        let failure;
        try {
          await capturedCommand(context, process.execPath, [
            '-e',
            `process.stdout.write('${OUTPUT_BYTES}', () => process.exit(${exitCode}));`,
          ]);
        } catch (error) {
          failure = error;
        }
        const failures = failure instanceof AggregateError ? failure.errors : [failure];
        const expectedFailures =
          exitCode === 0
            ? ['L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL']
            : [`L0_COMMAND_EXIT_REFUSED: ${exitCode}`, 'L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL'];
        expect(failures.map((error) => error?.message.split('\n')[0])).toEqual(expectedFailures);
        const call = context.calls[0];
        expect(call.targetResult).toMatchObject({ kind: 'exit', code: exitCode, signal: null });
        expect(call.groupAbsent).toBe(false);
        expect(call.groupObservations.at(-1)).toMatchObject({
          status: 'indeterminate',
          code: 'EPERM',
        });
        expect(call.unresolvedOwnership).toContain('L0_PROCESS_GROUP_UNOBSERVABLE_NO_SIGNAL');
        expect(denied.mock.calls.every(([pid, signal]) => pid < 0 && signal === 0)).toBe(true);
        expect(context.artifacts).toHaveLength(2);
        for (const artifact of context.artifacts) {
          const bytes = readFileSync(join(owned, artifact.path));
          expect(artifact).toMatchObject({
            bytes: bytes.length,
            sha256: digest(bytes),
            complete: false,
          });
        }
        expect(readFileSync(join(owned, '001.stdout.raw.txt'), 'utf8')).toBe(OUTPUT_BYTES);
        expect(JSON.parse(readFileSync(join(owned, 'commands.json.txt'), 'utf8'))).toEqual(
          context.calls
        );
        finishEvidence(context, 'failed', String(failure));
        expect(
          JSON.parse(readFileSync(join(owned, 'outcome.json.txt'), 'utf8')).commands[0]
        ).toEqual(call);
        denied.mockRestore();
        expect(controlGroupObservation(call.pid).status).toBe('absent');
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
        denied.mockRestore();
        if (context.calls.every((call) => controlGroupObservation(call.pid).status === 'absent'))
          rmSync(owned, { recursive: true });
      }
    }
  );
});
