import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../src/parentCenter/parentGate.ts';
import { createDrawingProduct } from '../../src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../src/ai/generation.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { nativeAiBoundary } from './native-ai-boundary.mjs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
  vi.advanceTimersByTime(PARENT_GATE_SUCCESS_HOLD_MS);
  gate.closed();
}
function pending() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function fixture() {
  const product = createDrawingProduct({ read: async () => null, write: async () => {} }, () => {});
  await product.settings.load();
  const vault = {
    read: vi.fn(async () => null),
    write: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    installationId: vi.fn(async () => 'a'.repeat(64)),
  };
  const storage = nativeAiBoundary().aiStorage;
  const transport = vi.fn(async (request) =>
    request.path === '/api/free-generation-grant'
      ? new Response('{"ok":true,"remaining":10,"limit":10}')
      : new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } })
  );
  const prepare = vi.fn(async () => ({
    bytes: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    originalId: 'picture-1-fixture',
    originalModel: JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] }),
  }));
  const owner = createNativeAi({
    parent: product.port,
    vault,
    storage,
    transport,
    prepare,
    admit: async () => {},
  });
  async function enable() {
    product.openParentCenter();
    solve(product.gate);
    await product.setAiEnabled(true);
    product.closeParentCenter();
  }
  return { product, owner, vault, storage, transport, prepare, enable };
}
it('makes master-off and panel-open negative controls against actual vault, allowance, capture and provider callers', async () => {
  const f = await fixture();
  f.owner.open();
  f.owner.refresh();
  await f.owner.setup('byok', 'fixture-key');
  await f.owner.generate();
  expect(f.owner.getState().open).toBe(false);
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.vault.read).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.storage.readPreparedUpload).not.toHaveBeenCalled();
  await f.enable();
  f.owner.open();
  expect(f.owner.getState().open).toBe(true);
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.vault.read).not.toHaveBeenCalled();
  f.owner.refresh();
  expect(f.transport).not.toHaveBeenCalled();
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  expect(f.transport).toHaveBeenCalledOnce();
  expect(f.transport.mock.calls[0][0].path).toBe('/api/free-generation-grant');
  expect(f.prepare).not.toHaveBeenCalled();
  await f.owner.generate();
  expect(f.prepare).not.toHaveBeenCalled();
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.storage.retain).toHaveBeenCalledOnce());
  expect(f.storage.prepare).toHaveBeenCalledOnce();
  expect(f.storage.readPreparedUpload).toHaveBeenCalledOnce();
  const posted = f.transport.mock.calls.find(
    ([request]) => request.path === '/api/generate-image'
  )[0];
  expect(posted.body).toEqual(f.storage.prepare.mock.calls[0][2]);
  expect(posted.body).not.toBe(f.storage.prepare.mock.calls[0][2]);
  expect(
    f.transport.mock.calls.filter(([request]) => request.path === '/api/generate-image')
  ).toHaveLength(1);
  f.owner.dispose();
  f.product.dispose();
});
it.each(['capture', 'durable prepare', 'pinned upload'])(
  'keeps the solved AI authorization through background during %s',
  async (boundary) => {
    const f = await fixture();
    await f.enable();
    f.owner.open();
    f.owner.refresh();
    solve(f.product.gate);
    await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
    const wait = pending();
    if (boundary === 'capture') {
      const original = await f.prepare();
      f.prepare.mockClear();
      f.prepare.mockImplementationOnce(async () => {
        await wait.promise;
        return original;
      });
    } else {
      const operation =
        boundary === 'durable prepare' ? f.storage.prepare : f.storage.readPreparedUpload;
      const implementation = operation.getMockImplementation();
      operation.mockImplementationOnce(async (...args) => {
        await wait.promise;
        return implementation(...args);
      });
    }
    await f.owner.generate();
    solve(f.product.gate);
    await vi.waitFor(() =>
      expect(
        boundary === 'capture'
          ? f.prepare
          : boundary === 'durable prepare'
            ? f.storage.prepare
            : f.storage.readPreparedUpload
      ).toHaveBeenCalled()
    );
    f.product.background();
    wait.resolve();
    await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
    expect(
      f.transport.mock.calls.filter(([request]) => request.path === '/api/generate-image')
    ).toHaveLength(1);
    expect(f.storage.retain).toHaveBeenCalledOnce();
    expect(f.owner.getState().open).toBe(true);
    f.owner.dispose();
    f.product.dispose();
  }
);
it('continues safe retention of an already-sent image after master-off without retrying generation', async () => {
  const f = await fixture();
  await f.enable();
  f.owner.open();
  f.owner.refresh();
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  const reply = pending();
  f.transport.mockImplementationOnce(() => reply.promise);
  await f.owner.generate();
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.transport).toHaveBeenCalledTimes(2));
  f.product.openParentCenter();
  solve(f.product.gate);
  await f.product.setAiEnabled(false);
  f.owner.close();
  reply.resolve(new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } }));
  await vi.waitFor(() => expect(f.storage.retain).toHaveBeenCalledOnce());
  await f.owner.generate();
  expect(f.transport).toHaveBeenCalledTimes(2);
  f.owner.dispose();
  f.product.dispose();
});

it.each(['master off', 'dispose'])(
  'revokes the funded POST during pinned upload on %s while retaining its local journal',
  async (lifetime) => {
    const f = await fixture();
    await f.enable();
    f.owner.open();
    f.owner.refresh();
    solve(f.product.gate);
    await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
    const wait = pending();
    const readPinned = f.storage.readPreparedUpload.getMockImplementation();
    f.storage.readPreparedUpload.mockImplementationOnce(async (...args) => {
      await wait.promise;
      return readPinned(...args);
    });
    await f.owner.generate();
    solve(f.product.gate);
    await vi.waitFor(() => expect(f.storage.readPreparedUpload).toHaveBeenCalledOnce());
    if (lifetime === 'master off') {
      f.product.openParentCenter();
      solve(f.product.gate);
      await f.product.setAiEnabled(false);
    } else f.owner.dispose();
    wait.resolve();
    await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
    expect(f.storage.prepare).toHaveBeenCalledOnce();
    expect(f.storage.write).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed' }));
    expect(
      f.transport.mock.calls.filter(([request]) => request.path === '/api/generate-image')
    ).toHaveLength(0);
    expect(f.storage.retain).not.toHaveBeenCalled();
    f.owner.dispose();
    f.product.dispose();
  }
);

it('keeps an authorized AI response while a parent opens Parent Center', async () => {
  const f = await fixture();
  await f.enable();
  f.owner.open();
  f.owner.refresh();
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.owner.getState().busy).toBe(false));
  const reply = pending();
  f.transport.mockImplementationOnce(() => reply.promise);
  await f.owner.generate();
  solve(f.product.gate);
  await vi.waitFor(() => expect(f.transport).toHaveBeenCalledTimes(2));
  f.product.openParentCenter();
  solve(f.product.gate);
  reply.resolve(new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } }));
  await vi.waitFor(() => expect(f.storage.retain).toHaveBeenCalledOnce());
  expect(f.owner.getState().open).toBe(true);
  f.owner.dispose();
  f.product.dispose();
});
