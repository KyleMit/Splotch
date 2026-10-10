// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-png-recovery-screen-harness.mjs';
import { rgbaPng } from './native-png-fixtures.mjs';
import {
  PAPER_HEIGHT,
  PAPER_WIDTH,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const CAPTURED_PNG = rgbaPng(2, 2, 255).toString('base64');
const CLEAR_OBSERVATION_WAIT_MS = 10_000;
const RECOVERY_TEST_TIMEOUT_MS = 15_000;
let screen;
let stored;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  stored = null;
  files.list.mockReset().mockReturnValue([]);
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

describe('mounted failed PNG recovery', () => {
  it(
    'retries the exact captured PNG after later ink and a real Clear instead of capturing the current canvas',
    async () => {
      await screen.click('Draw fixture stroke');
      await screen.click('Export PNG');
      const exported = files.export.mock.calls[0];
      expect(exported[0]).toBe(CAPTURED_PNG);
      expect(screen.container.textContent).toContain('PNG held on this device for retry.');
      const retry = screen.button('Try PNG export again');
      const dismiss = screen.button(`Dismiss held PNG ${exported[1]}`);
      expect(parseFloat(retry.style.minHeight)).toBeGreaterThanOrEqual(48);
      expect(parseFloat(dismiss.style.minWidth)).toBeGreaterThanOrEqual(48);
      await screen.click('Draw fixture stroke');
      files.ink.mockResolvedValue(rgbaPng(PAPER_WIDTH, PAPER_HEIGHT, 255).toString('base64'));
      await screen.click('Clear');
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
      expect(files.export.mock.calls[1]).toEqual(exported);
      expect(files.capture).toHaveBeenCalledOnce();
      expect(JSON.parse(stored).pictures[0].base64).toBe(CAPTURED_PNG);
      expect(screen.button('Try PNG export again')).toBeDefined();
      expect(screen.container.textContent).toContain(
        'PNG share sheet closed. The PNG is kept until you dismiss it.'
      );
      await screen.click(`Dismiss held PNG ${exported[1]}`);
      expect(JSON.parse(stored).pictures).toEqual([]);
    },
    RECOVERY_TEST_TIMEOUT_MS
  );

  it('restores held records on remount without sharing and dismisses them durably', async () => {
    await screen.click('Export PNG');
    const original = stored;
    screen.close();
    screen = createScreen();
    await act(async () => screen.mount());
    expect(stored).toBe(original);
    expect(files.export).toHaveBeenCalledOnce();
    expect(files.capture).toHaveBeenCalledOnce();
    expect(screen.container.textContent).toContain('PNG held on this device for retry.');
    await screen.click(`Dismiss held PNG ${JSON.parse(stored).pictures[0].filename}`);
    expect(JSON.parse(stored).pictures).toEqual([]);
    screen.close();
    screen = createScreen();
    await act(async () => screen.mount());
    expect(screen.button('Try PNG export again')).toBeUndefined();
    expect(files.export).toHaveBeenCalledOnce();
  });

  it('shows session-only durability and keeps capture failure out of recovery', async () => {
    files.capture.mockRejectedValueOnce(new Error('PNG capture failed'));
    await screen.click('Export PNG');
    expect(screen.container.textContent).toContain('PNG capture failed');
    expect(screen.button('Try PNG export again')).toBeUndefined();
    expect(files.recoveryWrite).not.toHaveBeenCalled();
    expect(files.export).not.toHaveBeenCalled();
    files.recoveryWrite.mockRejectedValue(new Error('Disk full'));
    await screen.click('Export PNG');
    expect(screen.container.textContent).toContain('PNG held only while this screen stays open.');
    expect(screen.container.textContent).not.toContain('PNG held on this device for retry.');
    expect(screen.button('Try PNG export again')).toBeDefined();
    expect(stored).toBeNull();
  });

  it('defers asynchronously restored record layout until an active drawing cohort finishes', async () => {
    await screen.click('Export PNG');
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
    expect(files.export).toHaveBeenCalledOnce();
  });
});
