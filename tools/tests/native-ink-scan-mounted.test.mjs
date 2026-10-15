// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { sdk, owner, touch, event, send, settle } from './native-contacts-mounted-harness.mjs';
import { EMPTY_SCAN_IDLE_MS } from '../../experiments/native-architecture/src/drawing/inkVisibility.ts';
import { drawingPaperSize } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

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
