// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { files } from './native-drawing-screen-harness.mjs';
import { NativeAiSheet } from '../../experiments/native-architecture/src/ai/AiSheet.tsx';
import { AiPictureReport } from '../../experiments/native-architecture/src/ai/AiPictureReport.tsx';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';

let container, root, owner, state;
const TARGET = { kind: 'false-positive-refusal', id: 17 };
const DRAWING = 'data:image/png;base64,iVBORw==';
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  owner = {
    close: vi.fn(),
    hasHeldResult: vi.fn(() => false),
    refresh: vi.fn(),
    chooseStyle: vi.fn(),
    generate: vi.fn(),
    prepareRecovery: vi.fn(),
    gateInput: vi.fn(),
    gateAnswer: vi.fn(),
    reportRefusal: vi.fn(),
    sendPictureReport: vi.fn(),
    cancelPictureReport: vi.fn(),
    reviewAiReport: vi.fn(),
  };
  state = {
    open: true,
    authorized: true,
    gate: { open: false, x: 3, y: 4, input: '', message: '', locked: false },
    style: 'Felt',
    busy: false,
    remaining: 2,
    credential: 'free',
    journal: null,
    recovery: null,
    heldResult: null,
    pictures: [],
    message: '',
    retryAt: 0,
    report: { phase: 'idle' },
    refusal: { id: TARGET.id },
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function button(label) {
  return [...container.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === label || element.textContent === label
  );
}
async function renderSheet() {
  await act(() =>
    root.render(
      createElement(NativeAiSheet, {
        owner,
        state,
        drawing: emptyDrawing(),
        artwork: {},
      })
    )
  );
}
it('offers a parent-facing refusal action without sending when the AI sheet renders', async () => {
  await renderSheet();
  expect(button('Grown-ups: report this refusal')).toBeDefined();
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(owner.reportRefusal).not.toHaveBeenCalled();
  await act(() => button('Grown-ups: report this refusal').click());
  expect(owner.reportRefusal).toHaveBeenCalledExactlyOnceWith(TARGET.id);
  expect(owner.sendPictureReport).not.toHaveBeenCalled();
  expect(files.aiSend).not.toHaveBeenCalled();
});
it('keeps the refusal action absent for an ordinary failure', async () => {
  state.refusal = null;
  state.message = 'That picture did not finish.';
  await renderSheet();
  expect(button('Grown-ups: report this refusal')).toBeUndefined();
  expect(owner.reportRefusal).not.toHaveBeenCalled();
});
it('renders the original refusal evidence and disclosure before the explicit send', async () => {
  await act(() =>
    root.render(
      createElement(AiPictureReport, {
        owner,
        report: { phase: 'confirm', preview: { target: TARGET, style: 'Clay', drawing: DRAWING } },
      })
    )
  );
  expect(container.textContent).toContain('Report this refusal');
  expect(container.textContent).toContain('authenticated refusal reason');
  expect(container.textContent).toContain('Original style: Clay');
  expect(container.textContent).toContain('within 24 hours');
  expect(container.textContent).toContain('schedule deletion after 30 days by a daily cleanup');
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(container.querySelector('img').getAttribute('src')).toBe(DRAWING);
  expect(container.querySelector('img[alt="AI picture to report"]')).toBeNull();
  expect(owner.sendPictureReport).not.toHaveBeenCalled();
  await act(() => button('Send report').click());
  expect(owner.sendPictureReport).toHaveBeenCalledOnce();
});
it('requires an explicit review action after a definite failure and offers no retry for unknown sends', async () => {
  await act(() =>
    root.render(
      createElement(AiPictureReport, {
        owner,
        report: { phase: 'error', target: TARGET, message: 'Please wait.', retryAt: 0 },
      })
    )
  );
  expect(container.textContent).toContain('Report this refusal');
  await act(() => button('Review report again').click());
  expect(owner.reviewAiReport).toHaveBeenCalledExactlyOnceWith(TARGET);
  expect(owner.sendPictureReport).not.toHaveBeenCalled();
  await act(() =>
    root.render(
      createElement(AiPictureReport, {
        owner,
        report: { phase: 'unknown', target: TARGET, message: 'Outcome unknown.', retryAt: 0 },
      })
    )
  );
  expect(button('Review report again')).toBeUndefined();
  expect(button('Send report')).toBeUndefined();
});
