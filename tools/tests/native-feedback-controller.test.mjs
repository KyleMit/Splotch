import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeFeedback } from '../../experiments/native-architecture/src/feedback/feedback.ts';
import { MAX_REPORT_MESSAGE_LENGTH } from '../../experiments/native-architecture/src/feedback/report.ts';
import { FEEDBACK_TIMEOUT_MS } from '../../experiments/native-architecture/src/feedback/feedbackTransport.ts';
import {
  GATE_LOCKOUT_BASE_MS,
  GATE_ESCALATION_QUIET_MS,
} from '../../experiments/native-architecture/src/feedback/gateLockout.ts';

function pending() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture(mode = null) {
  let clock = 1000;
  const requests = [];
  const storage = { read: vi.fn(async () => mode), write: vi.fn(async () => {}) };
  const device = vi.fn(() => ({
    platform: 'iOS',
    device: 'Fixture tablet',
    screen: '100 × 200',
    secret: 'drop me',
  }));
  const transport = vi.fn((body, signal) => {
    const response = pending();
    requests.push({ body, signal, response });
    return response.promise;
  });
  const owner = createNativeFeedback({
    transport,
    device,
    offline: () => false,
    policyStorage: storage,
    now: () => clock,
    random: () => 0,
  });
  return {
    owner,
    transport,
    device,
    storage,
    requests,
    advance: (ms) => {
      clock += ms;
    },
  };
}
function solve(owner) {
  const { x, y } = owner.getState().gate;
  owner.gateInput(String(x * y));
  owner.gateAnswer();
}
async function prepared(mode = null) {
  const f = fixture(mode);
  await f.owner.loadPolicy();
  f.owner.open();
  f.owner.setMessage('  The crayon is stuck  ');
  f.owner.preview();
  return f;
}
async function settle(request, body = { ok: true }, status = 200) {
  request.response.resolve(new Response(JSON.stringify(body), { status }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
afterEach(() => vi.useRealTimers());

describe('native feedback request ownership', () => {
  it('requires preview, explicit send and a correct adult answer before creating a request', async () => {
    const f = await prepared();
    expect(f.transport).not.toHaveBeenCalled();
    f.owner.send();
    expect(f.owner.getState().gate.open).toBe(true);
    expect(f.transport).not.toHaveBeenCalled();
    solve(f.owner);
    expect(f.transport).toHaveBeenCalledOnce();
    expect(f.requests[0].body).toEqual({ kind: 'bug', message: 'The crayon is stuck', hp: '' });
    expect(Object.isFrozen(f.requests[0].body)).toBe(true);
    await settle(f.requests[0]);
    expect(f.owner.getState().delivery.status).toBe('success');
    expect(f.owner.getState().draft.message).toBe('');
  });
  it('does not unlock or submit when a challenge is dismissed or the form closes', async () => {
    const f = await prepared();
    f.owner.send();
    f.owner.gateInput('9');
    f.owner.dismissGate();
    f.owner.gateAnswer();
    expect(f.transport).not.toHaveBeenCalled();
    f.owner.send();
    f.owner.close();
    f.owner.open();
    f.owner.gateAnswer();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.owner.getState().gate.open).toBe(false);
    f.owner.send();
    expect(f.owner.getState().gate.open).toBe(true);
  });
  it('deduplicates double send taps before and after solving', async () => {
    const f = await prepared();
    f.owner.send();
    f.owner.send();
    solve(f.owner);
    f.owner.send();
    f.owner.send();
    expect(f.requests).toHaveLength(1);
    await settle(f.requests[0]);
  });
  it('retains an immutable request across close/reopen without erasing a newer draft', async () => {
    const f = await prepared();
    f.owner.send();
    solve(f.owner);
    f.owner.close();
    f.owner.open();
    f.owner.setMessage('A newer idea');
    f.owner.setKind('feature');
    await settle(f.requests[0]);
    expect(f.requests[0].body.message).toBe('The crayon is stuck');
    expect(f.owner.getState().draft).toEqual({
      message: 'A newer idea',
      kind: 'feature',
      includeDevice: false,
    });
    expect(f.owner.getState().delivery.status).toBe('success');
  });
  it('does not cancel a retained request merely by closing, reopening or editing', async () => {
    const f = await prepared();
    f.owner.send();
    solve(f.owner);
    f.owner.close();
    f.owner.open();
    f.owner.setMessage('Second draft');
    f.owner.preview();
    f.owner.send();
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].signal.aborted).toBe(false);
    await settle(f.requests[0]);
  });
  it('ignores an older completion and stale cancellation after a separate newer request begins', async () => {
    const f = await prepared('never');
    f.owner.send();
    const first = f.owner.getState().delivery.id;
    f.owner.cancelSending(first);
    f.owner.setMessage('New submission');
    f.owner.preview();
    f.owner.send();
    const second = f.owner.getState().delivery.id;
    expect(second).not.toBe(first);
    f.owner.cancelSending(first);
    await settle(f.requests[0]);
    expect(f.requests[1].signal.aborted).toBe(false);
    expect(f.owner.getState().delivery).toMatchObject({ status: 'sending', id: second });
    expect(f.owner.getState().draft.message).toBe('New submission');
    await settle(f.requests[1]);
    expect(f.owner.getState().delivery.status).toBe('success');
  });
  it('aborts a deadline, retains the draft and never auto resubmits after an unknown delivery', async () => {
    vi.useFakeTimers();
    const f = await prepared('never');
    f.owner.send();
    await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS);
    expect(f.requests[0].signal.aborted).toBe(true);
    expect(f.owner.getState().delivery.status).toBe('timeout');
    expect(f.owner.getState().draft.message).toBe('  The crayon is stuck  ');
    await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS * 3);
    expect(f.requests).toHaveLength(1);
    f.owner.dispose();
  });
  it('deduplicates immediate sends when the parent explicitly chose Never', async () => {
    const f = await prepared('never');
    f.owner.send();
    f.owner.send();
    f.owner.send();
    expect(f.requests).toHaveLength(1);
    await settle(f.requests[0]);
  });
  it('honors Retry-After without automatic resubmission and enables explicit retry after expiry', async () => {
    const f = await prepared('never');
    f.owner.send();
    f.requests[0].response.resolve(
      new Response('{"ok":false,"error":"throttle"}', {
        status: 429,
        headers: { 'Retry-After': '12' },
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.owner.send();
    expect(f.requests).toHaveLength(1);
    expect(f.owner.getState().delivery.status).toBe('throttled');
    f.advance(12000);
    f.owner.deliveryTick();
    expect(f.requests).toHaveLength(1);
    f.owner.send();
    expect(f.requests).toHaveLength(2);
    await settle(f.requests[1]);
  });
  it('does not publish late results after owner disposal', async () => {
    const f = await prepared('never');
    f.owner.send();
    const listener = vi.fn();
    f.owner.subscribe(listener);
    f.owner.dispose();
    await settle(f.requests[0]);
    expect(f.requests[0].signal.aborted).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('native feedback consent and protected policy', () => {
  it('collects device details only after bug opt-in and previews exactly the sanitized snapshot sent', async () => {
    const f = await prepared('never');
    expect(f.device).not.toHaveBeenCalled();
    f.owner.setIncludeDevice(true);
    f.owner.preview();
    const preview = f.owner.getState().preview;
    expect(f.device).toHaveBeenCalledOnce();
    expect(preview.body.device).toEqual({
      platform: 'iOS',
      device: 'Fixture tablet',
      screen: '100 × 200',
    });
    f.owner.send();
    expect(f.requests[0].body).toBe(preview.body);
    await settle(f.requests[0]);
  });
  it('drops device consent on a feature choice and does not collect for ideas', async () => {
    const f = await prepared('never');
    f.owner.setIncludeDevice(true);
    f.owner.setKind('feature');
    f.owner.setIncludeDevice(true);
    f.owner.preview();
    f.owner.send();
    expect(f.device).not.toHaveBeenCalled();
    expect(f.requests[0].body).toEqual({ kind: 'feature', message: 'The crayon is stuck', hp: '' });
    expect(f.owner.getState().draft.includeDevice).toBe(false);
    await settle(f.requests[0]);
  });
  it('rejects empty drafts and bounds input without splitting surrogate pairs', async () => {
    const f = await prepared();
    f.owner.setMessage('  ');
    f.owner.preview();
    expect(f.owner.getState().preview).toBeNull();
    expect(f.owner.getState().validation).toContain('short description');
    f.owner.setMessage('a'.repeat(MAX_REPORT_MESSAGE_LENGTH - 1) + '😀');
    expect(f.owner.getState().draft.message).toBe('a'.repeat(MAX_REPORT_MESSAGE_LENGTH - 1));
  });
  it('fails closed when policy cannot be read or is invalid', async () => {
    const f = fixture('unrecognized');
    await f.owner.loadPolicy();
    f.owner.setMessage('Bug');
    f.owner.preview();
    f.owner.send();
    expect(f.owner.getState()).toMatchObject({ policy: 'always', policyReady: true });
    expect(f.owner.getState().policyMessage).toContain('could not be read');
    expect(f.owner.getState().gate.open).toBe(true);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('blocks send during policy hydration', async () => {
    const f = fixture('never');
    const read = pending();
    f.storage.read.mockReturnValue(read.promise);
    const loading = f.owner.loadPolicy();
    f.owner.setMessage('Bug');
    f.owner.preview();
    f.owner.send();
    expect(f.transport).not.toHaveBeenCalled();
    read.resolve('never');
    await loading;
    f.owner.send();
    expect(f.transport).toHaveBeenCalledOnce();
    await settle(f.requests[0]);
  });
  it('requires an independent challenge to change even an unprotected feedback policy', async () => {
    const f = await prepared('never');
    f.owner.changePolicy('session');
    expect(f.owner.getState().gate.open).toBe(true);
    expect(f.storage.write).not.toHaveBeenCalled();
    f.owner.dismissGate();
    expect(f.owner.getState().policy).toBe('never');
    f.owner.changePolicy('session');
    solve(f.owner);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.storage.write).toHaveBeenCalledWith('session');
    expect(f.owner.getState().policy).toBe('session');
    f.owner.send();
    expect(f.owner.getState().gate.open).toBe(true);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('fails closed after a policy write fails', async () => {
    const f = await prepared('never');
    f.storage.write.mockRejectedValue(new Error('private disk detail'));
    f.owner.changePolicy('never');
    solve(f.owner);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.owner.getState().policy).toBe('always');
    expect(f.owner.getState().policyMessage).not.toContain('private disk detail');
    f.owner.send();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.owner.getState().gate.open).toBe(true);
  });
  it('retargets an existing policy challenge to a send even when the saved send mode is Never', async () => {
    const f = await prepared('never');
    f.owner.changePolicy('always');
    const challenge = f.owner.getState().gate;
    f.owner.send();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.owner.getState().gate.x).toBe(challenge.x);
    solve(f.owner);
    expect(f.storage.write).not.toHaveBeenCalled();
    expect(f.transport).toHaveBeenCalledOnce();
    await settle(f.requests[0]);
  });
  it('does not reread an older stored policy while a gated edit is being saved', async () => {
    const f = await prepared('never');
    const writing = pending();
    f.storage.write.mockReturnValue(writing.promise);
    f.owner.changePolicy('always');
    solve(f.owner);
    await f.owner.loadPolicy();
    f.owner.send();
    expect(f.storage.read).toHaveBeenCalledOnce();
    expect(f.transport).not.toHaveBeenCalled();
    writing.resolve();
    await Promise.resolve();
    await Promise.resolve();
    f.owner.send();
    expect(f.owner.getState().gate.open).toBe(true);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('keeps one challenge while retargeting from send to a policy change', async () => {
    const f = await prepared();
    f.owner.send();
    const original = f.owner.getState().gate;
    f.owner.changePolicy('never');
    expect(f.owner.getState().gate.x).toBe(original.x);
    expect(f.owner.getState().gate.y).toBe(original.y);
    solve(f.owner);
    await Promise.resolve();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.storage.write).toHaveBeenCalledOnce();
  });
  it('retains and escalates wrong attempts through close/reopen, then decays only after quiet time', async () => {
    const f = await prepared();
    function wrong() {
      f.owner.send();
      f.owner.gateInput('0');
      f.owner.gateAnswer();
      f.owner.close();
      f.owner.open();
    }
    wrong();
    wrong();
    wrong();
    f.owner.send();
    expect(f.owner.getState().gate.locked).toBe(true);
    solve(f.owner);
    expect(f.transport).not.toHaveBeenCalled();
    f.advance(GATE_LOCKOUT_BASE_MS);
    f.owner.gateTick();
    expect(f.owner.getState().gate.locked).toBe(false);
    wrong();
    wrong();
    wrong();
    f.owner.send();
    f.advance(GATE_LOCKOUT_BASE_MS);
    f.owner.gateTick();
    expect(f.owner.getState().gate.locked).toBe(true);
    f.advance(GATE_LOCKOUT_BASE_MS);
    f.owner.gateTick();
    f.advance(GATE_ESCALATION_QUIET_MS);
    wrong();
    wrong();
    wrong();
    f.owner.send();
    f.advance(GATE_LOCKOUT_BASE_MS);
    f.owner.gateTick();
    expect(f.owner.getState().gate.locked).toBe(false);
  });
});
