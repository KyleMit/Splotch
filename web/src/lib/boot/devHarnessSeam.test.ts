import { beforeEach, expect, it, vi } from 'vitest';

import { installDevHarnessSeam } from './devHarnessSeam';

const ctrl = vi.hoisted(() => ({ harnessEnabled: true, mode: 'pen' }));

vi.mock('$lib/devHarness', () => ({
  devHarnessEnabled: () => ctrl.harnessEnabled,
}));

vi.mock('$lib/drawing/engine', () => ({
  committedBrushMode: () => ctrl.mode,
}));

beforeEach(() => {
  ctrl.harnessEnabled = true;
  ctrl.mode = 'pen';
  delete window.__committedBrushMode;
});

it('publishes the engine mode while the dev-harness gate is open', () => {
  installDevHarnessSeam();
  expect(window.__committedBrushMode?.()).toBe('pen');

  // Read through, not snapshotted: the E2E harness polls this while the engine
  // is still adopting the mode.
  ctrl.mode = 'magic';
  expect(window.__committedBrushMode?.()).toBe('magic');
});

it('installs nothing when the gate is closed, so the deploy has no seam', () => {
  ctrl.harnessEnabled = false;
  installDevHarnessSeam();
  expect(window.__committedBrushMode).toBeUndefined();
});

it('removes the seam on teardown', () => {
  installDevHarnessSeam()();
  expect(window.__committedBrushMode).toBeUndefined();
});
