// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { sdk, owner, touch, event, send, settle } from './native-contacts-mounted-harness.mjs';
import { EMPTY_SCAN_IDLE_MS } from '../../experiments/native-architecture/src/drawing/inkVisibility.ts';
import { SCREENSHOT_COOLDOWN_MS } from '../../web/src/lib/drawing/screenshotTiming.ts';
import { drawingPaperSize } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

const AUTO_SAVE_CAPTURE_LIMIT = 3;

async function contact(brush, x) {
  await act(async () => owner.setBrush(brush));
  await settle();
  await send('onPanResponderGrant', event([touch(0, x, 20)]));
  await send('onPanResponderEnd', event([], [touch(0, x + 40, 60, 200)], { 0: 100 }), false);
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
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
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
    expect(owner.history.undo.at(-1)).toBe(previous);
    expect(owner.busy).toBe(false);
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
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
    expect(owner.history.drawing).toBe(previous);
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
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
    await contact('pen', 200);
    expect(owner.history.drawing.strokes).toHaveLength(1);
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
    // The responder asks the paper before granting, as React Native does for every new touch.
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
    await send('onPanResponderGrant', event([touch(0, 200, 20, 300)]));
    await send('onPanResponderEnd', event([], [touch(0, 240, 60, 400)], { 0: 300 }), false);
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
