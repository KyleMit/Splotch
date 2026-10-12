// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { files, STROKE } from './native-drawing-screen-harness.mjs';
import { canonicalPaper } from './native-paper-fixtures.mjs';
import { NativeAiSheet } from '../../experiments/native-architecture/src/ai/AiSheet.tsx';
import {
  addStroke,
  createHistory,
  emptyDrawing,
  strokePath,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { COLORING_PAGES } from '../../experiments/native-architecture/src/drawing/pages.ts';

let container;
let root;
let owner;
let state;
let drawing;

function render(nextState = state, nextDrawing = drawing, visible = nextState.open) {
  state = nextState;
  drawing = nextDrawing;
  return act(() =>
    root.render(
      createElement(NativeAiSheet, {
        owner,
        state,
        drawing,
        artwork: {},
        visible,
      })
    )
  );
}

function expectReadOnly() {
  for (const action of [
    owner.generate,
    owner.prepareRecovery,
    files.save,
    files.capture,
    files.ink,
    files.export,
    files.aiPrepare,
    files.aiSend,
    files.aiVaultRead,
    files.aiVaultWrite,
    files.draftWrite,
  ])
    expect(action).not.toHaveBeenCalled();
}

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
  };
  state = {
    open: true,
    authorized: true,
    gate: { open: false, x: 3, y: 4, input: '', message: '', locked: false },
    style: 'Clay',
    busy: false,
    remaining: 2,
    credential: 'free',
    journal: null,
    recovery: null,
    heldResult: null,
    pictures: [],
    message: '',
    retryAt: 0,
  };
  drawing = addStroke(createHistory(emptyDrawing(0, 'flower')), STROKE, canonicalPaper()).drawing;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it('renders current committed ink and its coloring outline without saving or sending', async () => {
  const originalDrawing = drawing;
  const original = JSON.stringify(drawing);
  await render();
  const scene = container.querySelector('svg');
  expect(scene).not.toBeNull();
  const paths = [...scene.querySelectorAll('path')];
  expect(paths[0].getAttribute('d')).toBe(strokePath(STROKE.points));
  expect(paths.slice(1).map((path) => path.getAttribute('d'))).toEqual(COLORING_PAGES.flower.paths);
  const next = addStroke(
    createHistory(drawing),
    {
      ...STROKE,
      points: [
        { x: 60, y: 70 },
        { x: 80, y: 90 },
      ],
    },
    canonicalPaper()
  ).drawing;
  await render(state, next);
  expect(container.querySelector('svg').querySelectorAll('path')).toHaveLength(
    COLORING_PAGES.flower.paths.length + 2
  );
  expect(JSON.stringify(originalDrawing)).toBe(original);
  expectReadOnly();
});

it.each(['gate', 'authorization', 'hidden', 'closed'])(
  'keeps the preview absent outside the %s boundary',
  async (boundary) => {
    const next = {
      gate: { ...state, gate: { ...state.gate, open: true } },
      authorization: { ...state, authorized: false },
      hidden: state,
      closed: { ...state, open: false },
    }[boundary];
    await render(next, drawing, boundary !== 'hidden' && next.open);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toContain('Current drawing');
    expectReadOnly();
  }
);

it('explains missing offline artwork without presenting a partial picture or fetching it', async () => {
  await render(state, emptyDrawing(0, `offline:dinosaur:brachiosaurus:${'a'.repeat(64)}`));
  expect(container.textContent).toContain(
    'The current picture preview is unavailable until its coloring artwork is ready.'
  );
  expect(container.querySelector('svg')).toBeNull();
  expectReadOnly();
});
