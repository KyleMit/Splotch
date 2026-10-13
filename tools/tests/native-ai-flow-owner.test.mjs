import { expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { JOB_TTL_MS } from '../../experiments/native-architecture/src/ai/contract.ts';
import { aiResultPhase } from '../../experiments/native-architecture/src/ai/uiState.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { nativeAiBoundary } from './native-ai-boundary.mjs';

const GRANT = '{"ok":true,"remaining":10,"limit":10}';

function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
}
async function fixture({ grant = () => new Response(GRANT), stored = null } = {}) {
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
      : new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } })
  );
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
  });
  const settled = () => vi.waitFor(() => expect(owner.getState().busy).toBe(false));
  return { product, owner, storage: boundary.aiStorage, transport, prepare, settled };
}

it('checks the free allowance without asking a grown-up and without reading the drawing', async () => {
  const f = await fixture();
  expect(f.owner.getState().availability).toBe('loading');
  await f.owner.checkAvailability();
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
  await f.owner.checkAvailability();
  expect(f.owner.getState().availability).toBe('unavailable');
});

it('asks a grown-up at the wand, then opens the style prompt and sends a picked style without asking again', async () => {
  const f = await fixture();
  const onSetup = vi.fn();
  f.owner.start(onSetup);
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

it('sends a grown-up to Settings instead of the prompt when no free picture is left', async () => {
  const f = await fixture({ grant: () => new Response('{"ok":true,"remaining":0,"limit":10}') });
  const onSetup = vi.fn();
  f.owner.start(onSetup);
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
  f.owner.start(vi.fn());
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
  f.owner.start(vi.fn());
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
