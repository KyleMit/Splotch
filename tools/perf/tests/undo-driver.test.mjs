import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  UNDO_MEASURE_TIMEOUT_MS,
  assertUndoAction,
  undoActionPromiseSource,
} from '../lib/undo-driver.mjs';

// The in-page source runs in a browser, so exercise it here against the three
// globals it touches. This is the only place the undo metric's pairing rule —
// exactly one new engine.undo measure, then the next painted frame — is checked
// without a device attached.
function evaluateUndoSource(index, { measures = [], button, nowSteps = [] } = {}) {
  let nowIndex = 0;
  const performanceStub = {
    getEntriesByName: () => measures,
    now: () => (nowIndex < nowSteps.length ? nowSteps[nowIndex++] : (nowSteps.at(-1) ?? 0)),
  };
  const documentStub = { querySelector: () => button ?? null };
  const requestAnimationFrame = (callback) => setTimeout(() => callback(performanceStub.now()), 0);
  class MouseEvent {
    constructor(type, options) {
      Object.assign(this, { type }, options);
    }
  }
  const factory = new Function(
    'document',
    'performance',
    'requestAnimationFrame',
    'MouseEvent',
    `return ${undoActionPromiseSource(index)};`
  );
  return factory(documentStub, performanceStub, requestAnimationFrame, MouseEvent);
}

const enabledButton = (onClick = () => {}) => ({
  disabled: false,
  dispatchEvent: (event) => {
    onClick(event);
    return true;
  },
});

describe('undo action source', () => {
  it('reports engine duration and next-frame delay for one new measure', async () => {
    const measures = [{ duration: 4 }];
    const button = enabledButton(() => measures.push({ duration: 7 }));

    const action = await evaluateUndoSource(3, {
      measures,
      button,
      nowSteps: [100, 118],
    });

    expect(action).toMatchObject({
      index: 3,
      beforeCount: 1,
      afterCount: 2,
      engineMs: 7,
      startedAt: 100,
    });
    expect(action.nextFrameMs).toBe(18);
  });

  it('clicks the undo button with a bubbling synthetic mouse event', async () => {
    const measures = [];
    let seen;
    const button = enabledButton((event) => {
      seen = event;
      measures.push({ duration: 2 });
    });

    await evaluateUndoSource(0, { measures, button, nowSteps: [0, 5] });

    expect(seen).toMatchObject({ type: 'click', bubbles: true, detail: 0 });
  });

  it('resolves null when the undo button is absent or disabled', async () => {
    await expect(evaluateUndoSource(0, { button: null })).resolves.toBeNull();
    await expect(
      evaluateUndoSource(0, { button: { disabled: true, dispatchEvent: () => true } })
    ).resolves.toBeNull();
  });

  it('resolves null when no measure arrives before the timeout', async () => {
    const action = await evaluateUndoSource(0, {
      measures: [],
      button: enabledButton(),
      nowSteps: [0, UNDO_MEASURE_TIMEOUT_MS],
    });

    expect(action).toBeNull();
  });

  it('does not accept a run that produced more than one new measure', async () => {
    const measures = [];
    const button = enabledButton(() => measures.push({ duration: 1 }, { duration: 1 }));

    const action = await evaluateUndoSource(0, {
      measures,
      button,
      nowSteps: [0, UNDO_MEASURE_TIMEOUT_MS],
    });

    expect(action).toBeNull();
  });
});

describe('assertUndoAction', () => {
  const valid = { index: 0, beforeCount: 2, afterCount: 3, engineMs: 5 };

  it('returns a well-formed action', () => {
    expect(assertUndoAction(valid, 0)).toBe(valid);
  });

  it('rejects a missing action, a doubled measure count, and a non-finite duration', () => {
    expect(() => assertUndoAction(null, 0)).toThrow(
      'Undo action 1 did not produce one engine.undo measure'
    );
    expect(() => assertUndoAction({ ...valid, afterCount: 4 }, 4)).toThrow(
      'Undo action 5 did not produce one engine.undo measure'
    );
    expect(() => assertUndoAction({ ...valid, engineMs: Number.NaN }, 0)).toThrow(
      'Undo action 1 did not produce one engine.undo measure'
    );
  });
});

describe('undo metric ownership', () => {
  // The matrix compares undo timing across transports, so a second inline copy of
  // the pairing rule would redefine the metric for whichever row held the copy.
  it('keeps the measure pairing out of the individual capture runners', () => {
    for (const relative of [
      join('tools', 'perf', 'ios', 'capture-xcuitest-screen.mjs'),
      join('tools', 'perf', 'web', 'capture-local-frames.mjs'),
    ]) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      expect(source).toContain('undoActionPromiseSource');
      expect(source).not.toContain("getEntriesByName('engine.undo'");
    }
  });
});
