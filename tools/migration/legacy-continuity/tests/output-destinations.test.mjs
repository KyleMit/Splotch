import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { capturedCommand } from '../command-evidence.mjs';
import { digest } from '../contract.mjs';

const ioControl = vi.hoisted(() => ({ writeDelayMs: 0, closeDelayMs: 0, streams: [] }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createWriteStream(path, options) {
      if (!path.endsWith('/001.stdout.raw.txt')) return actual.createWriteStream(path, options);
      const stream = actual.createWriteStream(path, {
        ...options,
        fs: {
          ...actual,
          write(...args) {
            setTimeout(() => actual.write(...args), ioControl.writeDelayMs);
          },
          writev(...args) {
            setTimeout(() => actual.writev(...args), ioControl.writeDelayMs);
          },
          close(...args) {
            setTimeout(() => actual.close(...args), ioControl.closeDelayMs);
          },
        },
      });
      ioControl.streams.push(stream);
      return stream;
    },
  };
});

const DELAYED_WRITE_MS = 3_000;
const UNSETTLED_CLOSE_MS = 5_000;
const CLOSE_OBSERVATION_MS = 6_000;
const CONTROL_DEADLINE_MS = 10_000;
const POLL_INTERVAL_MS = 25;
const RESTORED_BYTES = 'owned-destination-bytes';
const EXIT_FAILURE_CODE = 7;

async function observeClose() {
  const deadline = Date.now() + CLOSE_OBSERVATION_MS;
  while (ioControl.streams.some((stream) => !stream.closed) && Date.now() < deadline)
    await delay(POLL_INTERVAL_MS);
  expect(ioControl.streams.every((stream) => stream.closed)).toBe(true);
}

function resetControl() {
  ioControl.writeDelayMs = 0;
  ioControl.closeDelayMs = 0;
  ioControl.streams = [];
}

function failedTarget() {
  return [
    '-e',
    `process.stdout.write('${RESTORED_BYTES}', () => process.exit(${EXIT_FAILURE_CODE}));`,
  ];
}

describe('legacy output destination settlement', () => {
  it(
    'destroys a delayed actual writer and hashes only after its actual close',
    async () => {
      const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-delayed-destination-control-'));
      const context = { root: owned, calls: [], artifacts: [] };
      ioControl.writeDelayMs = DELAYED_WRITE_MS;
      try {
        await expect(capturedCommand(context, process.execPath, failedTarget())).rejects.toThrow(
          /L0_COMMAND_AND_OWNERSHIP_UNRESOLVED/
        );
        const call = context.calls[0];
        expect(call.outputFinalizationFailure).toContain('L0_COMMAND_DEADLINE');
        expect(call.outputCloseFailure).toBeUndefined();
        expect(call.unsettledOutputPaths).toBeUndefined();
        expect(call.groupAbsent).toBe(true);
        expect(ioControl.streams.every((stream) => stream.destroyed && stream.closed)).toBe(true);
        const data = readFileSync(join(owned, '001.stdout.raw.txt'));
        expect(data.toString()).toBe(RESTORED_BYTES);
        expect(
          context.artifacts.find((artifact) => artifact.path === '001.stdout.raw.txt')
        ).toMatchObject({ bytes: data.length, sha256: digest(data), complete: false });
        await delay(POLL_INTERVAL_MS);
        expect(digest(readFileSync(join(owned, '001.stdout.raw.txt')))).toBe(digest(data));
        resetControl();
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
        await observeClose();
        resetControl();
        if (context.calls.every((call) => call.groupAbsent)) rmSync(owned, { recursive: true });
      }
    },
    CONTROL_DEADLINE_MS
  );

  it(
    'omits a still-unclosed actual file hash, preserves its unsettled path and restores a settled writer',
    async () => {
      const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-unsettled-destination-control-'));
      const context = { root: owned, calls: [], artifacts: [] };
      ioControl.closeDelayMs = UNSETTLED_CLOSE_MS;
      try {
        await expect(capturedCommand(context, process.execPath, failedTarget())).rejects.toThrow(
          /L0_COMMAND_AND_OWNERSHIP_UNRESOLVED/
        );
        const call = context.calls[0];
        expect(call.outputFinalizationFailure).toContain('L0_COMMAND_DEADLINE');
        expect(call.outputCloseFailure).toContain('L0_COMMAND_DEADLINE');
        expect(call.unsettledOutputPaths).toEqual([
          { path: '001.stdout.raw.txt', status: 'close-unsettled', hashOmitted: true },
        ]);
        expect(call.groupAbsent).toBe(true);
        expect(ioControl.streams[0].closed).toBe(false);
        expect(context.artifacts.some((artifact) => artifact.path === '001.stdout.raw.txt')).toBe(
          false
        );
        expect(
          JSON.parse(readFileSync(join(owned, 'commands.json.txt'), 'utf8'))[0].unsettledOutputPaths
        ).toEqual(call.unsettledOutputPaths);
        await observeClose();
        expect(readFileSync(join(owned, '001.stdout.raw.txt'), 'utf8')).toBe(RESTORED_BYTES);
        resetControl();
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
        await observeClose();
        resetControl();
        if (context.calls.every((call) => call.groupAbsent)) rmSync(owned, { recursive: true });
      }
    },
    CONTROL_DEADLINE_MS
  );
});
