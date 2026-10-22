import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../src/parentCenter/parentGate.ts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../src/ai/generation.ts';
import { JOB_TTL_MS } from '../../src/ai/contract.ts';
import { aiButtonFace, aiResultPhase } from '../../src/ai/uiState.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { nativeAiBoundary } from './native-ai-boundary.mjs';
import { FREE_DAILY_LIMIT_EXHAUSTED_CODE } from '../../src/lib/ai/generationResult.ts';
import { AI_FAILURE_RETRY_LIMIT } from '../../src/ai/uiState.ts';

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

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
  cleanups.push(() => {
    owner.dispose();
    product.dispose();
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

it.each(['unknown', 'sent', 'pending', 'result'])(
  'opens a fresh prompt behind the AI check with a saved %s attempt after relaunch',
  async (phase) => {
    const sentAt = Date.now() - JOB_TTL_MS - 1;
    const journal = Object.freeze({
      version: 1,
      id: sentAt,
      createdAt: sentAt,
      style: 'Sticker',
      originalId: 'picture-1-fixture',
      phase,
      jobId: 'b'.repeat(64),
      result: phase === 'result' ? { uri: 'file:///old.png', mime: 'image/png' } : null,
    });
    const f = await fixture({ stored: { kind: 'native', receipt: { kind: 'prepared', journal } } });
    f.owner.start({ onSetup: vi.fn(), customize: true });
    expect(f.product.gate.getState()).toMatchObject({ open: true, feature: 'ai' });
    solve(f.product.gate);
    await vi.waitFor(() => expect(f.owner.getState().open).toBe(true));
    expect(f.owner.getState()).toMatchObject({
      view: 'prompt',
      attempt: null,
      journal: null,
      recovery: null,
      heldResult: null,
      pictures: [],
    });
    expect(f.storage.read).not.toHaveBeenCalled();
    expect(f.storage.write).not.toHaveBeenCalled();
    expect(f.transport.mock.calls.map(([request]) => request.path)).toEqual([
      '/api/free-generation-grant',
    ]);
  }
);

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

it('releases a minimized run held past its server window and retries under its original approval', async () => {
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
    expect(f.product.gate.getState().open).toBe(false);
    await vi.waitFor(() => expect(generateCalls(f)).toHaveLength(2));
  } finally {
    clock.mockRestore();
  }
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
  [
    'unavailable today',
    () =>
      new Response(
        JSON.stringify({ ok: false, code: FREE_DAILY_LIMIT_EXHAUSTED_CODE, error: 'Not today' }),
        { status: 503 }
      ),
  ],
])(
  'sends a grown-up to Settings when the free allowance is %s, as shipping does',
  async (_, reply) => {
    const f = await fixture({ generate: reply });
    const onSetup = await sendStyle(f);
    expect(onSetup).toHaveBeenCalledOnce();
    expect(f.owner.getState().open).toBe(false);
  }
);

// Shipping keeps a grant it knows for the launch, so a used-up answer from a generation stays
// used up when Settings opens and reads the credential (#3024). Negative control: a Settings read
// that asks the grant endpoint again shows the stale allowance here.
it('keeps a used-up answer when Settings reads the allowance afterwards', async () => {
  const f = await fixture({
    generate: () =>
      new Response(
        JSON.stringify({ ok: false, code: 'FREE_GRANT_EXHAUSTED', error: 'Used up', remaining: 0 }),
        { status: 403 }
      ),
  });
  await sendStyle(f);
  expect(f.owner.getState()).toMatchObject({ credential: 'free', remaining: 0 });
  const grants = () =>
    f.transport.mock.calls.filter(([request]) => request.path === '/api/free-generation-grant');
  const asked = grants().length;
  await f.owner.inspect();
  expect(f.owner.getState()).toMatchObject({ remaining: 0, availability: 'ready' });
  expect(aiButtonFace(f.owner.getState(), false)).toMatchObject({
    label: 'Set up AI image',
    badge: 0,
  });
  expect(grants()).toHaveLength(asked);
});

const usedUp = () =>
  new Response(
    JSON.stringify({ ok: false, code: 'FREE_GRANT_EXHAUSTED', error: 'Used up', remaining: 0 }),
    { status: 403 }
  );
const grantRequests = (f) =>
  f.transport.mock.calls.filter(([request]) => request.path === '/api/free-generation-grant');

// A zero any authoritative answer gives stands as the exhausted one does: a grant of 0 and a
// creation whose count header says 0 (#3024). Negative control: recording only the exhausted
// refusal leaves both reading the grant again here.
it.each([
  [
    'a grant',
    { grant: () => new Response('{"ok":true,"remaining":0,"limit":10}') },
    async () => {},
  ],
  [
    "a creation's count",
    {
      generate: () =>
        new Response(rgbaPng(2, 2, 255), {
          headers: { 'Content-Type': 'image/png', 'X-Free-Generations-Remaining': '0' },
        }),
    },
    sendStyle,
  ],
])('keeps a zero that %s gave through a later Settings read', async (_, replies, answer) => {
  const f = await fixture(replies);
  await f.owner.inspect();
  await answer(f);
  await vi.waitFor(() => expect(f.owner.getState().remaining).toBe(0));
  const asked = grantRequests(f).length;
  await f.owner.inspect();
  expect(f.owner.getState().remaining).toBe(0);
  expect(grantRequests(f)).toHaveLength(asked);
});

// Only turning AI off or on starts a new span: another parent choice keeps the used-up answer.
// Negative control: keying the answer to the consent epoch, which any parent choice moves, fails.
it('keeps a used-up answer through an unrelated parent choice', async () => {
  const f = await fixture({ generate: usedUp });
  await sendStyle(f);
  f.product.openParentCenter();
  solve(f.product.gate);
  await f.product.setPolicy('feedback', 'session');
  f.product.closeParentCenter();
  const asked = grantRequests(f).length;
  await f.owner.inspect();
  expect(f.owner.getState().remaining).toBe(0);
  expect(grantRequests(f)).toHaveLength(asked);
});

// AI switched off and on while the refusal's journal is still being written must not adopt the
// old answer. Negative control: reading the span after the write fails here.
it('drops a used-up answer whose journal write outlived an AI off and on', async () => {
  const f = await fixture({ generate: usedUp });
  await f.owner.inspect();
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const write = f.storage.write.getMockImplementation();
  f.storage.write.mockImplementation(async (next) => {
    if (next.phase === 'failed') await held;
    return write(next);
  });
  f.owner.start({ onSetup: vi.fn(), customize: true });
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState()).toMatchObject({ open: true, view: 'prompt' }));
  f.owner.pickStyle('Clay');
  await vi.waitFor(() =>
    expect(f.storage.write.mock.calls.some(([next]) => next.phase === 'failed')).toBe(true)
  );
  f.product.openParentCenter();
  solve(f.product.gate);
  await f.product.setAiEnabled(false);
  await f.product.setAiEnabled(true);
  f.product.closeParentCenter();
  release();
  await f.settled();
  await f.owner.inspect();
  expect(f.owner.getState().remaining).toBe(10);
});

// Turning AI off and on again reads the grant afresh, as shipping's eligibility does, so an
// allowance the server has since restored comes back. Negative control: a used-up answer kept
// through the switch leaves the count at 0 here.
it('reads the allowance again after AI is turned off and on following a used-up answer', async () => {
  const f = await fixture({
    generate: () =>
      new Response(
        JSON.stringify({ ok: false, code: 'FREE_GRANT_EXHAUSTED', error: 'Used up', remaining: 0 }),
        { status: 403 }
      ),
  });
  await sendStyle(f);
  expect(f.owner.getState().remaining).toBe(0);
  f.product.openParentCenter();
  solve(f.product.gate);
  await f.product.setAiEnabled(false);
  await f.product.setAiEnabled(true);
  f.product.closeParentCenter();
  await f.owner.inspect();
  expect(f.owner.getState()).toMatchObject({ remaining: 10, availability: 'ready' });
});

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

const failed = (status, body) => () =>
  new Response(JSON.stringify({ ok: false, error: body }), { status });
const generateCalls = (f) =>
  f.transport.mock.calls.filter(([request]) => request.path === '/api/generate-image');

it('offers Try again after a plain 503 rather than sending the grown-up to Settings', async () => {
  const onSetup = vi.fn();
  const f = await fixture({ generate: failed(503, 'Busy') });
  await sendStyle(f, onSetup);
  expect(onSetup).not.toHaveBeenCalled();
  expect(aiResultPhase(f.owner.getState())).toEqual({ kind: 'error', reason: 'retry' });
});

it('offers Try again after a throttled start and sends again at once when it is tapped', async () => {
  const f = await fixture({ generate: failed(429, 'Slow down') });
  await sendStyle(f);
  expect(aiResultPhase(f.owner.getState())).toEqual({ kind: 'error', reason: 'retry' });
  expect(f.owner.getState()).toMatchObject({ retryAt: 0, availability: 'ready' });
  f.owner.retry();
  await vi.waitFor(() => expect(generateCalls(f)).toHaveLength(2));
});

it('sends the drawing the failed run sent when Try again is tapped, not the canvas as it is now', async () => {
  let reply = failed(502, 'Upstream down');
  const f = await fixture({ generate: () => reply() });
  await sendStyle(f);
  const sent = generateCalls(f)[0][0].body;
  f.prepare.mockResolvedValue({
    bytes: rgbaPng(4, 3, 0),
    originalId: 'picture-2-fixture',
    originalModel: JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] }),
  });
  reply = picture;
  f.owner.retry();
  await vi.waitFor(() => expect(generateCalls(f)).toHaveLength(2));
  await f.settled();
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(generateCalls(f)[1][0].body).toEqual(sent);
  expect(generateCalls(f)[1][0].query).toBe('style=Clay');
  expect(aiResultPhase(f.owner.getState()).kind).toBe('result');
});

it('starts the repeated-failure count afresh once the card is closed, as shipping does', async () => {
  const f = await fixture({ generate: failed(502, 'Upstream down') });
  await sendStyle(f);
  for (let failures = 1; failures < AI_FAILURE_RETRY_LIMIT; failures++) {
    f.owner.retry();
    await vi.waitFor(() => expect(f.owner.getState().failures).toBe(failures + 1));
    await f.settled();
  }
  expect(aiResultPhase(f.owner.getState())).toEqual({ kind: 'error', reason: 'rest' });
  f.owner.dismiss();
  expect(f.owner.getState().failures).toBe(0);
  await sendStyle(f);
  expect(aiResultPhase(f.owner.getState())).toEqual({ kind: 'error', reason: 'retry' });
});
