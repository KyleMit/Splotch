// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  sdk,
  owner,
  root,
  Consumer,
  touch,
  event,
  send,
  settle,
} from './native-contacts-mounted-harness.mjs';
import { DrawingSessionProvider } from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { EMPTY_SCAN_IDLE_MS } from '../../experiments/native-architecture/src/drawing/inkVisibility.ts';
import { SCREENSHOT_COOLDOWN_MS } from '../../web/src/lib/drawing/screenshotTiming.ts';
import { drawingPaperSize } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

const AUTO_SAVE_CAPTURE_LIMIT = 3;

async function contact(brush, x) {
  await act(async () => owner.setBrush(brush));
  await settle();
  await send('start', event([touch(0, x, 20)]));
  await send('end', event([], [touch(0, x + 40, 60, 200)], { 0: 100 }), false);
  await settle();
}

// The blank page the scan reads back, at the paper's own pixel size.
function blankPaper() {
  const { width, height } = drawingPaperSize(owner.history.drawing);
  return rgbaPng(width, height, 0).toString('base64');
}

// A scan of a pen stroke the eraser then went over, held mid-capture.
async function scanInFlight() {
  sdk.hold = false;
  await contact('pen', 10);
  await contact('eraser', 10);
  sdk.hold = true;
  const captures = sdk.captures.length;
  await idle();
  expect(sdk.captures).toHaveLength(captures + 1);
  return sdk.captures.at(-1);
}

async function idle() {
  await act(async () => vi.advanceTimersByTimeAsync(EMPTY_SCAN_IDLE_MS));
  await settle();
}

describe('the screen’s visible-ink scan', () => {
  it('gives the real paper up after capture while Photos still writes', async () => {
    await contact('pen', 10);
    let finish;
    sdk.save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    sdk.hold = true;
    await act(async () => void owner.save());
    await settle();
    for (let layer = 0; layer < 2; layer += 1) {
      const { callback, options } = sdk.captures.at(-1);
      await act(async () =>
        callback(rgbaPng(options.width, options.height, 255).toString('base64'))
      );
      await settle();
    }
    expect(sdk.save).toHaveBeenCalledOnce();
    expect(owner.busy).toBe(false);
    await contact('pen', 200);
    expect(owner.history.drawing.strokes).toHaveLength(2);
    await act(async () => finish('photos'));
  });

  it('coalesces overlapping saves and keeps the first flight through the successful save cooldown', async () => {
    sdk.save.mockReset().mockResolvedValue('photos');
    await contact('pen', 10);
    let finish;
    sdk.save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    let first;
    let second;
    await act(async () => {
      first = owner.save();
      second = owner.save();
    });
    expect(second).toBe(first);
    await settle();
    expect(sdk.save).toHaveBeenCalledOnce();
    const flight = owner.flight;
    const captures = sdk.captures.length;
    await act(async () => finish('photos'));
    await first;
    await act(async () => void owner.save());
    await settle();
    expect(sdk.captures).toHaveLength(captures);
    expect(owner.flight).toBe(flight);
    await act(async () => vi.advanceTimersByTimeAsync(SCREENSHOT_COOLDOWN_MS));
    await act(async () => void owner.save());
    await settle();
    expect(sdk.save).toHaveBeenCalledTimes(2);
    expect(owner.flight.id).not.toBe(flight.id);
  });

  it('allows an immediate new save after a failed save', async () => {
    sdk.save.mockReset().mockResolvedValue('photos');
    await contact('pen', 10);
    sdk.save.mockResolvedValueOnce('denied');
    await act(async () => void owner.save());
    await settle();
    expect(owner.flight.discarded).toBe(true);
    const flight = owner.flight;
    await act(async () => void owner.save());
    await settle();
    expect(sdk.save).toHaveBeenCalledTimes(2);
    expect(owner.flight.id).not.toBe(flight.id);
    expect(owner.flight.discarded).toBe(false);
  });

  it('clears and gives the real paper up while Auto-Save on Delete still writes Photos', async () => {
    await contact('pen', 10);
    const previous = owner.history.drawing;
    let finish;
    sdk.save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    sdk.hold = true;
    await act(async () => void owner.clear(true));
    await settle();
    for (
      let layer = 0;
      layer < AUTO_SAVE_CAPTURE_LIMIT && sdk.save.mock.calls.length === 0;
      layer += 1
    ) {
      const { callback, options } = sdk.captures.at(-1);
      await act(async () =>
        callback(rgbaPng(options.width, options.height, 255).toString('base64'))
      );
      await settle();
    }
    expect(sdk.save).toHaveBeenCalledOnce();
    expect(owner.history.drawing.strokes).toHaveLength(0);
    const replacementRainbow = owner.history.drawing.rainbow;
    expect(owner.history.undo.at(-1)).toBe(previous);
    expect(owner.busy).toBe(false);
    await contact('pen', 200);
    expect(owner.history.drawing.strokes).toHaveLength(1);
    await act(async () => finish('denied'));
    expect(owner.history.drawing.strokes).toHaveLength(1);
    expect(owner.saveFailure.pictureCount).toBe(1);
    await act(async () => owner.undo());
    await settle();
    expect(owner.history.drawing.strokes).toHaveLength(0);
    await act(async () => owner.undo());
    await settle();
    expect(owner.history.drawing).toEqual({ ...previous, rainbow: replacementRainbow });
  });

  it('clears known ink without a capture and admits the next contact immediately', async () => {
    await contact('pen', 10);
    const previous = owner.history.drawing;
    const captures = sdk.captures.length;
    sdk.hold = true;
    await act(async () => void owner.clear(false));
    expect(sdk.captures).toHaveLength(captures);
    expect(owner.busy).toBe(false);
    expect(owner.disabled).toBe(false);
    expect(owner.history.drawing.strokes).toHaveLength(0);
    expect(owner.history.undo.at(-1)).toBe(previous);
    await contact('pen', 200);
    expect(owner.history.drawing.strokes).toHaveLength(1);
  });

  it('retains a scanned ink verdict through Clear Undo and clears again without capturing or locking', async () => {
    await contact('pen', 10);
    await contact('pen', 300);
    await contact('eraser', 10);
    sdk.hold = true;
    await idle();
    const { callback, options } = sdk.captures.at(-1);
    await act(async () => callback(rgbaPng(options.width, options.height, 255).toString('base64')));
    await act(async () => vi.advanceTimersByTimeAsync(EMPTY_SCAN_IDLE_MS));
    await settle();
    const previous = owner.history.drawing;
    const random = vi.spyOn(Math, 'random').mockReturnValue(previous.rainbow === 7 ? 0.24 : 0.71);
    try {
      const before = sdk.captures.length;
      await act(async () => void owner.clear(false));
      expect(sdk.captures).toHaveLength(before);
      expect(owner.busy).toBe(false);
      sdk.hold = false;
      await act(async () => owner.undo());
      await settle();
      expect(owner.busy).toBe(false);
      expect(owner.history.drawing).not.toBe(previous);
      expect(owner.history.drawing.strokes).toBe(previous.strokes);
      const captures = sdk.captures.length;
      sdk.hold = true;
      await act(async () => void owner.clear(false));
      expect(sdk.captures).toHaveLength(captures);
      expect(owner.busy).toBe(false);
      expect(owner.history.drawing.strokes).toHaveLength(0);
      await send('start', event([touch(0, 200, 20, 300)]), false);
      expect(owner.drawing).toBe(true);
      await send('end', event([], [touch(0, 240, 60, 400)], { 0: 300 }), false);
      expect(owner.history.drawing.strokes).toHaveLength(1);
      expect(sdk.captures).toHaveLength(captures);
    } finally {
      random.mockRestore();
    }
  });

  it('clears a scanned blank page without another capture or an extra undo step', async () => {
    await contact('pen', 10);
    await contact('eraser', 10);
    sdk.hold = true;
    await idle();
    await act(async () => sdk.captures.at(-1).callback(blankPaper()));
    await act(async () => vi.advanceTimersByTimeAsync(EMPTY_SCAN_IDLE_MS));
    expect(owner.inkVisible).toBe(false);
    const captures = sdk.captures.length;
    const undo = owner.history.undo;
    await act(async () => void owner.clear(false));
    expect(sdk.captures).toHaveLength(captures);
    expect(owner.history.drawing.strokes).toHaveLength(0);
    expect(owner.history.undo).toBe(undo);
  });

  it('reads a page the eraser wiped as blank once the child stops', async () => {
    await contact('pen', 10);
    expect(owner.inkVisible).toBe(true);
    await contact('eraser', 10);
    expect(owner.history.drawing.strokes.map(({ brush }) => brush)).toEqual(['pen', 'eraser']);
    expect(owner.inkVisible).toBe(true);
    const undo = owner.history.undo;
    sdk.hold = true;
    const captures = sdk.captures.length;
    await idle();
    expect(sdk.captures).toHaveLength(captures + 1);
    await act(async () => sdk.captures.at(-1).callback(blankPaper()));
    await act(async () => vi.advanceTimersByTimeAsync(EMPTY_SCAN_IDLE_MS));
    expect(owner.inkVisible).toBe(false);
    expect(owner.history.drawing.paper.kind).toBe('unadopted');
    expect(owner.history.drawing.strokes).toEqual([]);
    expect(owner.history.undo).toBe(undo);
    await act(async () => owner.undo());
    expect(owner.inkVisible).toBe(true);
  });

  it('gives the paper up to a command that arrives while it reads', async () => {
    await contact('pen', 10);
    await contact('eraser', 10);
    sdk.hold = true;
    await idle();
    const scanCapture = sdk.captures.at(-1);
    const captures = sdk.captures.length;
    await act(async () => {
      void owner.clear();
    });
    await settle();
    expect(sdk.captures).toHaveLength(captures + 1);
    expect(sdk.captures.at(-1)).not.toBe(scanCapture);
    expect(owner.busy).toBe(true);
    expect(owner.notice).not.toContain('already being exported');
  });

  it('keeps and draws a fresh contact that lands while the scan reads', async () => {
    await scanInFlight();
    const before = owner.history.drawing.strokes.length;
    sdk.hold = false;
    await send('start', event([touch(0, 200, 20, 300)]));
    await send('end', event([], [touch(0, 240, 60, 400)], { 0: 300 }), false);
    await settle();
    expect(owner.history.drawing.strokes).toHaveLength(before + 1);
    expect(owner.history.drawing.strokes.at(-1).brush).toBe('eraser');
    expect(owner.notice).toBe('');
  });

  it('opens Settings and More colors while the scan reads', async () => {
    await scanInFlight();
    await act(async () => owner.openSettings());
    expect(owner.settingsOpen).toBe(true);
    expect(owner.notice).not.toContain('Finish drawing');
    await act(async () => owner.closeSettings());
    await scanInFlight();
    await act(async () => owner.openColorPicker());
    expect(owner.colorPickerOpen).toBe(true);
    expect(owner.notice).not.toContain('Finish drawing');
  });

  it('lets AI preparation take the paper and capture while the scan reads', async () => {
    const scan = await scanInFlight();
    const captures = sdk.captures.length;
    // AI preparation (useNativeAi and productOwners' prepare) claims the paper this way.
    const release = owner.surface.current.lockInput();
    let captured;
    await act(async () => {
      captured = owner.surface.current.capturePng(owner.history.drawing);
      captured.catch(() => {});
    });
    await settle();
    expect(sdk.captures).toHaveLength(captures + 1);
    expect(sdk.captures.at(-1)).not.toBe(scan);
    release();
    await expect(captured).rejects.toThrow('changed');
  });

  it('tries again after a preemption and still reaches the right answer', async () => {
    const scan = await scanInFlight();
    await act(async () => owner.openSettings());
    await act(async () => scan.callback(blankPaper()));
    await act(async () => owner.closeSettings());
    expect(owner.inkVisible).toBe(true);
    const captures = sdk.captures.length;
    await idle();
    expect(sdk.captures).toHaveLength(captures + 1);
    await act(async () => sdk.captures.at(-1).callback(blankPaper()));
    await act(async () => vi.advanceTimersByTimeAsync(EMPTY_SCAN_IDLE_MS));
    expect(owner.inkVisible).toBe(false);
  });
});

it('reads the resized idle-scan grid and refuses a late crop after another extent change', async () => {
  await contact('pen', 10);
  await contact('eraser', 10);
  sdk.extent = { width: 1200, height: 900 };
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  sdk.hold = true;
  await idle();
  const capture = sdk.captures.at(-1);
  expect(capture.options).toMatchObject({ width: 1200, height: 900 });
  sdk.extent = { width: 1400, height: 1000 };
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  await act(async () => capture.callback(rgbaPng(1200, 900, 0).toString('base64')));
  await settle();
  expect(owner.inkVisible).toBe(true);
});

it('keeps Clear unchanged when its captured crop becomes stale', async () => {
  await contact('pen', 10);
  await contact('eraser', 10);
  sdk.hold = true;
  const drawing = owner.history.drawing;
  await act(async () => void owner.clear(false));
  await settle();
  const capture = sdk.captures.at(-1);
  sdk.extent = { width: 1200, height: 900 };
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  await act(async () =>
    capture.callback(rgbaPng(capture.options.width, capture.options.height, 0).toString('base64'))
  );
  await settle();
  expect(owner.history.drawing).toBe(drawing);
  expect(owner.inkVisible).toBe(true);
});

it('keeps known ink and Undo unchanged when resize cancels the awaited Clear save capture', async () => {
  await contact('pen', 10);
  expect(owner.inkVisible).toBe(true);
  const history = owner.history;
  const drawing = history.drawing;
  const stroke = drawing.strokes[0];
  const paper = owner.surface.current;
  const inkCapture = vi.spyOn(paper, 'captureInk');
  const savedCapture = vi.spyOn(paper, 'exportPng');
  const captures = sdk.captures.length;
  sdk.hold = true;
  let cleared;
  await act(async () => {
    cleared = owner.clear(true);
  });
  await settle();
  expect(inkCapture).not.toHaveBeenCalled();
  expect(savedCapture).toHaveBeenCalledExactlyOnceWith(drawing);
  expect(sdk.captures).toHaveLength(captures + 1);
  expect(owner.busy).toBe(true);
  expect(owner.history).toBe(history);
  sdk.extent = { width: 1200, height: 900 };
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  await settle();
  await cleared;
  expect(owner.surface.current).toBe(paper);
  expect(owner.history).toBe(history);
  expect(owner.history.drawing).toBe(drawing);
  expect(owner.history.undo).toBe(history.undo);
  expect(owner.history.drawing.strokes[0]).toBe(stroke);
  expect(owner.history.drawing.strokes[0].points).toBe(stroke.points);
  expect(owner.inkVisible).toBe(true);
  expect(sdk.save).not.toHaveBeenCalled();
  expect(owner.busy).toBe(false);
  inkCapture.mockRestore();
  savedCapture.mockRestore();
});

it('clears known ink after a current export failure while retaining its Undo picture', async () => {
  await contact('pen', 10);
  const drawing = owner.history.drawing;
  const captureInk = vi.spyOn(owner.surface.current, 'captureInk');
  sdk.fail = true;
  await act(async () => void owner.clear(true));
  await settle();
  expect(captureInk).not.toHaveBeenCalled();
  expect(owner.history.drawing.strokes).toEqual([]);
  expect(owner.history.undo.at(-1)).toBe(drawing);
  expect(sdk.save).not.toHaveBeenCalled();
  expect(owner.saveFailure.pictureCount).toBe(0);
  expect(owner.busy).toBe(false);
  captureInk.mockRestore();
});

it('uses the actual resized export grid for the saved picture flight', async () => {
  await contact('pen', 10);
  sdk.extent = { width: 1200, height: 1000 };
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  await act(async () => void owner.save());
  await settle();
  expect(owner.flight.paper).toEqual({ width: 2400, height: 2000 });
  expect(sdk.save).toHaveBeenCalledOnce();
});

it('refuses a completed save capture resized before the consumer accepts it', async () => {
  await contact('pen', 10);
  const history = owner.history;
  const paper = owner.surface.current;
  const exportPng = paper.exportPng;
  let captured;
  let accept;
  const delayed = vi.spyOn(paper, 'exportPng').mockImplementation(async (drawing) => {
    captured = await exportPng(drawing);
    await new Promise((resolve) => {
      accept = resolve;
    });
    return captured;
  });
  let saved;
  await act(async () => {
    saved = owner.save();
  });
  await settle();
  expect(captured.base64).not.toBeNull();
  expect(captured.isCurrent()).toBe(true);
  sdk.extent = { width: 1200, height: 1000 };
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  expect(captured.isCurrent()).toBe(false);
  await act(async () => accept());
  await settle();
  await saved;
  expect(owner.history).toBe(history);
  expect(owner.flight).toBeNull();
  expect(sdk.save).not.toHaveBeenCalled();
  expect(owner.busy).toBe(false);
  delayed.mockRestore();
});
