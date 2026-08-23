import { describe, expect, it } from 'vitest';
import { brushOf, rawReportOf, rescoreCapture } from '../rescore-captures.mjs';
import { modeOf, selectEvidence, targetOf } from '../keep-capture-evidence.mjs';

// The real frame table is a tuple stream, not a record list, and phases are
// declared separately — a fixture that gets that wrong scores as an empty run
// and every assertion about the score becomes vacuous.
const FRAME_COUNT = 120;
const BEAT_MS = 16.67;
const frames = Array.from({ length: FRAME_COUNT }, (_, index) => [100 + index * BEAT_MS, -1, 0]);
const report = {
  meta: { schema: 2 },
  phases: [
    {
      key: 'blank',
      paper: 'blank',
      startedAt: 100,
      endedAt: 100 + FRAME_COUNT * BEAT_MS,
      contactMs: FRAME_COUNT * BEAT_MS,
      frames: FRAME_COUNT,
    },
  ],
  frames,
  events: [],
  measures: [],
  history: [],
  liftLatencies: [],
};

describe('rawReportOf', () => {
  // Three envelopes reach this tool — the split transport's artifact, the Appium
  // runner's, and a bare uploaded probe report — and re-scoring has to read the
  // same raw table out of all of them.
  it('reads the raw table out of every capture envelope', () => {
    expect(rawReportOf({ report })).toEqual(report);
    expect(rawReportOf(report)).toEqual(report);
  });

  it('reports nothing for a capture carrying only precomputed summaries', () => {
    expect(rawReportOf({ summaries: { phases: [] } })).toBeNull();
    expect(rawReportOf(null)).toBeNull();
  });
});

describe('brushOf', () => {
  it('prefers the artifact field over the filename', () => {
    expect(brushOf({ brush: 'crayon' }, 'landscape-light/pen-real-screen')).toBe('crayon');
  });

  // A corpus predating the field is exactly the corpus most worth re-scoring.
  it('falls back to the filename', () => {
    expect(brushOf({}, 'abase.1-eraser')).toBe('eraser');
    expect(brushOf({}, 'base-android-magic')).toBe('magic');
  });

  it('defaults to pen when nothing names a brush', () => {
    expect(brushOf({}, 'capture-001')).toBe('pen');
  });
});

describe('rescoreCapture', () => {
  it('returns nothing for a capture with no raw frames rather than throwing', () => {
    expect(rescoreCapture({ summaries: {} }, { name: 'x' })).toBeNull();
  });

  // Scoring a cell against the wrong target silently applies the wrong gate, and
  // the exception table is keyed <targetId>:<brush>.
  it('applies the per-target gate exception the brush earns', () => {
    const capture = { brush: 'crayon', report };
    const excepted = rescoreCapture(capture, { name: 'c', targetId: 'ipad-device-web' });
    const plain = rescoreCapture(capture, { name: 'c', targetId: 'mac-chrome' });

    expect(excepted?.gateShare).toBe(0.015);
    expect(plain?.gateShare).toBe(0.01);
  });
});

describe('keep-capture-evidence', () => {
  it('reads the target from the campaign tree layout', () => {
    expect(targetOf({}, 'android-device-web/landscape-light/crayon-real-screen')).toBe(
      'android-device-web'
    );
    expect(targetOf({ targetId: 'ipad-device-web' }, 'anything/else')).toBe('ipad-device-web');
  });

  // Taking the filename for a flat corpus makes every capture its own target,
  // which silently turns "one per target x brush" into "keep everything".
  it('does not invent a target from a flat corpus filename', () => {
    expect(targetOf({}, 'abase.1-crayon')).toBe('unknown');
    expect(targetOf({}, 'abase.1-crayon', 'ipad-device-web')).toBe('ipad-device-web');
  });

  it('labels the mode from whichever shape the capture records it in', () => {
    expect(modeOf({ mode: 'landscape-dark' })).toBe('landscape-dark');
    expect(modeOf({ orientation: 'LANDSCAPE', theme: 'dark' })).toBe('LANDSCAPE-dark');
    expect(modeOf({})).toBe('unknown');
  });

  it('keeps one capture per target and brush', () => {
    const kept = selectEvidence([
      { target: 'a', brush: 'pen', file: '1' },
      { target: 'a', brush: 'pen', file: '2' },
      { target: 'a', brush: 'crayon', file: '3' },
      { target: 'b', brush: 'pen', file: '4' },
    ]);

    expect(kept.map((entry) => entry.file)).toEqual(['1', '3', '4']);
  });
});
