import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { isMain, runMain } from '../../lib/proc.mjs';
import { inspectSource } from './source-inputs.mjs';
import { materializeFixture } from './materialize.mjs';
import { commandContext, finishEvidence, settleCommandChildren } from './command-evidence.mjs';
import { androidCommand } from './android-command.mjs';
import { runAndroidDiskWatch } from './run-android-disk-watch.mjs';
import { iosReceipt } from './ios-receipt.mjs';
import {
  COMMAND_FAILURE_PHASES,
  recordCommandFailure,
  serializeCommandError,
} from './command-failure.mjs';

export async function runLegacyContinuity(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      source: { type: 'string' },
      output: { type: 'string' },
      repo: { type: 'string', default: process.cwd() },
      fixture: { type: 'string' },
      lease: { type: 'string' },
      command: { type: 'string' },
      nonce: { type: 'string' },
      receipt: { type: 'string' },
      'seed-output': { type: 'string' },
      console: { type: 'string' },
      raw: { type: 'string' },
      result: { type: 'string' },
    },
  });
  assert.equal(
    positionals.length,
    1,
    'Use inspect, materialize, android-command, android-disk-watch or ios-receipt'
  );
  const [action] = positionals;
  assert.ok(
    ['inspect', 'materialize', 'android-command', 'android-disk-watch', 'ios-receipt'].includes(
      action
    ),
    'L0_COMMAND_INVALID'
  );
  if (action === 'android-disk-watch') {
    const names = ['fixture', 'lease', 'nonce', 'seed-output', 'output'];
    for (const name of names) assert.ok(values[name], `L0_WATCH_${name}_REQUIRED`);
    return runAndroidDiskWatch(names.flatMap((name) => ['--' + name, values[name]]));
  }
  if (action === 'inspect' || action === 'materialize') {
    assert.ok(values.source, 'L0_SOURCE_REQUIRED');
    if (action === 'materialize') {
      assert.ok(values.output, 'L0_OUTPUT_REQUIRED');
      assert.equal(process.platform, 'darwin', 'L0_SOURCE_MATERIALIZATION_REQUIRES_MACOS');
    }
    const result =
      action === 'inspect'
        ? inspectSource(values.repo, values.source)
        : materializeFixture(values.repo, values.source, values.output);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const name of ['fixture', 'lease', 'command', 'nonce', 'output'])
      assert.ok(values[name], `L0_${name.toUpperCase()}_REQUIRED`);
    const platform = action === 'android-command' ? 'android' : 'ios';
    if (platform === 'ios')
      for (const name of ['receipt', 'console', 'raw', 'result'])
        assert.ok(values[name], `L0_${name.toUpperCase()}_REQUIRED`);
    if (platform === 'android')
      assert.equal(process.platform, 'darwin', 'L0_ANDROID_FIXTURE_GUARD_REQUIRES_MACOS');
    const context = commandContext({ ...values, platform });
    const cancelWork = () => {
      context.workCancelled = true;
    };
    if (platform === 'android') process.on('SIGTERM', cancelWork);
    let detail, failure;
    try {
      detail = platform === 'android' ? await androidCommand(context) : iosReceipt(context);
    } catch (error) {
      failure = error;
    } finally {
      if (platform === 'android') {
        try {
          await settleCommandChildren(context);
        } catch (error) {
          recordCommandFailure(context, COMMAND_FAILURE_PHASES.childSettlement, error);
          failure = failure ? new AggregateError([failure, error]) : error;
        }
        process.removeListener('SIGTERM', cancelWork);
      }
    }
    if (failure) {
      finishEvidence(context, 'failed; disposition requires actual failure reason', {
        error: serializeCommandError(failure),
        phases: context.failurePhases ?? [],
      });
      throw failure;
    }
    const status =
      detail?.status === 'command-failure' ? 'command-failure' : 'command-receipt-completed';
    finishEvidence(context, status, detail ?? { command: values.command });
    process.stdout.write(JSON.stringify({ artifactRoot: context.root, status }) + '\n');
    assert.notEqual(status, 'command-failure', 'L0_IOS_COMMAND_FAILED');
  }
}

if (isMain(import.meta.url)) runMain(() => runLegacyContinuity(process.argv.slice(2)));
