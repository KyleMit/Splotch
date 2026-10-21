import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCrashMatrix, tallyCrashRuns } from '../lib/crash-tally.mjs';

const run = (overrides) => ({
  scenario: 'S1',
  target: 'ios-simulator',
  arm: 'rn',
  verdict: 'alive',
  scenarioError: null,
  ...overrides,
});

describe('tallyCrashRuns', () => {
  it('counts a run whose scenario threw as invalid, whatever its verdict', () => {
    const [row] = tallyCrashRuns([
      run({ verdict: 'alive' }),
      run({ verdict: 'crashed' }),
      run({ verdict: 'error-screened' }),
      run({ verdict: 'crashed', scenarioError: 'foreground is com.apple.springboard' }),
    ]);

    expect(row).toEqual({
      scenario: 'S1',
      target: 'ios-simulator',
      arm: 'rn',
      valid: 3,
      alive: 1,
      crashed: 1,
      screened: 1,
      invalid: 1,
      diagnostics: 0,
    });
  });

  it('counts diagnostics on valid runs only', () => {
    const [row] = tallyCrashRuns([
      run({ diagnostics: ['Splotch.cpu_resource-1.ips'] }),
      run({ diagnostics: ['Splotch.cpu_resource-2.ips'], scenarioError: 'no Clear drawing' }),
    ]);

    expect(row).toMatchObject({ valid: 1, invalid: 1, diagnostics: 1 });
  });

  it('keeps scenarios, targets, and arms in separate rows', () => {
    const rows = tallyCrashRuns([
      run({ arm: 'rn' }),
      run({ arm: 'ref160' }),
      run({ target: 'android-emulator' }),
    ]);

    expect(rows.map((row) => `${row.scenario} ${row.target} ${row.arm}`)).toEqual([
      'S1 android-emulator rn',
      'S1 ios-simulator ref160',
      'S1 ios-simulator rn',
    ]);
  });
});

describe('readCrashMatrix', () => {
  let root;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
  };

  it('reads runs per target and counts archived invalid runs by their JSON alone', () => {
    root = mkdtempSync(join(tmpdir(), 'crash-matrix-'));
    write('ios-simulator/S1-rn-1.json', run({}));
    write('ios-simulator/S1-rn-1-end.png', 'png');
    write('invalid/ios-simulator/S1-rn-2.json', run({ scenarioError: 'x' }));
    write('invalid/ios-simulator/S1-rn-2-end.png', 'png');

    const { runs, archivedInvalid } = readCrashMatrix(root);

    expect(runs).toHaveLength(1);
    expect(archivedInvalid['ios-simulator']).toBe(1);
    expect(archivedInvalid['android-device']).toBe(0);
  });

  it('refuses a run with a verdict outside the vocabulary', () => {
    root = mkdtempSync(join(tmpdir(), 'crash-matrix-'));
    write('ios-simulator/S1-rn-1.json', run({ verdict: 'screened' }));

    expect(() => readCrashMatrix(root)).toThrow(/S1-rn-1\.json: unknown verdict screened/);
  });
});
