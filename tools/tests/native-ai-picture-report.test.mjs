// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { URL as NodeURL } from 'node:url';
import { createAiReportOwner } from '../../src/ai/reportOwner.ts';
import {
  narrowReportReply,
  reportFailureMessage,
  REPORT_TIMEOUT_MESSAGE,
} from '../../src/lib/reportReply.ts';
import { NETWORK_ERROR_MESSAGE } from '../../src/lib/latestRequest.ts';
import {
  reportMultipart,
  MAX_AI_REPORT_BYTES,
  imageReportToken,
  AI_REPORT_FIELDS,
  AI_REPORT_REVIEW_HOURS,
  AI_REPORT_RETENTION_DAYS,
  AI_REPORT_TIMEOUT_MS,
} from '../../src/ai/reportContract.ts';

const URI = 'file:///owned/session-result.png';
const INPUT = Uint8Array.from([137, 80, 78, 71]);
const OUTPUT = Uint8Array.from([1, 2, 3, 4]);
const REFERENCE = { kind: 'free', reference: 'a'.repeat(64) };
const ORIGINAL = { kind: 'free', installationId: 'b'.repeat(64) };
const REPORT_ID = '1723123456789-550e8400-e29b-41d4-a716-446655440000';
const REPORT_TEST_WAIT_MS = 1000;
let owner;
let state;
let parent;
let vault;
let transport;
let allowed;
let releaseGate;

function response(status, body, headers = {}) {
  const reply = new Response(JSON.stringify(body), { status, headers });
  return { status, headers: reply.headers, body: reply.body };
}

async function prepare(token = 'opaque.original-proof') {
  await owner.prepare(1, INPUT, 'Clay', ORIGINAL);
  owner.complete(1, OUTPUT, 'image/png', token, URI);
}

beforeEach(() => {
  allowed = true;
  parent = {
    consent: () => ({ enabled: true, epoch: 1 }),
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
  owner = createAiReportOwner({
    parent,
    vault,
    transport,
    admit: vi.fn(async () => {}),
    current: (target) => allowed && target.kind === 'picture' && target.uri === URI,
    publish: (next) => {
      state = next;
    },
  });
});

it('requires the separate report gate and final send, binding exact original fields and credential', async () => {
  await prepare();
  owner.request(URI);
  expect(parent.request.mock.calls[0][0]).toBe('imageReport');
  expect(state.phase).toBe('gating');
  expect(transport).not.toHaveBeenCalled();
  releaseGate({ valid: () => true });
  expect(state.phase).toBe('confirm');
  expect(state.preview.style).toBe('Clay');
  expect(transport).not.toHaveBeenCalled();
  await owner.send();
  const request = transport.mock.calls[0][0];
  expect(request.path).toBe('/api/report-image');
  expect(request.headers['X-Installation-Id']).toBe(ORIGINAL.installationId);
  expect(request.headers['X-Report-Token']).toBe('opaque.original-proof');
  const form = await new Response(request.body, {
    headers: { 'Content-Type': request.headers['Content-Type'] },
  }).formData();
  expect([...form.keys()]).toEqual(['kind', 'drawing', 'output', 'style']);
  expect(form.get('kind')).toBe('picture');
  expect(form.get('style')).toBe('Clay');
  expect(new Uint8Array(await form.get('drawing').arrayBuffer())).toEqual(INPUT);
  expect(new Uint8Array(await form.get('output').arrayBuffer())).toEqual(OUTPUT);
  expect(state).toEqual({
    phase: 'success',
    target: { kind: 'picture', uri: URI },
    reportId: REPORT_ID,
  });
});

it('fails closed without a current free report token or optional preparation', async () => {
  await prepare(null);
  owner.request(URI);
  expect(state.phase).toBe('unavailable');
  expect(parent.request).not.toHaveBeenCalled();
  vault.pin.mockRejectedValueOnce(new Error('unavailable'));
  await expect(owner.prepare(2, INPUT, 'Felt', ORIGINAL)).resolves.toBeUndefined();
  expect(transport).not.toHaveBeenCalled();
});

it('leaves the waiting state when the parent owner declines authorization', async () => {
  await prepare();
  parent.request.mockReturnValueOnce(false);
  owner.request(URI);
  expect(state.phase).toBe('unavailable');
  expect(state.message).toContain('Parent authorization');
  await owner.send();
  expect(transport).not.toHaveBeenCalled();
});

it('deduplicates sends and suppresses deferred completion after close', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  let resolve;
  transport.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const first = owner.send();
  const second = owner.send();
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce(), {
    timeout: REPORT_TEST_WAIT_MS,
  });
  owner.cancel();
  allowed = false;
  resolve(response(200, { ok: true, reportId: REPORT_ID }));
  await Promise.all([first, second]);
  expect(state.phase).toBe('idle');
});

it('offers explicit report retry after a 429 as shipping does', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  transport.mockResolvedValueOnce(
    response(429, { ok: false, error: 'Please wait.' }, { 'Retry-After': '60' })
  );
  await owner.send();
  expect(state.phase).toBe('error');
  expect(state.retryAt).toBe(0);
  owner.request(URI);
  expect(state.phase).toBe('confirm');
  expect(parent.request).toHaveBeenCalledOnce();
});

it('cancels before upload when the parent proof expires during credential readback', async () => {
  await prepare();
  owner.request(URI);
  let proofValid = true;
  releaseGate({ valid: () => proofValid });
  let finish;
  vault.readReferenced.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const sending = owner.send();
  proofValid = false;
  finish(ORIGINAL);
  await sending;
  expect(transport).not.toHaveBeenCalled();
  expect(state.phase).toBe('idle');
});

it('refuses a replacement installation identity before sending original evidence', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  vault.readReferenced.mockResolvedValueOnce({ ...ORIGINAL, installationId: 'c'.repeat(64) });
  await owner.send();
  expect(transport).not.toHaveBeenCalled();
  expect(state.phase).toBe('error');
  expect(state.message).toContain('Nothing was sent');
});

it.each([
  [200, {}, 'Could not send your picture report.'],
  [
    403,
    { error: 'Cross-site POST form submissions are forbidden' },
    'Cross-site POST form submissions are forbidden',
  ],
  [502, { ok: false, error: 'The report could not be saved.' }, 'The report could not be saved.'],
])(
  'lets a parent retry an unsuccessful %s report without solving the gate again',
  async (status, body, message) => {
    await prepare();
    owner.request(URI);
    releaseGate({ valid: () => true });
    transport.mockResolvedValueOnce(response(status, body));
    await owner.send();
    const shipping = narrowReportReply(body);
    expect(message).toBe(
      shipping && !shipping.ok ? shipping.error : reportFailureMessage('picture')
    );
    expect(state).toMatchObject({ phase: 'error', message });
    owner.request(URI);
    expect(state.phase).toBe('confirm');
    expect(parent.request).toHaveBeenCalledOnce();
    await owner.send();
    expect(state.phase).toBe('success');
    expect(transport).toHaveBeenCalledTimes(2);
  }
);

it('keeps a network failure available for an explicit retry', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  transport.mockRejectedValueOnce(new Error('offline'));
  await owner.send();
  expect(state).toMatchObject({ phase: 'error', message: NETWORK_ERROR_MESSAGE });
  owner.request(URI);
  expect(state.phase).toBe('confirm');
  expect(parent.request).toHaveBeenCalledOnce();
  await owner.send();
  expect(state.phase).toBe('success');
});

it('uses shipping fallback copy for a non-JSON server failure', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  transport.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
  await owner.send();
  expect(state).toMatchObject({ phase: 'error', message: reportFailureMessage('picture') });
  owner.request(URI);
  expect(state.phase).toBe('confirm');
});

it('accepts the same generic success acknowledgement as shipping', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  transport.mockResolvedValueOnce(response(200, { ok: true }));
  await owner.send();
  expect(state).toMatchObject({ phase: 'success', reportId: null });
});

it('releases a report deadline into the shipping timeout message and retry', async () => {
  await prepare();
  owner.request(URI);
  releaseGate({ valid: () => true });
  vi.useFakeTimers();
  try {
    transport.mockImplementationOnce(() => new Promise(() => {}));
    const sending = owner.send();
    await vi.advanceTimersByTimeAsync(AI_REPORT_TIMEOUT_MS);
    await sending;
    expect(state).toMatchObject({ phase: 'error', message: REPORT_TIMEOUT_MESSAGE });
    owner.request(URI);
    expect(state.phase).toBe('confirm');
    expect(parent.request).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('pins multipart fields and private handling promises to the hosted API contract', async () => {
  const source = await readFile(
    new NodeURL('../../src/lib/imageReport.ts', import.meta.url),
    'utf8'
  );
  const block = source.match(/IMAGE_REPORT_FORM_FIELDS = \{([\s\S]*?)\}/)[1];
  const fields = Object.fromEntries(
    [...block.matchAll(/(\w+): '([^']+)'/g)].map((match) => [match[1], match[2]])
  );
  expect(AI_REPORT_FIELDS).toEqual(fields);
  expect(source).toContain(`IMAGE_REPORT_REVIEW_HOURS = ${AI_REPORT_REVIEW_HOURS};`);
  expect(source).toContain(`IMAGE_REPORT_RETENTION_DAYS = ${AI_REPORT_RETENTION_DAYS};`);
});

it('rejects over-budget evidence and collision-checks the multipart boundary', () => {
  const context = {
    id: 1,
    drawing: new TextEncoder().encode('splotch-report-0'),
    style: 'Felt',
    credential: REFERENCE,
    installationId: ORIGINAL.installationId,
    used: false,
    evidence: {
      kind: 'picture',
      bytes: OUTPUT,
      mime: 'image/png',
      token: 'opaque',
      uris: new Set([URI]),
    },
  };
  expect(reportMultipart(context).contentType).toContain('splotch-report-1');
  expect(() =>
    reportMultipart({ ...context, drawing: new Uint8Array(MAX_AI_REPORT_BYTES) })
  ).toThrow();
  expect(imageReportToken('opaque\r\ninjected')).toBeNull();
});

it('preserves original picture proof when retention adds a saved URI without another server reply', async () => {
  await owner.prepare(1, INPUT, 'Clay', ORIGINAL);
  owner.complete(1, OUTPUT, 'image/png', 'opaque.original-proof', 'data:image/png;base64,AQIDBA==');
  owner.complete(1, OUTPUT, 'image/png', null, URI);
  owner.request(URI);
  releaseGate({ valid: () => true });
  await owner.send();
  expect(transport.mock.calls[0][0].headers['X-Report-Token']).toBe('opaque.original-proof');
  expect(state.phase).toBe('success');
});
