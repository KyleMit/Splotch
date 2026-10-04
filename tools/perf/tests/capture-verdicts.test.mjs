import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { normalizeMatrix } from '../gen-performance-matrix.mjs';
import { rescoreCapture } from '../lib/capture-rescore.mjs';
import { captureVerdict } from '../lib/person-session.mjs';
import { rescoreCaptures } from '../rescore-captures.mjs';

// The probe's raw table is a tuple stream — frames are [stamp, dt, inContact] —
// with the phases declared beside it. A fixture that gets that wrong scores as
// an empty run, and every assertion about the verdict becomes vacuous.
const FRAME_COUNT = 120;
const SIXTY_HZ_BEAT_MS = 16.67;
// What an older estimator could have stored for the same capture: a 120 Hz beat.
const STORED_BEAT_MS = 8.3;

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

function tempCorpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-capture-verdicts-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, artifact] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(artifact));
  }
  return dir;
}

// One target, one captured mode, one pen run — the manifest shape of
// matrix-fidelity-rederivation.test.mjs, over a corpus this test wrote.
function matrixPenCell(targetId, artifact) {
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
  return matrix.targets[0].modes.find((mode) => mode.id === 'landscape-dark').drawing.pen;
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
  kind: 'ipad-driven',
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
  it('gives a capture that recorded no fidelity verdict none, in both readers', () => {
    const artifact = drawingArtifact();

    const cell = matrixPenCell('mac-chrome', artifact);
    expect(cell.runs[0].fidelity).toBeNull();
    expect(cell.aggregate.failedFidelityChecks).toEqual([]);
    expect(rescoreCapture(artifact, { name: 'pen', targetId: 'mac-chrome' }).fidelity).toBeNull();
  });

  it('counts no such capture as failing input fidelity', async () => {
    const { rows, summary } = await rescoredCorpus({ 'pen.json': drawingArtifact() }, 'mac-chrome');

    expect(rows.map((row) => row.fidelity)).toEqual(['n/a']);
    expect(summary).toBe(
      '\n1 rescored · 0 failed input fidelity · 0 with no target identity · 0 skipped · ' +
        '0 refused as cell-unattributable'
    );
  });

  // An estimator change re-derives a different beat than the one a capture
  // stored; both readers must answer from the raw table, or one of them banks
  // a cell the other refuses to score.
  it('judges the regime by the beat in the report, not the stored summaries', () => {
    const artifact = drawingArtifact({ summaries: { intervalMs: STORED_BEAT_MS, phases: [] } });

    const matrixRegime = matrixPenCell('ipad-device-web', artifact).runs[0].refreshRegime;
    const rescoredRegime = rescoreCapture(artifact, {
      name: 'pen',
      targetId: 'ipad-device-web',
    }).regime;
    expect(matrixRegime).toMatchObject({
      intervalMs: SIXTY_HZ_BEAT_MS,
      observed: '60hz',
      expected: '60hz',
      verdict: 'in-regime',
      scoreable: true,
    });
    expect(rescoredRegime).toEqual(matrixRegime);
  });

  // A capture filed under a target is held to that target's runtime, whatever
  // label its runner stored: the stored label is the day-of claim the
  // re-derivation exists to distrust.
  it('judges input fidelity by the runtime the target declares', () => {
    const artifact = drawingArtifact({ fidelity: { runtime: 'android-chrome', passed: true } });

    const matrixFidelity = matrixPenCell('ipad-device-web', artifact).runs[0].fidelity;
    const rescoredFidelity = rescoreCapture(artifact, {
      name: 'pen',
      targetId: 'ipad-device-web',
    }).fidelity;
    expect(matrixFidelity.runtime).toBe('ios-safari');
    expect(rescoredFidelity).toEqual(matrixFidelity);
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

describe('a person-session capture that recorded no fidelity verdict', () => {
  // Every driver the person session runs writes a verdict, so a capture without
  // one cannot show its touches were trusted; it is redone, never passed.
  it('is redone rather than passed', () => {
    const verdict = captureVerdict(drawingArtifact(), PERSON_EXPECTATION);

    expect(verdict.status).toBe('REDO');
    expect(verdict.reasons).toEqual(['the capture recorded no input-fidelity verdict — recapture']);
    expect(verdict.metrics.fidelity).toBe('unrecorded');
  });
});
