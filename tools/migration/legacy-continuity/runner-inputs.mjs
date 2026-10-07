import assert from 'node:assert/strict';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { digest } from './contract.mjs';
import { FIXTURE_COMPILER_INPUTS } from './fixture-source-namespace.mjs';

const RUNNER_MODULES = [
  'run-fixture.mjs',
  'command-evidence.mjs',
  'command-failure.mjs',
  'run-command-gate.mjs',
  'process-ownership.mjs',
  'command-timing.mjs',
  'runner-inputs.mjs',
  'adb-server.mjs',
  'android-command.mjs',
  'android-runtime-inputs.mjs',
  'report-contract.mjs',
  'contract.mjs',
  'run-android-disk-watch.mjs',
  'android-writer-ack.mjs',
  'cdp-session.mjs',
  'source-inputs.mjs',
  'materialize.mjs',
  'fixture-source-namespace.mjs',
  'native-overlay.mjs',
  'ios-receipt.mjs',
];

export function verifyRunnerInputs(lease) {
  assert.ok(Array.isArray(lease.runnerInputs), 'L0_RUNNER_INPUTS_REQUIRED');
  const required = [
    ...FIXTURE_COMPILER_INPUTS,
    ...RUNNER_MODULES.map((name) => fileURLToPath(new URL(name, import.meta.url))),
    fileURLToPath(new URL('../../lib/proc.mjs', import.meta.url)),
    process.execPath,
    '/bin/ps',
    '/usr/sbin/lsof',
  ];
  const expected = new Map(lease.runnerInputs.map((entry) => [entry.path, entry]));
  assert.equal(expected.size, lease.runnerInputs.length, 'L0_RUNNER_INPUT_DUPLICATE');
  for (const path of required) assert.ok(expected.has(path), `L0_RUNNER_INPUT_MISSING: ${path}`);
  for (const input of expected.values()) {
    const stat = lstatSync(input.path);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `L0_RUNNER_INPUT_TYPE: ${input.path}`);
    assert.equal(realpathSync(input.path), input.realpath, `L0_RUNNER_INPUT_PATH: ${input.path}`);
    const bytes = readFileSync(input.path);
    assert.equal(bytes.length, input.bytes, `L0_RUNNER_INPUT_SIZE: ${input.path}`);
    assert.equal(digest(bytes), input.sha256, `L0_RUNNER_INPUT_CHANGED: ${input.path}`);
  }
}
