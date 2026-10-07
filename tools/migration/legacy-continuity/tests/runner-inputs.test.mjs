import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../../lib/proc.mjs';
import { verifyRunnerInputs } from '../runner-inputs.mjs';
import { digest } from '../contract.mjs';
import { FIXTURE_COMPILER_INPUTS } from '../fixture-source-namespace.mjs';

const selectorControl = vi.hoisted(() => ({
  bytes: Buffer.from('host-only qualified selector fixture'),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const controlled = (path) => ['/bin/ps', '/usr/sbin/lsof'].includes(path);
  return {
    ...actual,
    readFileSync: (path, ...args) =>
      controlled(path) ? selectorControl.bytes : actual.readFileSync(path, ...args),
    realpathSync: (path, ...args) => (controlled(path) ? path : actual.realpathSync(path, ...args)),
    lstatSync: (path, ...args) =>
      controlled(path)
        ? { isFile: () => true, isSymbolicLink: () => false }
        : actual.lstatSync(path, ...args),
  };
});

function inputs() {
  const capabilityDirectory = join(ROOT, 'tools/migration/legacy-continuity');
  return [
    ...FIXTURE_COMPILER_INPUTS,
    ...readdirSync(capabilityDirectory)
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => join(capabilityDirectory, name)),
    join(ROOT, 'tools/lib/proc.mjs'),
    process.execPath,
    '/bin/ps',
    '/usr/sbin/lsof',
  ].map((path) => {
    const bytes = readFileSync(path);
    return {
      path: realpathSync(path),
      realpath: realpathSync(path),
      bytes: bytes.length,
      sha256: digest(bytes),
    };
  });
}

describe('legacy current runner source boundary', () => {
  it('refuses missing and changed production modules before accepting the restored exact inputs', () => {
    const runnerInputs = inputs();
    expect(() => verifyRunnerInputs({ runnerInputs: [] })).toThrow(/INPUT_MISSING/);
    for (const name of [
      'proc.mjs',
      'materialize.mjs',
      'fixture-source-namespace.mjs',
      'ios-receipt.mjs',
      'native-overlay.mjs',
      'command-failure.mjs',
    ])
      expect(() =>
        verifyRunnerInputs({
          runnerInputs: runnerInputs.filter((input) => !input.path.endsWith('/' + name)),
        })
      ).toThrow(/INPUT_MISSING/);
    for (const path of FIXTURE_COMPILER_INPUTS)
      expect(() =>
        verifyRunnerInputs({ runnerInputs: runnerInputs.filter((input) => input.path !== path) })
      ).toThrow(/INPUT_MISSING/);
    expect(() =>
      verifyRunnerInputs({
        runnerInputs: runnerInputs.filter((input) => input.path !== process.execPath),
      })
    ).toThrow(/INPUT_MISSING/);
    const changed = structuredClone(runnerInputs);
    const entry = changed.find((input) => input.path.endsWith('/adb-server.mjs'));
    entry.sha256 = '0'.repeat(64);
    expect(() => verifyRunnerInputs({ runnerInputs: changed })).toThrow(/INPUT_CHANGED/);
    expect(() => verifyRunnerInputs({ runnerInputs })).not.toThrow();
  });

  it('refuses duplicate inputs and a changed selector fixture before restoring byte agreement', () => {
    const runnerInputs = inputs();
    expect(() => verifyRunnerInputs({ runnerInputs: [...runnerInputs, runnerInputs[0]] })).toThrow(
      /INPUT_DUPLICATE/
    );
    selectorControl.bytes = Buffer.from('changed selector fixture');
    try {
      expect(() => verifyRunnerInputs({ runnerInputs })).toThrow(/INPUT_SIZE|INPUT_CHANGED/);
    } finally {
      selectorControl.bytes = Buffer.from('host-only qualified selector fixture');
    }
    expect(() => verifyRunnerInputs({ runnerInputs })).not.toThrow();
    expect(lstatSync('/bin/ps').isFile()).toBe(true);
  });
});
