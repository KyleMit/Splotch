// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreen, files, pictures, STROKE } from './native-drawing-screen-harness.mjs';
import { createDrawingSession } from '../../experiments/native-architecture/src/product/createDrawingSession.ts';
import { offlineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/runtime.ts';
import {
  addStroke,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { canonicalPaper } from './native-paper-fixtures.mjs';

let screen;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReset().mockReturnValue(pictures);
  files.save.mockReset().mockResolvedValue({ id: 'picture-1-fixture' });
  files.open.mockReset();
  files.capture.mockReset();
  files.ink.mockReset();
  files.export.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  files.brushRead.mockReset().mockResolvedValue(null);
  files.brushWrite.mockReset().mockResolvedValue(undefined);
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.draftRead.mockReset().mockResolvedValue(null);
  files.draftWrite.mockReset().mockResolvedValue(undefined);
  files.draftProtected.mockReset().mockResolvedValue([]);
  files.platform = 'android';
  files.scheme = 'light';
  files.retainClosingModal = false;
  screen = createScreen();
  await screen.mount();
});

afterEach(() => {
  screen.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('current drawing app session', () => {
  it('recovers the current picture in a fresh app owner without changing named Pictures', async () => {
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    expect(files.draftWrite).toHaveBeenCalled();
    const snapshot = files.draftWrite.mock.calls.at(-1)[0];
    screen.close();
    files.draftRead.mockResolvedValue(snapshot);
    screen = createScreen();
    await screen.mount();
    expect(JSON.parse(screen.paper())).toEqual(JSON.parse(drawing));
    expect(screen.button('Undo').disabled).toBe(true);
    expect(files.save).not.toHaveBeenCalled();
  });

  it('keeps new ink while draft recovery fails and offers a working retry', async () => {
    screen.close();
    files.draftRead.mockRejectedValueOnce(new Error('Storage unavailable'));
    screen = createScreen();
    await screen.mount();
    expect(screen.container.textContent).toContain('could not be recovered');
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    await screen.click('Retry draft recovery');
    expect(screen.paper()).toBe(drawing);
    expect(screen.container.textContent).not.toContain('could not be recovered');
    expect(files.draftWrite).toHaveBeenCalled();
  });

  it('gives separate app owners independent pictures and Undo', () => {
    const first = createDrawingSession();
    const second = createDrawingSession();
    first.setHistory((history) =>
      addStroke(history, { ...STROKE, brush: 'pen', width: 14 }, canonicalPaper())
    );
    expect(first.currentDrawing().strokes).toHaveLength(1);
    expect(second.currentDrawing()).toEqual(emptyDrawing());
    expect(second.getSnapshot().undo).toEqual([]);
    first.setHistory(undoDrawing);
    expect(first.currentDrawing()).toEqual(emptyDrawing());
  });

  it('retains committed ink and Undo when only the screen remounts', async () => {
    await screen.click('Draw fixture stroke');
    const first = screen.paper();
    await screen.click('Draw fixture stroke');
    const second = screen.paper();
    await screen.remount();
    expect(screen.paper()).toBe(second);
    await screen.click('Undo');
    expect(screen.paper()).toBe(first);
    expect(files.save).not.toHaveBeenCalled();
  });

  it('keeps the retained coloring page while remount settings are loading', async () => {
    await screen.click('Draw fixture stroke');
    await screen.menuClick('Coloring pages');
    await screen.click('Garden flower');
    const original = screen.paper();
    let finish;
    files.settingsRead.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await screen.remount();
    expect(screen.container.textContent).toContain('Loading drawing settings');
    await act(async () => finish('{"version":1,"soundEnabled":false}'));
    expect(screen.paper()).toBe(original);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper()).pageId).toBe('blank');
  });

  it('ignores a saved-picture replacement that finishes after its screen unmounts', async () => {
    await screen.click('Draw fixture stroke');
    let finish;
    files.open.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await screen.menuClick('Pictures');
    await screen.click('Open picture from Good picture');
    expect(files.open).toHaveBeenCalledOnce();
    await screen.remount();
    await screen.click('Draw fixture stroke');
    const current = screen.paper();
    await act(async () => finish(emptyDrawing()));
    expect(screen.paper()).toBe(current);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(1);
  });

  it('ignores a coloring-page replacement that finishes after its screen unmounts', async () => {
    await screen.click('Draw fixture stroke');
    let finish;
    vi.spyOn(offlineLibrary, 'openPage').mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await screen.menuClick('Coloring pages');
    await screen.click('Garden flower');
    await screen.remount();
    await screen.click('Draw fixture stroke');
    const current = screen.paper();
    await act(async () => finish());
    expect(screen.paper()).toBe(current);
    expect(JSON.parse(screen.paper()).pageId).toBe('blank');
  });
});
