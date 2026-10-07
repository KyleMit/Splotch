import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { isMain, runMain } from '../../lib/proc.mjs';
import { inspectSource } from './source-inputs.mjs';
import { materializeFixture } from './materialize.mjs';
import { commandContext, finishEvidence } from './command-evidence.mjs';
import { androidCommand } from './android-command.mjs';
import { iosReceipt } from './ios-receipt.mjs';

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
      console: { type: 'string' },
      raw: { type: 'string' },
      result: { type: 'string' },
    },
  });
  assert.equal(positionals.length, 1, 'Use inspect, materialize, android-command or ios-receipt');
  const [action] = positionals;
  assert.ok(
    ['inspect', 'materialize', 'android-command', 'ios-receipt'].includes(action),
    'L0_COMMAND_INVALID'
  );
  if (action === 'inspect' || action === 'materialize') {
    assert.ok(values.source, 'L0_SOURCE_REQUIRED');
    if (action === 'materialize') assert.ok(values.output, 'L0_OUTPUT_REQUIRED');
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
    const context = commandContext({ ...values, platform });
    let detail;
    try {
      detail = platform === 'android' ? await androidCommand(context) : iosReceipt(context);
    } catch (error) {
      finishEvidence(context, 'failed; disposition requires actual failure reason', String(error));
      throw error;
    }
    const status =
      detail?.status === 'command-failure' ? 'command-failure' : 'command-receipt-completed';
    finishEvidence(context, status, detail ?? { command: values.command });
    process.stdout.write(JSON.stringify({ artifactRoot: context.root, status }) + '\n');
    assert.notEqual(status, 'command-failure', 'L0_IOS_COMMAND_FAILED');
  }
}

if (isMain(import.meta.url)) runMain(() => runLegacyContinuity(process.argv.slice(2)));
