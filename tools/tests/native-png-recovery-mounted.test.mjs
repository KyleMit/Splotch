// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-png-recovery-screen-harness.mjs';
import { rgbaPng } from './native-png-fixtures.mjs';
import {
  PAPER_HEIGHT,
  PAPER_WIDTH,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  heldPngFilename,
  serializeHeldPngs,
} from '../../experiments/native-architecture/src/export/heldPng.ts';

const CAPTURED_PNG = rgbaPng(2, 2, 255).toString('base64');
const CLEAR_OBSERVATION_WAIT_MS = 10_000;
const RECOVERY_TEST_TIMEOUT_MS = 15_000;
// A PNG an earlier export held for retry. Nothing in the app makes new ones; a held record from
// before still restores, retries and dismisses.
const HELD_ID = 'png-1-held';
const HELD_FILENAME = heldPngFilename(HELD_ID);
let screen;
let stored;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  stored = serializeHeldPngs([{ id: HELD_ID, filename: HELD_FILENAME, base64: CAPTURED_PNG }]);
  files.capture.mockReset().mockResolvedValue(CAPTURED_PNG);
  files.ink.mockReset();
  files.export.mockReset().mockRejectedValue(new Error('Sharing unavailable'));
  files.lock.mockReset().mockReturnValue(() => {});
  files.recoveryRead.mockReset().mockImplementation(async () => stored);
  files.recoveryWrite.mockReset().mockImplementation(async (snapshot) => {
    stored = snapshot;
  });
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  screen = createScreen();
  await act(async () => screen.mount());
});

afterEach(() => screen.close());

describe('mounted held PNG recovery', () => {
  it(
    'retries the exact held PNG after later ink and a real Clear instead of capturing the current canvas',
    async () => {
      expect(screen.container.textContent).toContain('PNG held on this device for retry.');
      const retry = screen.button('Try PNG export again');
      const dismiss = screen.button(`Dismiss held PNG ${HELD_FILENAME}`);
      expect(parseFloat(retry.style.minHeight)).toBeGreaterThanOrEqual(48);
      expect(parseFloat(dismiss.style.minWidth)).toBeGreaterThanOrEqual(48);
      await screen.click('Draw fixture stroke');
      files.ink.mockResolvedValue(rgbaPng(PAPER_WIDTH, PAPER_HEIGHT, 255).toString('base64'));
      await screen.menuClick('Clear');
      await vi.waitFor(
        async () => {
          await act(async () => {});
          expect(JSON.parse(screen.paper()).strokes).toEqual([]);
        },
        { timeout: CLEAR_OBSERVATION_WAIT_MS }
      );
      expect(files.ink).toHaveBeenCalledOnce();
      files.export.mockResolvedValue(undefined);
      await screen.click('Try PNG export again');
      expect(files.export.mock.calls[0]).toEqual([CAPTURED_PNG, HELD_FILENAME]);
      expect(files.capture).not.toHaveBeenCalled();
      expect(JSON.parse(stored).pictures[0].base64).toBe(CAPTURED_PNG);
      expect(screen.button('Try PNG export again')).toBeDefined();
      expect(screen.container.textContent).toContain(
        'Share sheet closed. This PNG is kept until you dismiss it.'
      );
      await screen.click(`Dismiss held PNG ${HELD_FILENAME}`);
      expect(JSON.parse(stored).pictures).toEqual([]);
    },
    RECOVERY_TEST_TIMEOUT_MS
  );

  it('restores held records on remount without sharing and dismisses them durably', async () => {
    const original = stored;
    screen.close();
    screen = createScreen();
    await act(async () => screen.mount());
    expect(stored).toBe(original);
    expect(files.export).not.toHaveBeenCalled();
    expect(files.capture).not.toHaveBeenCalled();
    expect(screen.container.textContent).toContain('PNG held on this device for retry.');
    await screen.click(`Dismiss held PNG ${HELD_FILENAME}`);
    expect(JSON.parse(stored).pictures).toEqual([]);
    screen.close();
    screen = createScreen();
    await act(async () => screen.mount());
    expect(screen.button('Try PNG export again')).toBeUndefined();
    expect(files.export).not.toHaveBeenCalled();
  });

  it('defers asynchronously restored record layout until an active drawing cohort finishes', async () => {
    screen.close();
    let restore;
    files.recoveryRead.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          restore = resolve;
        })
    );
    screen = createScreen({ cohortDrivers: true });
    await act(async () => screen.mount());
    await screen.click('Begin cohort');
    await act(async () => restore(stored));
    expect(screen.container.textContent).not.toContain('PNG held on this device for retry.');
    await screen.click('Finish cohort');
    expect(screen.container.textContent).toContain('PNG held on this device for retry.');
    expect(files.export).not.toHaveBeenCalled();
  });

  it('offers no way to export a new PNG: the screenshot camera is the one save', async () => {
    await screen.click('Drawing tools');
    expect(screen.button('Export PNG')).toBeUndefined();
    expect(screen.button('Save picture')).toBeDefined();
  });
});
