// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { files } from './native-drawing-screen-harness.mjs';
import { NativeAiSheet } from '../../experiments/native-architecture/src/ai/AiSheet.tsx';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';

const RESULT = { uri: 'file:///owned/current-ai.png', mime: 'image/png' };
const SAVED = { uri: 'file:///owned/saved-ai.png', mime: 'image/png' };
let container;
let root;
let state;
let owner;

function render(next, visible = next.open) {
  state = next;
  return act(() =>
    root.render(
      createElement(NativeAiSheet, { owner, state, visible, drawing: emptyDrawing(), artwork: {} })
    )
  );
}

async function click(label) {
  const button = container.querySelector(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  owner = {
    close: vi.fn(() => render({ ...state, open: false, authorized: false })),
    hasHeldResult: vi.fn(() => true),
    retryRetention: vi.fn(),
    refresh: vi.fn(),
    chooseStyle: vi.fn(),
    generate: vi.fn(),
    resume: vi.fn(),
    releaseExpired: vi.fn(),
    prepareRecovery: vi.fn(),
    collectRecovery: vi.fn(),
    sendRecovery: vi.fn(),
    reconcileRecovery: vi.fn(),
    acknowledgeRecovery: vi.fn(),
    readRecoverySource: vi.fn(async () => null),
    setup: vi.fn(),
    removeCredential: vi.fn(),
    gateInput: vi.fn(),
    gateAnswer: vi.fn(),
  };
  await render({
    open: true,
    authorized: true,
    gate: { open: false, x: 3, y: 4, input: '', message: '', locked: false },
    style: 'Clay',
    busy: false,
    remaining: 2,
    credential: 'free',
    journal: null,
    recovery: null,
    heldResult: RESULT,
    pictures: [SAVED],
    message: 'Your picture is held. Retry saving it.',
    retryAt: 0,
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it('opens the current picture inside one modal, returns, keeps retry available and lists no gallery', async () => {
  await click('Open AI picture');
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(container.querySelector('img[alt="Opened AI picture"]').getAttribute('src')).toBe(
    RESULT.uri
  );
  expect(container.querySelector('button[aria-label="Send drawing for AI"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Retry saving AI picture"]')).not.toBeNull();
  await click('Back');
  await click('Retry saving AI picture');
  expect(owner.retryRetention).toHaveBeenCalledOnce();
  // Shipping keeps no AI gallery, so an earlier picture is never listed to reopen.
  expect(container.querySelector('button[aria-label^="Open saved AI picture"]')).toBeNull();
  expect(container.querySelector(`img[src="${SAVED.uri}"]`)).toBeNull();
  await click('Open AI picture');
  await act(async () => {
    container
      .querySelector('[role="dialog"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(container.querySelector('img[alt="Opened AI picture"]')).toBeNull();
  expect(owner.close).not.toHaveBeenCalled();
  await click('Open AI picture');
  await click('Keep drawing');
  expect(owner.close).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultRead).not.toHaveBeenCalled();
});

it.each(['gate', 'authorization', 'closed', 'hidden', 'removed'])(
  'drops an open picture when its current %s boundary changes',
  async (boundary) => {
    await click('Open AI picture');
    await click('Zoom in');
    expect(container.querySelector('img[alt="Opened AI picture"]')).not.toBeNull();
    const invalid = {
      gate: { ...state, gate: { ...state.gate, open: true } },
      authorization: { ...state, authorized: false },
      closed: { ...state, open: false },
      hidden: state,
      removed: { ...state, heldResult: null },
    }[boundary];
    await render(invalid, boundary !== 'hidden' && invalid.open);
    expect(container.querySelector('img[alt="Opened AI picture"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Zoom in"]')).toBeNull();
    await render({
      ...invalid,
      open: true,
      authorized: true,
      gate: { ...invalid.gate, open: false },
      heldResult: RESULT,
    });
    expect(container.querySelector('img[alt="Opened AI picture"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Open AI picture"]')).not.toBeNull();
    expect(files.aiSend).not.toHaveBeenCalled();
  }
);

it('zooms within limits, resets, and starts each opened picture at its fitted size', async () => {
  await click('Open AI picture');
  const disabled = (label) => container.querySelector(`button[aria-label="${label}"]`).disabled;
  expect(container.textContent).toContain('Picture zoom 100%.');
  expect(disabled('Zoom out')).toBe(true);
  expect(disabled('Reset zoom')).toBe(true);
  for (let step = 0; step < 4; step += 1) await click('Zoom in');
  expect(container.textContent).toContain('Picture zoom 300%.');
  expect(disabled('Zoom in')).toBe(true);
  expect(container.querySelector('button[aria-label="Retry saving AI picture"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Keep drawing"]')).not.toBeNull();
  await click('Zoom out');
  expect(container.textContent).toContain('Picture zoom 250%.');
  await click('Reset zoom');
  expect(container.textContent).toContain('Picture zoom 100%.');
  await click('Zoom in');
  await click('Back');
  await click('Open AI picture');
  expect(container.textContent).toContain('Picture zoom 100%.');
  expect(files.aiSend).not.toHaveBeenCalled();
});

it('offers no way to hold a new recovery request while recovery sending is closed', () => {
  expect(container.querySelector('button[aria-label="Save held recovery request"]')).toBeNull();
});

it('keeps held recovery actions available and disables service changes while recovery is held', async () => {
  await render({
    ...state,
    recovery: { kind: 'recovery-held', recovery: { intent: 'committed' } },
  });
  for (const label of ['Send drawing for AI', 'Use my OpenAI key', 'Remove OpenAI key'])
    expect(container.querySelector(`button[aria-label="${label}"]`).disabled).toBe(true);
  await click('Check held recovery request');
  expect(owner.collectRecovery).toHaveBeenCalledOnce();
  expect(files.aiSend).not.toHaveBeenCalled();
});

it('discloses separate fresh permission while recovery sending stays unavailable', async () => {
  await render({
    ...state,
    recovery: { kind: 'recovery-held', recovery: { intent: 'committed' } },
  });
  expect(container.textContent).toContain('Saving it here did not give permission to upload it.');
  const send = container.querySelector('button[aria-label="Send saved drawing for AI"]');
  expect(send.disabled).toBe(true);
  await act(async () => send.click());
  expect(owner.sendRecovery).not.toHaveBeenCalled();
});
it('keeps request continuations closed and exposes the preserved original check', async () => {
  await render({
    ...state,
    recovery: { kind: 'recovery-request', recovery: { state: 'retained' } },
  });
  expect(container.querySelector('button[aria-label="Continue saved request"]').disabled).toBe(
    true
  );
  expect(container.querySelector('button[aria-label="Finish saving picture"]').disabled).toBe(true);
  expect(container.querySelector('button[aria-label="Refresh AI availability"]').disabled).toBe(
    true
  );
  await click('Check saved original request');
  expect(owner.readRecoverySource).toHaveBeenCalledOnce();
  expect(owner.reconcileRecovery).not.toHaveBeenCalled();
  expect(owner.acknowledgeRecovery).not.toHaveBeenCalled();
});
