// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { files } from './native-drawing-screen-harness.mjs';
import { NativeAiSheet } from '../../experiments/native-architecture/src/ai/AiSheet.tsx';

const RESULT = { uri: 'file:///owned/current-ai.png', mime: 'image/png' };
const SAVED = { uri: 'file:///owned/saved-ai.png', mime: 'image/png' };
let container;
let root;
let state;
let owner;

function render(next, visible = next.open) {
  state = next;
  return act(() => root.render(createElement(NativeAiSheet, { owner, state, visible })));
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

it('opens current and saved local pictures inside one modal, returns, and keeps retry available', async () => {
  await click('Open AI picture');
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(container.querySelector('img[alt="Opened AI picture"]').getAttribute('src')).toBe(
    RESULT.uri
  );
  expect(container.querySelector('button[aria-label="Send drawing for AI"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Retry saving AI picture"]')).not.toBeNull();
  await click('Back to AI pictures');
  await click('Retry saving AI picture');
  expect(owner.retryRetention).toHaveBeenCalledOnce();
  await click('Open saved AI picture 1');
  expect(container.querySelector('img[alt="Opened AI picture"]').getAttribute('src')).toBe(
    SAVED.uri
  );
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
