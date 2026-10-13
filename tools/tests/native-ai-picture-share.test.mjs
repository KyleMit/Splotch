// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { files } from './native-drawing-screen-harness.mjs';
import { NativeAiPictureView } from '../../experiments/native-architecture/src/ai/NativeAiPictureView.tsx';

const platform = vi.hoisted(() => ({
  share: vi.fn(),
  presentation: { label: 'Share AI picture', complete: 'Share sheet closed.' },
}));
vi.mock('../../experiments/native-architecture/src/platform/aiShare.ts', () => ({
  shareAiPicture: platform.share,
  aiPictureSharePresentation: platform.presentation,
}));
const SAVED = { uri: 'file:///owned/saved-ai.png', mime: 'image/png' };
const OTHER = { uri: 'file:///owned/other-ai.jpg', mime: 'image/jpeg' };
let container;
let root;
let state;
let owner;

function render(picture = SAVED, next = state) {
  state = next;
  return act(() => root.render(createElement(NativeAiPictureView, { owner, state, picture })));
}

async function share() {
  await act(async () => container.querySelector('button[aria-label="Share AI picture"]').click());
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  platform.share.mockReset().mockResolvedValue(undefined);
  platform.presentation.label = 'Share AI picture';
  platform.presentation.complete = 'Share sheet closed.';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  owner = { hasHeldResult: () => true, retryRetention: vi.fn() };
  state = {
    open: true,
    authorized: true,
    gate: { open: false },
    busy: false,
    heldResult: SAVED,
    journal: null,
    pictures: [SAVED, OTHER],
    message: '',
  };
  await render();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it('shares the selected owned URI once while pending and reports only share sheet closure', async () => {
  const pending = deferred();
  platform.share.mockReturnValue(pending.promise);
  await share();
  await share();
  expect(platform.share).toHaveBeenCalledOnce();
  expect(platform.share.mock.calls[0][0]).toEqual(SAVED);
  expect(platform.share.mock.calls[0][1]()).toBe(true);
  expect(container.querySelector('button[aria-label="Share AI picture"]').disabled).toBe(true);
  await act(async () => pending.resolve());
  expect(container.textContent).toContain('Share sheet closed.');
  expect(container.textContent).not.toContain('Shared successfully');
  expect(files.aiSend).not.toHaveBeenCalled();
});

it('gives save-first guidance for a memory result and keeps retention retry', async () => {
  const memory = { uri: 'data:image/png;base64,held', mime: 'image/png' };
  await render(memory, { ...state, heldResult: memory });
  await share();
  expect(platform.share).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Save this AI picture before sharing it.');
  expect(container.querySelector('button[aria-label="Retry saving AI picture"]')).not.toBeNull();
});

it('offers the browser download action for a retained data URI and preserves requested-outcome copy', async () => {
  platform.presentation.label = 'Download AI picture';
  platform.presentation.complete = 'Download requested. Your AI picture stays saved here.';
  const retained = { uri: 'data:image/png;base64,retained', mime: 'image/png' };
  await render(retained, { ...state, heldResult: null, pictures: [retained] });
  await act(async () =>
    container.querySelector('button[aria-label="Download AI picture"]').click()
  );
  expect(platform.share).toHaveBeenCalledOnce();
  expect(platform.share.mock.calls[0][0]).toBe(retained);
  expect(container.textContent).toContain('Download requested.');
  expect(container.textContent).not.toContain('Share sheet closed.');
});

it.each(['switch', 'switch-back', 'closed', 'authorization', 'gate', 'removed', 'unmount'])(
  'invalidates deferred share ownership after %s without stale completion copy',
  async (boundary) => {
    const pending = deferred();
    platform.share.mockReturnValue(pending.promise);
    await share();
    const isCurrent = platform.share.mock.calls[0][1];
    if (boundary === 'unmount') {
      act(() => root.unmount());
      root = null;
    } else if (boundary === 'switch' || boundary === 'switch-back') {
      await render(OTHER);
      if (boundary === 'switch-back') await render(SAVED);
    } else
      await render(SAVED, {
        ...state,
        ...(boundary === 'closed' ? { open: false, authorized: false } : {}),
        ...(boundary === 'authorization' ? { authorized: false } : {}),
        ...(boundary === 'gate' ? { gate: { open: true } } : {}),
        ...(boundary === 'removed' ? { heldResult: null, pictures: [] } : {}),
      });
    expect(isCurrent()).toBe(false);
    await act(async () => pending.resolve());
    expect(container.textContent).not.toContain('Share sheet closed.');
  }
);

it('shows an active failure and allows a fresh retry', async () => {
  platform.share.mockRejectedValueOnce(
    new Error('AI picture sharing is unavailable on this device.')
  );
  await share();
  expect(container.textContent).toContain('AI picture sharing is unavailable on this device.');
  await share();
  expect(platform.share).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('Share sheet closed.');
});
