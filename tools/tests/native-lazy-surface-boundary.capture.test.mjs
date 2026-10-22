// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';

const CHUNK_FAILURE = new Error('Loading module /_expo/static/js/web/PictureCapture-1.js failed.');
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.doUnmock('../../src/lazyExport.ts');
  vi.doUnmock('../../src/drawing/pageArtChunk.web.ts');
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function webPictureCapture(load, exportName = 'PictureCapture') {
  vi.resetModules();
  vi.doMock('../../src/drawing/pageArtChunk.web.ts', () => ({
    PictureCapture: ({ packet }) => createElement('div', { 'data-capture-id': packet.id }),
    FixedInkCapture: ({ plan, onReady }) =>
      createElement('button', { 'data-fixed-id': plan.id, onClick: () => onReady(plan) }),
  }));
  vi.doMock('../../src/lazyExport.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      createLazyExport: (importCapture) =>
        actual.createLazyExport(() => load().then(importCapture)),
    };
  });
  return (await import('../../src/drawing/pictureCaptureSurface.web.ts'))[exportName];
}

it('loads capture only for a real packet, cancels a failed load and retries the next request', async () => {
  const { createPngCapture } = await import('../../src/drawing/interactions.ts');
  const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILURE).mockResolvedValue(undefined);
  const Capture = await webPictureCapture(load);
  await settle();
  expect(load).not.toHaveBeenCalled();
  const captures = createPngCapture();
  const drawing = adoptedDrawing({ width: 400, height: 800, pixelRatio: 1 });
  const first = captures.begin(drawing, () => true);
  const refused = first.promise.catch((error) => error.message);
  await act(async () =>
    root.render(
      createElement(Capture, { packet: { id: 1, request: first, isCurrent: () => true } })
    )
  );
  await expect(refused).resolves.toBe(CHUNK_FAILURE.message);
  expect(host.querySelector('[data-capture-id]')).toBeNull();
  await act(async () => root.render(null));
  const second = captures.begin(drawing, () => true);
  const completion = second.promise.catch((error) => error.message);
  await act(async () =>
    root.render(
      createElement(Capture, { packet: { id: 2, request: second, isCurrent: () => true } })
    )
  );
  expect(load).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[data-capture-id="2"]')).not.toBeNull();
  await act(async () => root.render(null));
  await expect(completion).resolves.toContain('cancelled');
});

it.each(['unmount', 'resize'])(
  'refuses a late capture chunk after %s cancels its packet',
  async (reason) => {
    const { createPngCapture } = await import('../../src/drawing/interactions.ts');
    let finish;
    const load = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const Capture = await webPictureCapture(load);
    const drawing = adoptedDrawing({ width: 400, height: 800, pixelRatio: 1 });
    const captures = createPngCapture();
    const request = captures.begin(drawing, () => true);
    const refused = request.promise.catch((error) => error.message);
    let current = true;
    const packet = { id: 1, request, isCurrent: () => current };
    await act(async () => root.render(createElement(Capture, { packet })));
    expect(load).toHaveBeenCalledOnce();
    await act(async () => {
      current = false;
      if (reason === 'unmount') root.render(null);
      else {
        request.cancel('The picture changed before capture finished.');
        root.render(createElement(Capture, { packet }));
      }
    });
    await expect(refused).resolves.toContain(reason === 'unmount' ? 'cancelled' : 'changed');
    await act(async () => finish());
    expect(host.querySelector('[data-capture-id]')).toBeNull();
  }
);

it('reports a fixed capture chunk failure and retries a later mounted plan', async () => {
  const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILURE).mockResolvedValue(undefined);
  const Fixed = await webPictureCapture(load, 'FixedInkCapture');
  const onError = vi.fn();
  const onReady = vi.fn();
  await act(async () => root.render(createElement(Fixed, { plan: { id: 1 }, onError, onReady })));
  await settle();
  expect(onError).toHaveBeenCalledExactlyOnceWith(CHUNK_FAILURE);
  expect(onReady).not.toHaveBeenCalled();
  expect(host.querySelector('[data-fixed-id]')).toBeNull();
  await act(async () => root.render(null));
  const plan = { id: 2 };
  await act(async () => root.render(createElement(Fixed, { plan, onError, onReady })));
  await settle();
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => host.querySelector('[data-fixed-id="2"]').click());
  expect(onReady).toHaveBeenCalledExactlyOnceWith(plan);
});

it('does not report a late fixed capture failure after its owner unmounts', async () => {
  let refuse;
  const load = vi.fn(
    () =>
      new Promise((_, reject) => {
        refuse = reject;
      })
  );
  const Fixed = await webPictureCapture(load, 'FixedInkCapture');
  const onError = vi.fn();
  const onReady = vi.fn();
  await act(async () => root.render(createElement(Fixed, { plan: { id: 1 }, onError, onReady })));
  await act(async () => root.render(null));
  await act(async () => refuse(CHUNK_FAILURE));
  expect(load).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
});

it('renders only the replacement fixed plan after a delayed capture chunk arrives', async () => {
  let finish;
  const load = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const Fixed = await webPictureCapture(load, 'FixedInkCapture');
  const onError = vi.fn();
  const oldReady = vi.fn();
  const newReady = vi.fn();
  await act(async () =>
    root.render(createElement(Fixed, { plan: { id: 1 }, onError, onReady: oldReady }))
  );
  const plan = { id: 2 };
  await act(async () => root.render(createElement(Fixed, { plan, onError, onReady: newReady })));
  await act(async () => finish());
  await settle();
  expect(host.querySelector('[data-fixed-id="1"]')).toBeNull();
  await act(async () => host.querySelector('[data-fixed-id="2"]').click());
  expect(oldReady).not.toHaveBeenCalled();
  expect(newReady).toHaveBeenCalledExactlyOnceWith(plan);
  expect(onError).not.toHaveBeenCalled();
});
