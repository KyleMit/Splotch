import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { JOB_TTL_MS } from '../../experiments/native-architecture/src/ai/contract.ts';
import { aiResultPhase } from '../../experiments/native-architecture/src/ai/uiState.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { nativeAiBoundary } from './native-ai-boundary.mjs';

const GRANT = '{"ok":true,"remaining":10,"limit":10}';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
  vi.advanceTimersByTime(PARENT_GATE_SUCCESS_HOLD_MS);
  gate.closed();
}
const picture = () =>
  new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } });
async function fixture({
  grant = () => new Response(GRANT),
  stored = null,
  generate = picture,
  dismissal = undefined,
} = {}) {
  const product = createDrawingProduct({ read: async () => null, write: async () => {} }, () => {});
  await product.settings.load();
  product.openParentCenter();
  solve(product.gate);
  await product.setAiEnabled(true);
  product.closeParentCenter();
  const boundary = nativeAiBoundary();
  if (stored) boundary.aiStorage.read.mockResolvedValue(stored);
  const transport = vi.fn(async (request) =>
    request.path === '/api/free-generation-grant'
      ? grant()
      : request.path === '/api/generate-image'
        ? generate()
        : picture()
  );
  const report = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
  const prepare = vi.fn(async () => ({
    bytes: rgbaPng(4, 3, 255),
    originalId: 'picture-1-fixture',
    originalModel: JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] }),
  }));
  const owner = createNativeAi({
    parent: product.port,
    vault: boundary.aiVault,
    storage: boundary.aiStorage,
    transport,
    prepare,
    admit: async () => {},
    dismissal,
    problems: {
      platform: 'web',
      transport: report,
      device: () => ({ platform: 'Android' }),
      offline: () => false,
    },
  });
  const settled = () => vi.waitFor(() => expect(owner.getState().busy).toBe(false));
  return { product, owner, storage: boundary.aiStorage, transport, prepare, settled, report };
}

it('checks the free allowance without asking a grown-up and without reading the drawing', async () => {
  const f = await fixture();
  expect(f.owner.getState().availability).toBe('loading');
  await f.owner.inspect();
  expect(f.owner.getState()).toMatchObject({
    availability: 'ready',
    credential: 'free',
    remaining: 10,
    open: false,
  });
  expect(f.product.gate.getState().open).toBe(false);
  expect(f.transport.mock.calls.map(([request]) => request.path)).toEqual([
    '/api/free-generation-grant',
  ]);
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.storage.read).not.toHaveBeenCalled();
});

it('marks the allowance unavailable when the grant cannot be read', async () => {
  const f = await fixture({ grant: () => new Response('{"ok":false}', { status: 503 }) });
  await f.owner.inspect();
  expect(f.owner.getState().availability).toBe('unavailable');
});

it('sends with the allowance the wand already read, asking the server for it once', async () => {
  const f = await fixture();
  await f.owner.inspect();
  await sendStyle(f);
  expect(aiResultPhase(f.owner.getState()).kind).toBe('result');
  expect(
    f.transport.mock.calls.filter(([request]) => request.path === '/api/free-generation-grant')
  ).toHaveLength(1);
});

it('asks a grown-up at the wand, then opens the style prompt and sends a picked style without asking again', async () => {
  const f = await fixture();
  const onSetup = vi.fn();
  f.owner.start({ onSetup, customize: true });
  expect(f.product.gate.getState()).toMatchObject({ open: true, feature: 'ai' });
  expect(f.owner.getState().open).toBe(false);
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().open).toBe(true));
  expect(f.owner.getState().view).toBe('prompt');
  expect(onSetup).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  f.owner.pickStyle('Clay');
  expect(f.owner.getState()).toMatchObject({ view: 'result', style: 'Clay' });
  expect(aiResultPhase(f.owner.getState()).kind).toBe('generating');
  expect(f.product.gate.getState().open).toBe(false);
  await f.settled();
  const generate = f.transport.mock.calls.find(
    ([request]) => request.path === '/api/generate-image'
  );
  expect(generate[0].query).toBe('style=Clay');
  expect(aiResultPhase(f.owner.getState()).kind).toBe('result');
});

it('skips the style prompt with style choice off and sends no style, as shipping does', async () => {
  const f = await fixture();
  f.owner.start({ onSetup: vi.fn(), customize: false });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
  expect(f.owner.getState()).toMatchObject({ open: true, view: 'result' });
  expect(f.product.gate.getState().open).toBe(false);
  await f.settled();
  const generate = f.transport.mock.calls.find(
    ([request]) => request.path === '/api/generate-image'
  );
  expect(generate[0].query).toBeUndefined();
  expect(aiResultPhase(f.owner.getState()).kind).toBe('result');
});

it('sends a grown-up to Settings instead of the prompt when no free picture is left', async () => {
  const f = await fixture({ grant: () => new Response('{"ok":true,"remaining":0,"limit":10}') });
  const onSetup = vi.fn();
  f.owner.start({ onSetup, customize: true });
  solve(f.product.gate);
  await vi.waitFor(() => expect(onSetup).toHaveBeenCalledOnce());
  expect(f.owner.getState().open).toBe(false);
  expect(f.prepare).not.toHaveBeenCalled();
});

it('releases an attempt held past its server window when the wand is next tapped', async () => {
  const sentAt = Date.now() - JOB_TTL_MS - 1;
  const journal = Object.freeze({
    version: 1,
    id: sentAt,
    createdAt: sentAt,
    style: 'Sticker',
    originalId: 'picture-1-fixture',
    phase: 'unknown',
    jobId: null,
    result: null,
  });
  const f = await fixture({
    stored: { kind: 'native', receipt: { kind: 'prepared', journal } },
  });
  f.owner.start({ onSetup: vi.fn(), customize: true });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().open).toBe(true));
  expect(f.storage.write).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed' }));
  expect(f.owner.getState().view).toBe('prompt');
});

it('reopens a run left waiting before a reload on the result card and checks on it', async () => {
  const sentAt = Date.now() - 60_000;
  const journal = Object.freeze({
    version: 1,
    id: sentAt,
    createdAt: sentAt,
    style: 'Sticker',
    originalId: 'picture-1-fixture',
    phase: 'pending',
    jobId: 'b'.repeat(64),
    result: null,
  });
  const f = await fixture({
    stored: { kind: 'native', receipt: { kind: 'prepared', journal } },
  });
  f.owner.start({ onSetup: vi.fn(), customize: true });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().open).toBe(true));
  expect(f.owner.getState()).toMatchObject({
    view: 'result',
    attempt: { kind: 'journal', id: sentAt },
  });
  await vi.waitFor(() =>
    expect(
      f.transport.mock.calls.some(([request]) => request.path === '/api/generation-result')
    ).toBe(true)
  );
});

// Through the gate to the prompt, then a picked style.
async function sendStyle(f, onSetup = vi.fn()) {
  f.owner.start({ onSetup, customize: true });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState()).toMatchObject({ open: true, view: 'prompt' }));
  f.owner.pickStyle('Clay');
  await f.settled();
  return onSetup;
}
const ticket = () =>
  new Response(JSON.stringify({ ok: true, jobId: 'b'.repeat(64), pollAfterMs: 60_000 }), {
    status: 202,
  });

it('releases a minimized run held past its server window when it is shown again, and asks again for a new one', async () => {
  const f = await fixture({ generate: ticket });
  await sendStyle(f);
  expect(f.owner.getState().journal.phase).toBe('pending');
  f.owner.minimize();
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + JOB_TTL_MS + 1);
  try {
    f.owner.start({ onSetup: vi.fn(), customize: true });
    await vi.waitFor(() => expect(f.owner.getState().journal.phase).toBe('failed'));
    expect(f.owner.getState().minimized).toBe(false);
    expect(aiResultPhase(f.owner.getState())).toEqual({ kind: 'error', reason: 'retry' });
    f.product.openParentCenter();
    f.product.gate.dismiss();
    f.product.closeParentCenter();
    f.owner.retry();
    expect(f.product.gate.getState()).toMatchObject({ open: true, feature: 'ai' });
  } finally {
    clock.mockRestore();
  }
});

it('brings back a finished picture nobody dismissed past the server window, and remembers its close across a reload', async () => {
  const createdAt = Date.now() - JOB_TTL_MS - 60_000;
  const journal = Object.freeze({
    version: 1,
    id: createdAt,
    createdAt,
    style: 'Clay',
    originalId: 'picture-1-fixture',
    phase: 'result',
    jobId: 'b'.repeat(64),
    result: { uri: 'file:///fixture/ai.png', mime: 'image/png' },
  });
  const saved = { id: null };
  const dismissal = {
    read: async () => saved.id,
    write: async (id) => {
      saved.id = id;
    },
  };
  const stored = { kind: 'native', receipt: { kind: 'prepared', journal } };
  const f = await fixture({ stored, dismissal });
  f.owner.start({ onSetup: vi.fn(), customize: true });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().open).toBe(true));
  expect(f.owner.getState().view).toBe('result');
  expect(aiResultPhase(f.owner.getState())).toMatchObject({
    kind: 'result',
    picture: { uri: 'file:///fixture/ai.png' },
  });
  f.owner.dismiss();
  expect(saved.id).toBe(String(createdAt));
  const reloaded = await fixture({ stored, dismissal });
  reloaded.owner.start({ onSetup: vi.fn(), customize: true });
  solve(reloaded.product.gate);
  await vi.waitFor(() => expect(reloaded.owner.getState().open).toBe(true));
  expect(reloaded.owner.getState().view).toBe('prompt');
});

it.each([
  [
    'used up',
    () =>
      new Response(
        JSON.stringify({ ok: false, code: 'FREE_GRANT_EXHAUSTED', error: 'Used up', remaining: 0 }),
        { status: 403 }
      ),
  ],
  ['unavailable', () => new Response('{"ok":false,"error":"No key"}', { status: 503 })],
])(
  'sends a grown-up to Settings when the free allowance is %s, as shipping does',
  async (_, reply) => {
    const f = await fixture({ generate: reply });
    const onSetup = await sendStyle(f);
    expect(onSetup).toHaveBeenCalledOnce();
    expect(f.owner.getState().open).toBe(false);
  }
);

it('reports a failed run behind the report check with its bounded details and no drawing', async () => {
  const f = await fixture({
    generate: () => new Response('{"ok":false,"error":"Upstream down"}', { status: 502 }),
  });
  await sendStyle(f);
  expect(aiResultPhase(f.owner.getState())).toEqual({ kind: 'error', reason: 'retry' });
  f.owner.reportProblem();
  expect(f.product.gate.getState()).toMatchObject({ open: true, feature: 'imageReport' });
  expect(f.owner.getState().problem.phase).toBe('gating');
  solve(f.product.gate);
  const confirm = f.owner.getState().problem;
  expect(confirm.phase).toBe('confirm');
  expect(confirm.rows).toEqual([
    { label: 'Error', value: '502 · /api/generate-image' },
    { label: 'Message', value: 'Upstream down' },
    { label: 'Attempts', value: '1 in a row' },
    { label: 'App version', value: expect.stringMatching(/ \(web\)$/) },
    { label: 'Art style', value: 'Clay' },
  ]);
  await f.owner.sendProblemReport();
  const [body] = f.report.mock.calls[0];
  expect(body.kind).toBe('bug');
  expect(body.message).toContain('Error: 502 · /api/generate-image');
  expect(body).not.toHaveProperty('device');
  expect(JSON.stringify(body)).not.toMatch(/data:image|installation|aaaaaaaa/);
  expect(f.owner.getState().problem).toEqual({
    phase: 'success',
    message: 'Thanks. Your problem report was sent to our private support tracker.',
  });
});
it('names no art style in a problem report for a run sent with style choice off', async () => {
  const f = await fixture({
    generate: () => new Response('{"ok":false,"error":"Upstream down"}', { status: 502 }),
  });
  f.owner.start({ onSetup: vi.fn(), customize: false });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
  await f.settled();
  expect(aiResultPhase(f.owner.getState())).toEqual({
    kind: 'error',
    reason: 'retry',
  });
  f.owner.reportProblem();
  solve(f.product.gate);
  expect(f.owner.getState().problem.rows).toContainEqual({
    label: 'Art style',
    value: 'Default',
  });
});
