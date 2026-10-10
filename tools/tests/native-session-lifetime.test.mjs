// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScreen, files, pictures } from './native-drawing-screen-harness.mjs';

let screen;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReturnValue(pictures);
  files.open.mockReset();
  files.save.mockReset();
  files.capture.mockReset();
  files.ink.mockReset();
  files.export.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  files.settingsRead.mockResolvedValue('{"version":1,"soundEnabled":false}');
  screen = createScreen();
  await act(async () => screen.mount());
});
afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

it('preserves drawing and the complete Undo sequence when DrawingScreen is replaced beneath ProbeApp', async () => {
  await screen.click('Draw fixture stroke');
  const paintedBlank = screen.paper();
  await screen.click('Coloring pages');
  await screen.click('Garden flower');
  const emptyFlower = screen.paper();
  await screen.click('Draw fixture stroke');
  const paintedFlower = screen.paper();
  const oldPaper = screen.container.querySelector('[data-testid="paper"]');
  await act(async () => screen.replace());
  expect(oldPaper.isConnected).toBe(false);
  expect(screen.paper()).toBe(paintedFlower);
  expect(screen.button('Undo').disabled).toBe(false);
  await screen.click('Undo');
  expect(screen.paper()).toBe(emptyFlower);
  await screen.click('Undo');
  expect(screen.paper()).toBe(paintedBlank);
  await screen.click('Undo');
  expect(JSON.parse(screen.paper())).toMatchObject({ pageId: 'blank', strokes: [] });
  expect(screen.button('Undo').disabled).toBe(true);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

it('ignores a reopened picture delivered after scene replacement', async () => {
  await screen.click('Draw fixture stroke');
  const original = screen.paper();
  const pending = deferred();
  files.open.mockReturnValueOnce(pending.promise);
  await screen.click('Pictures');
  await screen.click('Open picture from Good picture');
  await act(async () => screen.replace());
  await act(async () => pending.resolve({ version: 5, pageId: 'flower', rainbow: 3, strokes: [] }));
  expect(screen.paper()).toBe(original);
  expect(screen.container.textContent).not.toContain('Picture opened.');
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).strokes).toEqual([]);
});

it('does not export a capture delivered after scene replacement', async () => {
  await screen.click('Draw fixture stroke');
  const original = screen.paper();
  const pending = deferred();
  files.capture.mockReturnValueOnce(pending.promise);
  await screen.click('Export PNG');
  await act(async () => screen.replace());
  await act(async () => pending.resolve('obsolete-png'));
  expect(files.export).not.toHaveBeenCalled();
  expect(screen.paper()).toBe(original);
});

it('does not clear retained history from an old observation result', async () => {
  await screen.click('Draw fixture stroke');
  const original = screen.paper();
  const pending = deferred();
  files.ink.mockReturnValueOnce(pending.promise);
  await screen.click('Clear');
  await act(async () => screen.replace());
  await act(async () => pending.resolve('obsolete-ink'));
  expect(screen.paper()).toBe(original);
  expect(screen.container.textContent).not.toContain('unsupported PNG');
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).strokes).toEqual([]);
});

it('ignores a failed old save without unlocking the successor command', async () => {
  await screen.click('Draw fixture stroke');
  const original = screen.paper();
  const old = deferred(),
    successor = deferred();
  files.save.mockReturnValueOnce(old.promise).mockReturnValueOnce(successor.promise);
  await screen.click('Save picture');
  await act(async () => screen.replace());
  await screen.click('Save picture');
  await act(async () => old.reject(new Error('old save failed')));
  expect(screen.button('Save picture').disabled).toBe(true);
  expect(screen.container.textContent).not.toContain('old save failed');
  expect(screen.paper()).toBe(original);
  await act(async () => successor.resolve());
  expect(screen.button('Save picture').disabled).toBe(false);
  expect(screen.container.textContent).toContain('Picture saved on this device.');
});

it('retains Undo on suspension and revokes callbacks and commands before resume', async () => {
  await screen.click('Draw fixture stroke');
  const original = screen.paper(),
    oldCohort = files.cohort;
  const old = deferred(),
    successor = deferred();
  files.save.mockReturnValueOnce(old.promise).mockReturnValueOnce(successor.promise);
  await screen.click('Save picture');
  await act(async () => {
    for (const notify of files.appState) notify('background');
  });
  expect(screen.button('Save picture').disabled).toBe(true);
  await act(async () => {
    for (const notify of files.appState) notify('active');
  });
  await screen.click('Save picture');
  await act(async () => old.resolve());
  await act(async () =>
    oldCohort([{ brush: 'marker', color: 'Blue', width: 22, points: [{ x: 4, y: 4 }] }])
  );
  expect(screen.paper()).toBe(original);
  expect(screen.button('Save picture').disabled).toBe(true);
  await act(async () => successor.resolve());
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).strokes).toEqual([]);
});

it('retains history and reports a current save failure', async () => {
  await screen.click('Draw fixture stroke');
  const original = screen.paper();
  files.save.mockRejectedValueOnce(new Error('current save failed'));
  await screen.click('Save picture');
  expect(screen.paper()).toBe(original);
  expect(screen.container.textContent).toContain('current save failed');
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).strokes).toEqual([]);
});
