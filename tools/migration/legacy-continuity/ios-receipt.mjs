import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNonce } from './contract.mjs';
import { evidence } from './command-evidence.mjs';
import { verifyIOSFrame, verifyPageReport } from './report-contract.mjs';

export function iosReceipt(context) {
  assertNonce(context.receipt);
  const consoleBytes = evidence(
    context,
    'simctl-console.stdout.raw.txt',
    readFileSync(context.console)
  );
  const rawBytes = evidence(context, 'raw-preimage.json.txt', readFileSync(context.raw));
  const resultBytes = evidence(context, 'command-result.json.txt', readFileSync(context.result));
  const expected = {
    command: context.command,
    nonce: context.nonce,
    receiptId: context.receipt,
  };
  const raw = verifyIOSFrame(rawBytes, consoleBytes, {
    ...expected,
    phase: 'raw',
  });
  const result = verifyIOSFrame(resultBytes, consoleBytes, {
    ...expected,
    phase: 'result',
  });
  assert.equal(raw.pid, result.pid, 'L0_IOS_PROCESS_CHANGED_DURING_COMMAND');
  assert.equal(raw.result.status, 'completed', 'L0_IOS_RAW_CAPTURE_FAILED');
  verifyPageReport(raw.result.value, { ...context, command: 'raw' });
  assert.ok(
    ['completed', 'command-failure'].includes(result.result.status),
    'L0_IOS_SETUP_OR_RAW_FAILURE'
  );
  if (result.result.status === 'completed') verifyPageReport(result.result.value, context);
  return {
    status: result.result.status,
    pid: raw.pid,
    receiptId: context.receipt,
    scope:
      'hashed source-built local report; host install/profile survival and durable persistence require their independent receipts',
  };
}
