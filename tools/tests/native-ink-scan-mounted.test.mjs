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
    sdk.hold = true;
    const captures = sdk.captures.length;
    await idle();
    expect(sdk.captures).toHaveLength(captures + 1);
    await act(async () => sdk.captures.at(-1).callback(blankPaper()));
    await act(async () => vi.advanceTimersByTimeAsync(EMPTY_SCAN_IDLE_MS));
    expect(owner.inkVisible).toBe(false);
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
});
