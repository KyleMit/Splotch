// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The glass chunk's request never settles: a stalled network before the service worker has it.
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/RsdBareGlass.web.tsx',
  () => new Promise(() => {})
);

const { BARE_GLASS_HOLD_MS, useBareGlassReady } =
  await import('../../../experiments/native-architecture/src/rsdDrawing/bareGlass.web.ts');

let root;
let host;
let readings;
let originalActEnvironment;

function Probe({ bare }) {
  readings.push(useBareGlassReady(bare));
  return null;
}

async function render(bare) {
  await act(async () => root.render(createElement(Probe, { bare })));
}

beforeEach(() => {
  originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  readings = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

it('lets the raised controls paint at once without asking for the glass', async () => {
  await render(false);
  expect(readings.at(-1)).toBe(true);
});

it('holds the flat first paint for the glass only until its deadline, however long the chunk stalls', async () => {
  await render(true);
  expect(readings.at(-1)).toBe(false);
  await act(async () => vi.advanceTimersByTime(BARE_GLASS_HOLD_MS - 1));
  expect(readings.at(-1)).toBe(false);
  await act(async () => vi.advanceTimersByTime(1));
  expect(readings.at(-1)).toBe(true);
});
