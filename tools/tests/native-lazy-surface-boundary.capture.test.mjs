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
  vi.doUnmock('../../experiments/native-architecture/src/lazyExport.ts');
  vi.doUnmock('../../experiments/native-architecture/src/drawing/pageArtChunk.web.ts');
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function webPictureCapture(load) {
  vi.resetModules();
  vi.doMock('../../experiments/native-architecture/src/drawing/pageArtChunk.web.ts', () => ({
    PictureCapture: ({ packet }) => createElement('div', { 'data-capture-id': packet.id }),
  }));
  vi.doMock('../../experiments/native-architecture/src/lazyExport.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      createLazyExport: (importCapture) =>
        actual.createLazyExport(() => load().then(importCapture)),
    };
  });
  return (
    await import('../../experiments/native-architecture/src/drawing/pictureCaptureSurface.web.ts')
  ).PictureCapture;
}

it('loads capture only for a real packet, cancels a failed load and retries the next request', async () => {
  const { createPngCapture } =
    await import('../../experiments/native-architecture/src/drawing/interactions.ts');
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
    const { createPngCapture } =
      await import('../../experiments/native-architecture/src/drawing/interactions.ts');
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
