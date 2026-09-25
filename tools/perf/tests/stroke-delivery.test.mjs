import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strokeDeliveryProblem, trustedPointerdowns } from '../lib/stroke-delivery.mjs';
import { captureRefusal } from '../split-capture/capture-device-frames.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
// A tracked Android split capture from the issue 2229 A/B: 160 adb swipes, 160
// trusted pointerdowns, fidelity passed.
const DELIVERED = JSON.parse(
  readFileSync(
    join(
      ROOT,
      'perf-profiles/evidence/2026-09-24-issue-2229-portrait-ab-base/crayon-base-r1--2a0a9767.json'
    ),
    'utf8'
  )
);
const EVENT_TYPE = 2;
const POINTERDOWN = 0;
const LOST_STROKES = 20;

// The 3928 portrait captures' shape: the overlay column ate 20 of 160 touches
// before the page saw them, and everything that did arrive was driven well.
function withLostStrokes(artifact, lost) {
  let dropped = 0;
  const events = artifact.report.events.filter((row) => {
    if (row[EVENT_TYPE] !== POINTERDOWN || dropped === lost) return true;
    dropped += 1;
    return false;
  });
  return { ...artifact, report: { ...artifact.report, events } };
}

describe('strokeDeliveryProblem', () => {
  it('passes a capture whose page recorded every dispatched stroke', () => {
    expect(DELIVERED.dispatchedStrokes).toBe(160);
    expect(trustedPointerdowns(DELIVERED.report)).toBe(160);
    expect(strokeDeliveryProblem(DELIVERED)).toBeNull();
    expect(strokeDeliveryProblem(DELIVERED, { required: true })).toBeNull();
  });

  it('fails a capture that lost strokes, naming both counts', () => {
    const problem = strokeDeliveryProblem(withLostStrokes(DELIVERED, LOST_STROKES));

    expect(problem).toContain('recorded 140 pointerdowns for 160 dispatched strokes');
    expect(problem).toMatch(/took touches/);
  });

  it('fails a capture whose page saw more pointerdowns than were dispatched', () => {
    const problem = strokeDeliveryProblem({ ...DELIVERED, dispatchedStrokes: 150 });

    expect(problem).toContain('recorded 160 pointerdowns for 150 dispatched strokes');
    expect(problem).toMatch(/something other than the capture/);
  });

  it('tolerates an unrecorded count unless the caller knows it was driven through adb', () => {
    const uncounted = { ...DELIVERED, dispatchedStrokes: null };

    expect(strokeDeliveryProblem(uncounted)).toBeNull();
    expect(strokeDeliveryProblem({ report: DELIVERED.report })).toBeNull();
    expect(strokeDeliveryProblem(uncounted, { required: true })).toMatch(
      /160 pointerdowns but no dispatchedStrokes/
    );
  });

  it('refuses a recorded count that is not a stroke count', () => {
    expect(strokeDeliveryProblem({ ...DELIVERED, dispatchedStrokes: '160' })).toMatch(
      /is not a stroke count/
    );
    expect(strokeDeliveryProblem({ ...DELIVERED, dispatchedStrokes: -1 })).toMatch(
      /is not a stroke count/
    );
  });
});

describe('captureRefusal', () => {
  it('lets a delivered, faithful capture through', () => {
    expect(DELIVERED.fidelity.passed).toBe(true);
    expect(captureRefusal(DELIVERED)).toBeNull();
  });

  it('refuses a capture that lost strokes even though its fidelity passed', () => {
    const refusal = captureRefusal(withLostStrokes(DELIVERED, LOST_STROKES));

    expect(refusal).toContain('140 pointerdowns for 160 dispatched strokes');
    expect(refusal).not.toMatch(/fidelity gate/);
    expect(refusal).toMatch(/Do not score it\.$/);
  });

  it('names both failures when a capture lost strokes and failed fidelity', () => {
    const refusal = captureRefusal({
      ...withLostStrokes(DELIVERED, LOST_STROKES),
      fidelity: { ...DELIVERED.fidelity, passed: false },
    });

    expect(refusal).toContain('140 pointerdowns for 160 dispatched strokes');
    expect(refusal).toMatch(/fidelity gate/);
  });

  it('refuses an iPad capture only on its fidelity, since it counts no strokes', () => {
    const ipad = { ...DELIVERED, dispatchedStrokes: null };

    expect(captureRefusal(ipad)).toBeNull();
    expect(captureRefusal({ ...ipad, fidelity: { passed: false } })).toMatch(/fidelity gate/);
  });
});
