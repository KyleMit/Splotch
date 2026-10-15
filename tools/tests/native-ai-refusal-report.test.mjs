// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createAiReportOwner } from '../../experiments/native-architecture/src/ai/reportOwner.ts';
import { parseAiResponse } from '../../experiments/native-architecture/src/ai/transport.ts';
import { AI_REPORT_KINDS } from '../../web/src/lib/imageReport.ts';
import { MAX_AI_REPORT_TOKEN_CHARACTERS } from '../../experiments/native-architecture/src/ai/reportContract.ts';

const ID = 17;
const INPUT = Uint8Array.from([137, 80, 78, 71]);
const TOKEN = 'opaque.original-refusal-proof';
const TARGET = { kind: 'false-positive-refusal', id: ID };
const ORIGINAL = { kind: 'free', installationId: 'a'.repeat(64) };
const REFERENCE = { kind: 'free', reference: 'b'.repeat(64) };
const REPORT_SETTLE_TIMEOUT_MS = 1000;
const REPORT_ID = '1723123456789-550e8400-e29b-41d4-a716-446655440000';
let owner, state, transport, vault, parent, releaseGate, allowed, consentEpoch;
function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}
function fixture() {
  return createAiReportOwner({
    vault,
    parent,
    transport,
    admit: async () => {},
    current: (target) => allowed && target.kind === 'false-positive-refusal' && target.id === ID,
    publish: (next) => {
      state = next;
    },
  });
}
async function prepare(credential = ORIGINAL, token = TOKEN) {
  vault.pin.mockResolvedValue({ ...REFERENCE, kind: credential.kind });
  vault.readReferenced.mockResolvedValue(credential);
  await owner.prepare(ID, INPUT, 'Clay', credential);
  owner.refuse(ID, token);
}
async function formSent() {
  const request = transport.mock.calls.at(-1)[0];
  return new Response(request.body, {
    headers: { 'Content-Type': request.headers['Content-Type'] },
  }).formData();
}
beforeEach(() => {
  allowed = true;
  consentEpoch = 1;
  parent = {
    consent: () => ({ enabled: true, epoch: consentEpoch }),
    cancel: vi.fn(),
    request: vi.fn((feature, callback) => {
      releaseGate = callback;
      return true;
    }),
  };
  vault = {
    pin: vi.fn().mockResolvedValue(REFERENCE),
    readReferenced: vi.fn().mockResolvedValue(ORIGINAL),
  };
  transport = vi.fn().mockResolvedValue(response(200, { ok: true, reportId: REPORT_ID }));
  owner = fixture();
});
afterEach(() => owner.dispose());

it.each(['/api/generate-image', '/api/generation-result'])(
  'preserves opaque refusal proof from %s without retaining the provider reason',
  async (path) => {
    const reply = await parseAiResponse(
      response(422, { ok: false, error: 'private provider reason' }, { 'X-Report-Token': TOKEN }),
      { path, method: path === '/api/generate-image' ? 'POST' : 'GET', headers: {} },
      new AbortController().signal,
      0
    );
    expect(reply).toMatchObject({ kind: 'failure', reason: 'safety', reportToken: TOKEN });
    expect(JSON.stringify(reply)).not.toContain('private provider reason');
    expect(reply).not.toHaveProperty('bytes');
  }
);
it.each([null, 'invalid token', 'x'.repeat(MAX_AI_REPORT_TOKEN_CHARACTERS + 1)])(
  'fails closed when refusal proof is unavailable: %s',
  async (token) => {
    await prepare(ORIGINAL, token);
    owner.requestRefusal(ID);
    await owner.send();
    expect(state.phase).toBe('unavailable');
    expect(parent.request).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  }
);
it.each([
  ORIGINAL,
  { kind: 'managed', value: 'original-code' },
  { kind: 'byok', value: 'original-key' },
])(
  'binds a confirmed refusal report to its original %s credential and evidence',
  async (credential) => {
    await prepare(credential);
    owner.requestRefusal(ID);
    await owner.send();
    expect(state.phase).toBe('gating');
    expect(parent.request.mock.calls[0][0]).toBe('imageReport');
    expect(transport).not.toHaveBeenCalled();
    releaseGate({ valid: () => true });
    expect(state.phase).toBe('confirm');
    expect(state.preview).toEqual({
      target: TARGET,
      style: 'Clay',
      drawing: 'data:image/png;base64,iVBORw==',
    });
    expect(transport).not.toHaveBeenCalled();
    await owner.send();
    const request = transport.mock.calls[0][0];
    expect(request.path).toBe('/api/report-image');
    expect(request.headers['X-Report-Token']).toBe(TOKEN);
    const header =
      credential.kind === 'free'
        ? 'X-Installation-Id'
        : credential.kind === 'managed'
          ? 'X-Access-Token'
          : 'X-Api-Key';
    expect(request.headers[header]).toBe(
      credential.kind === 'free' ? credential.installationId : credential.value
    );
    const form = await formSent();
    expect([...form.keys()]).toEqual(['kind', 'drawing', 'style']);
    expect(form.get('kind')).toBe(AI_REPORT_KINDS.find((kind) => kind === TARGET.kind));
    expect(form.get('style')).toBe('Clay');
    expect(new Uint8Array(await form.get('drawing').arrayBuffer())).toEqual(INPUT);
    expect(form.has('output')).toBe(false);
    expect(state).toEqual({ phase: 'success', target: TARGET, reportId: REPORT_ID });
  }
);
it('captures the submitted drawing before asynchronous preparation can observe a changed input', async () => {
  const original = INPUT.slice();
  vault.pin.mockResolvedValue(REFERENCE);
  vault.readReferenced.mockResolvedValue(ORIGINAL);
  const preparing = owner.prepare(ID, original, 'Felt', ORIGINAL);
  original.fill(0);
  await preparing;
  owner.refuse(ID, TOKEN);
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  expect(state.preview.drawing).toBe('data:image/png;base64,iVBORw==');
  expect(state.preview.style).toBe('Felt');
});
it('rejects a picture action and a late picture when the subject is a refusal', async () => {
  await prepare();
  owner.complete(ID, new Uint8Array([1]), 'image/png', 'other-proof', 'file:///late.png');
  owner.request('file:///late.png');
  expect(state.phase).toBe('unavailable');
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  expect(state.preview.target).toEqual(TARGET);
  expect(state.preview).not.toHaveProperty('output');
  expect(transport).not.toHaveBeenCalled();
});
it('rejects a refusal action when the attempt already owns a picture', async () => {
  await owner.prepare(ID, INPUT, 'Clay', ORIGINAL);
  owner.complete(ID, new Uint8Array([1]), 'image/png', TOKEN, 'file:///picture.png');
  expect(owner.refuse(ID, TOKEN)).toBe(false);
  owner.requestRefusal(ID);
  expect(state.phase).toBe('unavailable');
  expect(transport).not.toHaveBeenCalled();
});
it('suppresses a stale gate completion after cancellation', async () => {
  await prepare();
  owner.requestRefusal(ID);
  const oldGate = releaseGate;
  owner.cancel();
  oldGate({ valid: () => true });
  await owner.send();
  expect(state.phase).toBe('idle');
  expect(transport).not.toHaveBeenCalled();
});
it('suppresses sending after parent consent changes during credential readback', async () => {
  await prepare();
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  let finish;
  vault.readReferenced.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const sending = owner.send();
  consentEpoch += 1;
  finish(ORIGINAL);
  await sending;
  expect(state.phase).toBe('idle');
  expect(transport).not.toHaveBeenCalled();
});
it('keeps failed refusal reports retryable after closing and checking again', async () => {
  await prepare();
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  transport.mockResolvedValueOnce(response(200, {}));
  await owner.send();
  expect(state.phase).toBe('error');
  owner.cancel();
  expect(owner.refuse(ID, TOKEN)).toBe(true);
  owner.requestRefusal(ID);
  expect(state.phase).toBe('gating');
  releaseGate({ valid: () => true });
  await owner.send();
  expect(state.phase).toBe('success');
  owner.dispose();
  owner = fixture();
  owner.requestRefusal(ID);
  await owner.send();
  expect(state.phase).toBe('unavailable');
  expect(transport).toHaveBeenCalledTimes(2);
});

it('suppresses late acknowledgement after close without making the refusal report reusable', async () => {
  await prepare();
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  let finish;
  transport.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const sending = owner.send();
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce(), {
    timeout: REPORT_SETTLE_TIMEOUT_MS,
  });
  owner.cancel();
  finish(response(200, { ok: true, reportId: REPORT_ID }));
  await sending;
  expect(state.phase).toBe('idle');
  owner.requestRefusal(ID);
  expect(state.phase).toBe('unavailable');
  expect(transport).toHaveBeenCalledOnce();
});

it('rejects a stale refusal subject when a new prepared generation replaces its evidence', async () => {
  await prepare();
  owner.requestRefusal(ID);
  const oldGate = releaseGate;
  await owner.prepare(ID + 1, INPUT, 'Felt', ORIGINAL);
  oldGate({ valid: () => true });
  await owner.send();
  expect(state.phase).toBe('gating');
  expect(transport).not.toHaveBeenCalled();
});

it('requires a new review and confirmation before retrying a definitively rejected send', async () => {
  await prepare();
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  transport.mockResolvedValueOnce(response(403, { ok: false, error: 'Report rejected.' }));
  await owner.send();
  expect(state.phase).toBe('error');
  await owner.send();
  expect(transport).toHaveBeenCalledOnce();
  owner.requestRefusal(ID);
  releaseGate({ valid: () => true });
  expect(state.phase).toBe('confirm');
  await owner.send();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(state.phase).toBe('success');
});
