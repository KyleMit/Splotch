import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { normalizeMatrix } from '../gen-performance-matrix.mjs';
import { rescoreCapture } from '../lib/capture-rescore.mjs';
import { captureVerdict } from '../lib/person-session.mjs';
import { EVENT_TYPE, POINTER_CANCEL, POINTER_DOWN, POINTER_UP } from '../lib/real-screen-stats.mjs';
import { rescoreCaptures } from '../rescore-captures.mjs';

// The probe's raw table is a tuple stream — frames are [stamp, dt, inContact] —
// with the phases declared beside it. A fixture that gets that wrong scores as
// an empty run, and every assertion about the verdict becomes vacuous.
const FRAME_COUNT = 120;
const SIXTY_HZ_BEAT_MS = 16.67;
// What an older estimator could have stored for the same capture: a 120 Hz beat.
const STORED_BEAT_MS = 8.3;
// A real-finger iPad Safari capture in the uploaded-probe envelope, which stores
// no fidelity verdict (landscape, dark, 17 ms beat).
const FLOOR_CAPTURE =
  'perf-profiles/evidence/2026-09-07-issue-1715-transport-tax-hand-floor/issue-1693-hand-pen-landscape-dark-69383-105.json';
// Keeping one pointer move in this many under-drives the same strokes.
const THINNED_MOVE_STRIDE = 10;

// `inContact: false` keeps the phase's declared contact time but records no
// in-contact frame, so neither the in-contact nor the pacing share exists and
// only the gate's legacy step (lost time over contact seconds) can price it.
function probeReport({ inContact = true } = {}) {
  const contactMs = FRAME_COUNT * SIXTY_HZ_BEAT_MS;
  return {
    meta: { schema: 2 },
    phases: [
      {
        key: 'blank',
        paper: 'blank',
        startedAt: 100,
        endedAt: 100 + contactMs,
        contactMs,
        frames: FRAME_COUNT,
      },
    ],
    frames: Array.from({ length: FRAME_COUNT }, (_, index) => [
      100 + index * SIXTY_HZ_BEAT_MS,
      -1,
      inContact ? 1 : 0,
    ]),
    events: [],
    measures: [],
    history: [],
    liftLatencies: [],
  };
}

// A pen capture in the one mode the manifest below captures. No `fidelity`
// block unless a test adds one: the desktop transport's shape.
function drawingArtifact(extra = {}) {
  return { brush: 'pen', orientation: 'LANDSCAPE', theme: 'dark', report: probeReport(), ...extra };
}

function floorCapture() {
  return JSON.parse(readFileSync(join(ROOT, FLOOR_CAPTURE), 'utf8'));
}

// The same strokes with most of their moves dropped: what an under-driven
// transport delivers.
function thinnedFloorCapture() {
  const capture = floorCapture();
  const strokeEdges = new Set([POINTER_DOWN, POINTER_UP, POINTER_CANCEL]);
  let move = 0;
  capture.report.events = capture.report.events.filter(
    (event) => strokeEdges.has(event[EVENT_TYPE]) || move++ % THINNED_MOVE_STRIDE === 0
  );
  return capture;
}

function tempCorpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-capture-verdicts-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, artifact] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(artifact));
  }
  return dir;
}

// One target, one captured mode (landscape, dark), one pen run — the manifest
// shape of matrix-fidelity-rederivation.test.mjs, over a corpus this test wrote.
function matrixPenRun(targetId, artifact) {
  const manifest = {
    schemaVersion: 3,
    recordedOn: '2026-10-04',
    productCommit: '0'.repeat(40),
    snapshotKind: 'test',
    architecture: 'test',
    sourceRoot: tempCorpus({ 'pen.json': artifact }),
    targets: [
      {
        id: targetId,
        label: targetId,
        fidelity: 'advisory',
        modes: [
          ...[
            { id: 'portrait-light', orientation: 'PORTRAIT', theme: 'light' },
            { id: 'portrait-dark', orientation: 'PORTRAIT', theme: 'dark' },
            { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' },
          ].map((spec) => ({ ...spec, status: 'unavailable', reason: 'one mode is enough' })),
          {
            id: 'landscape-dark',
            status: 'captured',
            orientation: 'LANDSCAPE',
            theme: 'dark',
            drawing: { pen: ['pen.json'] },
          },
        ],
      },
    ],
  };
  const matrix = normalizeMatrix(manifest, ROOT);
  const cell = matrix.targets[0].modes.find((mode) => mode.id === 'landscape-dark').drawing.pen;
  return { ...cell.runs[0], failedFidelityChecks: cell.aggregate.failedFidelityChecks };
}

function rescored(artifact, targetId) {
  return rescoreCapture(artifact, { name: 'pen', targetId });
}

// The rescorer's printed table and summary line for a corpus of these files.
async function rescoredCorpus(files, targetId) {
  const corpus = relative(ROOT, tempCorpus(files));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const table = vi.spyOn(console, 'table').mockImplementation(() => {});
  try {
    await rescoreCaptures({ corpus, targetId });
    return { rows: table.mock.calls[0][0], summary: log.mock.calls[0][0] };
  } finally {
    log.mockRestore();
    table.mockRestore();
  }
}

const PERSON_EXPECTATION = {
  kind: 'ipad-finger',
  target: 'ipad-device-web',
  brush: 'pen',
  orientation: 'LANDSCAPE',
  theme: 'dark',
  label: 'pen',
};

describe('the matrix and the rescorer judge a capture by the same verdicts', () => {
  // The desktop transport writes no fidelity block, and Playwright's synthetic
  // touch can never pass trustedTouch. The matrix scores those cells; the
  // rescorer used to call every one of them failed.
  it('holds a desktop capture that stored no verdict to none, in both readers', () => {
    const artifact = drawingArtifact();

    const run = matrixPenRun('mac-chrome', artifact);
    expect(run.fidelity).toBeNull();
    expect(run.failedFidelityChecks).toEqual([]);
    expect(rescored(artifact, 'mac-chrome').fidelity).toBeNull();
  });

  it('counts no such capture as failing input fidelity', async () => {
    const { rows, summary } = await rescoredCorpus({ 'pen.json': drawingArtifact() }, 'mac-chrome');

    expect(rows.map((row) => row.fidelity)).toEqual(['n/a']);
    expect(summary).toBe(
      '\n1 rescored · 0 failed input fidelity · 0 with no target identity · 0 skipped · ' +
        '0 refused as cell-unattributable'
    );
  });

  // A missing verdict is not the desktop exemption: a real-finger capture in
  // the uploaded-probe envelope stores none either, and ADR-0174 re-scores
  // exactly such a capture to prove it passes fidelity.
  it('judges a touch capture that stored no verdict by its input, in both readers', () => {
    const artifact = floorCapture();

    const matrixFidelity = matrixPenRun('ipad-device-web', artifact).fidelity;
    expect(matrixFidelity).toMatchObject({ runtime: 'ios-safari', passed: true });
    expect(rescored(artifact, 'ipad-device-web').fidelity).toEqual(matrixFidelity);
  });

  it('fails the same capture under-driven, in both readers', async () => {
    const artifact = thinnedFloorCapture();

    const matrixRun = matrixPenRun('ipad-device-web', artifact);
    expect(matrixRun.fidelity.checks.cadence).toBe(false);
    expect(matrixRun.failedFidelityChecks).toEqual(['cadence']);
    expect(rescored(artifact, 'ipad-device-web').fidelity).toEqual(matrixRun.fidelity);
    const { rows, summary } = await rescoredCorpus({ 'pen.json': artifact }, 'ipad-device-web');
    expect(rows.map((row) => row.fidelity)).toEqual(['cadence']);
    expect(summary).toBe(
      '\n1 rescored · 1 failed input fidelity · 0 with no target identity · 0 skipped · ' +
        '0 refused as cell-unattributable'
    );
  });

  // An estimator change re-derives a different beat than the one a capture
  // stored; both readers must answer from the raw table, or one of them banks
  // a cell the other refuses to score.
  it('judges the regime by the beat in the report, not the stored summaries', () => {
    const artifact = drawingArtifact({ summaries: { intervalMs: STORED_BEAT_MS, phases: [] } });

    const matrixRegime = matrixPenRun('ipad-device-web', artifact).refreshRegime;
    expect(matrixRegime).toMatchObject({
      intervalMs: SIXTY_HZ_BEAT_MS,
      observed: '60hz',
      expected: '60hz',
      verdict: 'in-regime',
      scoreable: true,
    });
    expect(rescored(artifact, 'ipad-device-web').regime).toEqual(matrixRegime);
  });

  // A capture filed under a target is held to that target's runtime, whatever
  // label its runner stored: the stored label is the day-of claim the
  // re-derivation exists to distrust.
  it('judges input fidelity by the runtime the target declares', () => {
    const artifact = drawingArtifact({ fidelity: { runtime: 'android-chrome', passed: true } });

    const matrixFidelity = matrixPenRun('ipad-device-web', artifact).fidelity;
    expect(matrixFidelity.runtime).toBe('ios-safari');
    expect(rescored(artifact, 'ipad-device-web').fidelity).toEqual(matrixFidelity);
  });
});

describe('readers print the lost share the gate judged', () => {
  // With no in-contact frame, the gate prices the phase from its legacy step:
  // zero lost milliseconds over two seconds of declared contact.
  it('prints it in the rescore row', async () => {
    const artifact = drawingArtifact({ report: probeReport({ inContact: false }) });

    const { rows } = await rescoredCorpus({ 'pen.json': artifact }, 'mac-chrome');

    expect(rows[0]['lost %']).toBe(0);
  });

  it('reports it in the person-session verdict', () => {
    const artifact = drawingArtifact({ report: probeReport({ inContact: false }) });

    const { metrics } = captureVerdict(artifact, PERSON_EXPECTATION);

    expect(metrics.lostFrameTimeShare).toBe(0);
    expect(metrics.lostFrameTimeShareText).toBe('0%');
  });
});

describe('the person-session verdict on a capture that stored no fidelity verdict', () => {
  it('passes a well-driven one on its input', () => {
    const verdict = captureVerdict(floorCapture(), PERSON_EXPECTATION);

    expect(verdict.reasons).toEqual([]);
    expect(verdict.metrics.fidelity).toBe('pass');
  });

  it('redoes an under-driven one', () => {
    const verdict = captureVerdict(thinnedFloorCapture(), PERSON_EXPECTATION);

    expect(verdict.status).toBe('REDO');
    expect(verdict.reasons).toEqual([
      'input fidelity failed (cadence) — too few moves per frame: draw continuously and keep the finger down',
    ]);
  });

  // No session target is a desktop row; the verdict still reads the helper's
  // null rather than throwing on it.
  it('reads a desktop exemption as n/a', () => {
    const verdict = captureVerdict(drawingArtifact(), {
      ...PERSON_EXPECTATION,
      target: 'mac-chrome',
    });

    expect(verdict.metrics.fidelity).toBe('n/a');
  });
});
