import assert from 'node:assert/strict';
import { verifyPageReport } from './report-contract.mjs';

export const WRITER_ACK_PHASE = 'writers-acknowledged-memory-only';
export function fixtureCommandExpression(command, nonce) {
  return `(async () => JSON.stringify(await window.__SPLOTCH_L0__.run(${JSON.stringify(command)}, ${JSON.stringify(nonce)})))()`;
}
export function writerAcknowledgement(text, context) {
  const requests = new Map();
  let raw;
  let acknowledgement;
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  for (const line of complete.split('\n').filter(Boolean)) {
    const envelope = JSON.parse(line);
    if (envelope.sent) {
      const request = envelope.sent;
      const command = ['raw', 'seed'].find(
        (name) => request.params?.expression === fixtureCommandExpression(name, context.nonce)
      );
      if (!command) continue;
      assert.equal(request.method, 'Runtime.evaluate', 'L0_WATCH_REQUEST_METHOD_CHANGED');
      assert.equal(request.params.awaitPromise, true, 'L0_WATCH_REQUEST_PROMISE_CHANGED');
      assert.equal(request.params.returnByValue, true, 'L0_WATCH_REQUEST_ENCODING_CHANGED');
      assert.ok(
        Number.isSafeInteger(request.id) && request.id > 0 && !requests.has(request.id),
        'L0_WATCH_REQUEST_ID_INVALID'
      );
      const sentAt = Date.parse(envelope.sentAt);
      assert.ok(Number.isFinite(sentAt), 'L0_WATCH_REQUEST_TIME_INVALID');
      if (command === 'seed') assert.ok(raw, 'L0_WATCH_RAW_PREIMAGE_MISSING');
      requests.set(request.id, { request, command, sentAt, envelope });
      continue;
    }
    if (typeof envelope.received !== 'string') continue;
    const response = JSON.parse(envelope.received);
    const request = requests.get(response.id);
    if (!request) continue;
    requests.delete(response.id);
    assert.ok(!response.error && !response.result?.exceptionDetails, 'L0_WATCH_CDP_COMMAND_FAILED');
    const encoded = response.result?.result;
    assert.equal(encoded?.type, 'string', 'L0_WATCH_REPORT_ENCODING_CHANGED');
    assert.equal(typeof encoded.value, 'string', 'L0_WATCH_REPORT_STRING_REQUIRED');
    const receivedAt = Date.parse(envelope.receivedAt);
    assert.ok(
      Number.isFinite(receivedAt) && receivedAt >= request.sentAt,
      'L0_WATCH_RESPONSE_TIME_INVALID'
    );
    const report = JSON.parse(encoded.value);
    verifyPageReport(report, { ...context, command: request.command });
    if (request.command === 'raw') raw = { request: request.envelope, response: envelope, report };
    else {
      assert.equal(report.result?.phase, WRITER_ACK_PHASE, 'L0_WATCH_ACK_PHASE_CHANGED');
      assert.ok(!acknowledgement, 'L0_WATCH_DUPLICATE_ACKNOWLEDGEMENT');
      acknowledgement = {
        at: envelope.receivedAt,
        request: request.envelope,
        response: envelope,
        report,
        rawPreimage: raw,
      };
    }
  }
  return acknowledgement;
}
