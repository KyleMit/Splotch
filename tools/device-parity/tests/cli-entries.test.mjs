import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseStepList } from '../run-gesture-sequence.mjs';

const capability = dirname(import.meta.dirname);
const ENTRIES = readdirSync(capability).filter((name) => name.endsWith('.mjs'));
const UNKNOWN = '--definitely-not-a-flag';

const runEntry = (entry, args) =>
  spawnSync(process.execPath, [join(capability, entry), ...args], { encoding: 'utf8' });

describe('device-parity entries', () => {
  it('are all found', () => {
    expect(ENTRIES).toContain('run-crash-scenario.mjs');
    expect(ENTRIES.length).toBeGreaterThanOrEqual(18);
  });

  // An empty stdout is the proof the refusal came first: every entry prints, opens a session, or
  // reads a device as soon as it starts work.
  it.each(ENTRIES)('%s refuses an unknown flag before doing any work', (entry) => {
    const result = runEntry(entry, [UNKNOWN]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(new RegExp(`^Unknown flag ${UNKNOWN} — known flags: `));
  });

  it('names the whole known set in the refusal', () => {
    expect(runEntry('analyze-crash-matrix.mjs', [UNKNOWN]).stderr).toBe(
      `Unknown flag ${UNKNOWN} — known flags: json, root\n`
    );
  });

  it('refuses a missing required flag', () => {
    const result = runEntry('analyze-crash-matrix.mjs', []);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('Missing required --root\n');
  });

  it('refuses a target outside the vocabulary before reading the session', () => {
    const args = ['--session=no/such.json', '--target=sim', '--bundle=b', '--arm=rn'];
    const result = runEntry('run-crash-scenario.mjs', [...args, '--scenario=S1', '--out=x']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--target must be one of ios-simulator');
  });

  it('refuses an iOS target without the process name its crash reports are filed under', () => {
    const args = ['--session=no/such.json', '--target=ios-simulator', '--bundle=b', '--arm=rn'];
    const result = runEntry('run-crash-scenario.mjs', [...args, '--scenario=S1', '--out=x']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('needs --process-name');
  });
});

describe('analyze-crash-matrix on a matrix', () => {
  const root = mkdtempSync(join(tmpdir(), 'crash-matrix-cli-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  // The positive control for the refusals above: the same entry with a valid argv runs to the end.
  it('prints the tally for a well-formed argv', () => {
    mkdirSync(join(root, 'android-emulator'));
    const result = { scenario: 'S3', target: 'android-emulator', arm: 'rn', verdict: 'alive' };
    writeFileSync(join(root, 'android-emulator', 'S3-rn-1.json'), JSON.stringify(result));

    const run = runEntry('analyze-crash-matrix.mjs', [`--root=${root}`]);

    expect(run.status).toBe(0);
    expect(run.stdout.split('\n').slice(0, 2)).toEqual([
      'scenario target arm valid alive crashed screened invalid diagnostics',
      'S3 android-emulator rn 1 1 0 0 0 0',
    ]);
  });
});

describe('parseStepList', () => {
  it('accepts every step kind at its arity', () => {
    const steps = [['scribble', 2], ['stroke'], ['clear'], ['wait', 50], ['tap', 'Undo']];

    expect(parseStepList(JSON.stringify(steps))).toEqual(steps);
  });

  it.each([[[['back']]], [[['wait']]], [[['stroke', 1]]], [{ tap: 'Undo' }]])(
    'refuses %j',
    (steps) => {
      expect(() => parseStepList(JSON.stringify(steps))).toThrow('--steps');
    }
  );
});
