import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  ACTION_FRAME_MAX_GATE_MS,
  actionRows,
  rotationFirstFrameNa,
  summarizeActionGroup,
  summarizeActions,
} from '../lib/action-stats.mjs';
import {
  DUAL_FRAME_STAMP_EPOCH,
  SCHEDULED_ONLY_FRAME_STAMP_EPOCH,
  artifactFrameStampEpoch,
  frameStampDivergence,
  frameStampEpochOf,
} from '../lib/frame-stamps.mjs';

// Every action artifact the evidence corpus commits, scored under its own
// recorded calibration, hashed. ADR-0163 added a second frame clock to the
// probe on the promise that scoring never reads it; this ledger is that promise
// made checkable: the summaries a legacy capture produces must be byte-identical
// to what the scorer produced before the channel existed. A scorer change that
// legitimately re-baselines the corpus regenerates it deliberately — run the
// tools suite with `-u` — and the regenerated diff is the record, the way
// `perf:rescore` makes a drawing-gate change a table rather than an assertion.
const GOLDEN = join(import.meta.dirname, 'fixtures', 'committed-action-verdicts.golden.json');
const EVIDENCE_ROOT = join(ROOT, 'perf-profiles', 'evidence');

function committedActionCapturePaths() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^actions.*\.json$/.test(entry)) found.push(full);
    }
  };
  walk(EVIDENCE_ROOT);
  return found;
}

// The artifact's own calibration, exactly as the runner that wrote it scored
// it: the allowances it recorded, and the rotation applicability its recorded
// runtime and engine imply.
function rescore(artifact) {
  return summarizeActions(artifact.samples, [], artifact.gateAllowances ?? {}, (label) =>
    rotationFirstFrameNa(artifact.captureRuntime ?? null, label, artifact.engine ?? null)
  );
}

const frame = (startFromActionMs, gapMs, visualEffectsActive = false) => ({
  startFromActionMs,
  endFromActionMs: startFromActionMs + gapMs,
  gapMs,
  visualEffectsActive,
});

// Scheduled frames on a steady grid whose callbacks ran `lateMs` after their
// stamp; the actual gap is callback-to-callback, exactly as the probe derives it.
function dualFrames(lateByFrame, { gapMs = 16.7 } = {}) {
  let previousRan = 0;
  return lateByFrame.map((lateMs, index) => {
    const scheduled = frame(index * gapMs, gapMs, true);
    const ranFromActionMs = scheduled.endFromActionMs + lateMs;
    const actualGapMs = ranFromActionMs - previousRan;
    previousRan = ranFromActionMs;
    return { ...scheduled, ranFromActionMs, actualGapMs };
  });
}

const action = (postActionFrames, changes = {}) => ({
  label: 'fixture action',
  eventType: 'click',
  trusted: true,
  firstFrameMs: 8,
  readyMs: null,
  postActionFrames,
  postActionFrameGapsMs: postActionFrames.map(({ gapMs }) => gapMs),
  activities: [],
  canvasMutations: [],
  measures: [],
  ...changes,
});

const stripped = ({ frameStamps: _frameStamps, ...summary }) => summary;

describe('verdict neutrality across the committed action corpus', () => {
  const paths = committedActionCapturePaths();

  it('finds the committed corpus', () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  // One pass, one artifact in memory at a time: the corpus is ~180 MB of JSON.
  it('re-derives byte-identical summaries for every legacy capture under its recorded calibration', async () => {
    const ledger = {};
    for (const path of paths) {
      const artifact = JSON.parse(readFileSync(path, 'utf8'));
      const key = relative(ROOT, path);
      expect(artifactFrameStampEpoch(artifact), key).toBe(SCHEDULED_ONLY_FRAME_STAMP_EPOCH);
      const summaries = rescore(artifact);
      for (const summary of summaries) expect(summary, key).not.toHaveProperty('frameStamps');
      ledger[key] = {
        sha256: createHash('sha256').update(JSON.stringify(summaries)).digest('hex'),
        verdicts: summaries.map(
          (summary) => `${summary.label}: ${summary.passed ? 'PASS' : 'FAIL'}`
        ),
      };
    }
    await expect(`${JSON.stringify(ledger, null, 2)}\n`).toMatchFileSnapshot(GOLDEN);
  });
});

describe('frame-stamp epoch marker', () => {
  it('reads an empty run as unknown, an unmarked run as scheduled-only, and a marked run as dual', () => {
    expect(frameStampEpochOf([])).toBeNull();
    expect(frameStampEpochOf([action([])])).toBe(SCHEDULED_ONLY_FRAME_STAMP_EPOCH);
    expect(frameStampEpochOf([action([], { frameStampEpoch: DUAL_FRAME_STAMP_EPOCH })])).toBe(
      DUAL_FRAME_STAMP_EPOCH
    );
  });

  it('refuses a capture whose samples mix epochs', () => {
    expect(() =>
      frameStampEpochOf([action([]), action([], { frameStampEpoch: DUAL_FRAME_STAMP_EPOCH })])
    ).toThrow(/mix frame-stamp epochs 1, 2/);
  });

  it('answers from the artifact marker first, then its samples, then legacy', () => {
    expect(artifactFrameStampEpoch({ frameStampEpoch: 7, samples: [] })).toBe(7);
    expect(
      artifactFrameStampEpoch({
        samples: [action([], { frameStampEpoch: DUAL_FRAME_STAMP_EPOCH })],
      })
    ).toBe(DUAL_FRAME_STAMP_EPOCH);
    expect(artifactFrameStampEpoch({ samples: [] })).toBe(SCHEDULED_ONLY_FRAME_STAMP_EPOCH);
    expect(artifactFrameStampEpoch({})).toBe(SCHEDULED_ONLY_FRAME_STAMP_EPOCH);
  });
});

describe('scheduled-versus-actual divergence', () => {
  it('is absent from a legacy group and reads n/a in the report row', () => {
    const legacy = summarizeActionGroup([action([frame(0, 16.7), frame(16.7, 16.7)])]);
    expect(legacy).not.toHaveProperty('frameStamps');
    expect(actionRows([{ ...legacy, label: 'legacy' }])[0]).toMatchObject({
      'actual p95': 'n/a',
      'hidden overruns': 'n/a',
    });
    expect(frameStampDivergence([frame(0, 16.7)], ACTION_FRAME_MAX_GATE_MS)).toBeNull();
  });

  it('reads zero divergence when every callback ran on its stamp', () => {
    const summary = summarizeActionGroup([action(dualFrames(Array.from({ length: 12 }, () => 0)))]);
    expect(summary.frameStamps).toEqual({
      frames: 12,
      actual: { p50: 16.7, p95: 16.7, max: 16.7 },
      p95DeltaMs: 0,
      maxDeltaMs: 0,
      callbackDelay: { p95: 0, max: 0 },
      hiddenOverruns: 0,
    });
  });

  // The issue-1696 shape: the main thread blocked for most of two periods, the
  // callback for the blocked vsync running ~20 ms late and the next one right
  // behind it. The scheduled channel reads a clean 16.7 either side; the
  // actual channel reads the two-beat gap the trace saw.
  it('counts a late callback the scheduled stamp hides as a hidden overrun', () => {
    const frames = dualFrames([0, 0, 20, 4, 0, 0, 0, 0]);
    const summary = summarizeActionGroup([action(frames)]);
    expect(summary.frames.max).toBe(16.7);
    expect(summary.passed).toBe(true);
    expect(summary.frameStamps).toMatchObject({
      frames: 8,
      actual: { max: 36.7 },
      maxDeltaMs: 20,
      callbackDelay: { max: 20 },
      hiddenOverruns: 1,
    });
    expect(summary.frameStamps.actual.p95).toBe(36.7);
    expect(actionRows([{ ...summary, label: 'toggle' }])[0]).toMatchObject({
      'post max': 16.7,
      'actual p95': 36.7,
      'hidden overruns': 1,
      verdict: 'PASS',
    });
  });

  it('measures divergence only over the frames the gate scored', () => {
    const frames = dualFrames(Array.from({ length: 30 }, (_, index) => (index === 25 ? 40 : 0)));
    // A tap that settles in four frames: the late callback at frame 25 is
    // settle idle, outside the scored window, so it is neither gated nor counted.
    const sample = action(
      frames.map((entry) => ({ ...entry, visualEffectsActive: false })),
      { readyMs: 5 }
    );
    const summary = summarizeActionGroup([sample]);
    expect(summary.frameSamples.scored).toBe(4);
    expect(summary.frameStamps).toMatchObject({ frames: 4, hiddenOverruns: 0, maxDeltaMs: 0 });
  });

  it('never lets the actual channel move a verdict or a gated figure', () => {
    const clean = dualFrames(Array.from({ length: 12 }, () => 0));
    const absurd = clean.map((entry) => ({ ...entry, actualGapMs: 1000, ranFromActionMs: 9999 }));
    const withActual = summarizeActionGroup([action(absurd)]);
    const withoutActual = summarizeActionGroup([
      action(
        clean.map(
          ({ actualGapMs: _actualGapMs, ranFromActionMs: _ranFromActionMs, ...scheduled }) =>
            scheduled
        )
      ),
    ]);
    expect(withActual.passed).toBe(true);
    expect(withActual.frameStamps.hiddenOverruns).toBe(12);
    expect(stripped(withActual)).toEqual(stripped(withoutActual));
    expect(withoutActual).not.toHaveProperty('frameStamps');
  });

  it('applies the group’s max gate, allowance included, to the hidden-overrun count', () => {
    const frames = dualFrames([0, 0, 20, 4, 0, 0, 0, 0]);
    const allowed = summarizeActionGroup([action(frames)], 'open Settings', {
      p95: {},
      max: { 'open Settings': 56 },
    });
    expect(allowed.frameStamps.hiddenOverruns).toBe(0);
    expect(frameStampDivergence(frames, ACTION_FRAME_MAX_GATE_MS).hiddenOverruns).toBe(1);
  });
});
