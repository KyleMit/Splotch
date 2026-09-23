export const PAINT_P95_GATE_MS = 20;
export const PAINT_P99_GATE_MS = 33;
export const PAINT_MAX_GATE_MS = 50;
export const LOST_FRAME_TIME_SHARE_GATE = 0.01;

// Cells the single gate cannot hold, keyed `<targetId>:<brush>`. This is an
// EXCEPTION table, not a per-cell budget: a cell absent from it is scored at
// LOST_FRAME_TIME_SHARE_GATE, so a passing grade never has to be spelled out and
// a new cell cannot enter the matrix already exempt. Entries carry the reason and
// the measurement they were set from, and only ever ratchet down — raising one
// needs the same evidence as adding it. See ADR-0137.
export const LOST_FRAME_TIME_SHARE_EXCEPTIONS = {
  'ipad-device-web:crayon': {
    share: 0.015,
    reason:
      'Crayon deposits wax through pattern-filled strokes that Safari prices per path-length, so the web build cannot merge them across pointermoves (the native WKWebView prices per op and merges per frame instead — ADR-0137 as amended), ' +
      'so it pays a per-move cost every other brush coalesces away, and mirror-by-blit already took ' +
      'it from 2.11%. Across all four orientation/theme modes its median is 1.11-1.17%, but a single ' +
      'capture of landscape-light measured 1.40% and re-measured to 1.17% over three samples. A ' +
      'matrix cell IS a single capture, so this is set above the observed single-sample excursion ' +
      'rather than above the median.',
  },
  'ipad-device-native:crayon': {
    share: 0.015,
    reason:
      'Per-frame crayon op merging (ADR-0137 as amended, issue 1236) brought the native WKWebView ' +
      'from a 2.14% published cell to Safari parity: three same-session samples on 2026-08-25 ' +
      "measured 0.96/1.11/1.44%, median 1.11% — inside the web cell's own 1.11-1.17% median band " +
      'with the same shape of single-sample excursion. The same residual per-move wax cost now ' +
      'binds both runtimes, so the same 1.5% single-capture budget applies, set by the same ' +
      'above-the-excursion rule.',
  },
};

const ADR_0174 = {
  adr: 'ADR-0174',
  adrPath: 'docs/adrs/0174-ipad-drawing-lost-frame-is-judged-against-the-real-finger-floor.md',
};
const E5142FAB = 'e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3';

// Drawing lost-frame reds an owner-recorded ADR explains, keyed like the
// exception table. This is an ANNOTATION, not a budget: the cell is still scored
// against its gate and still renders FAIL, with the disposition beside it so a
// reader can tell an explained red from an open one (ADR-0160's completion gate
// counts only the open ones). A red qualifies only when every paint gate passed,
// lost frame is its only failure, and its reading sits inside the band the ADR
// records — inclusive, on the published four-decimal share — plus, where the ADR
// limits the explanation to named readings, at one of the named product commits.
// The bands are the ADR's own figures; `drawing-dispositions.test.mjs` fails if
// the ADR text stops stating them.
export const LOST_FRAME_DISPOSITIONS = {
  'ipad-device-web:pen': {
    ...ADR_0174,
    band: { minShare: 0.0122, maxShare: 0.0137 },
    productCommits: null,
    basis:
      'Synthesized-touch transport cost, not product cost: real-finger pen captures read 0.04–0.06% where the driven cells read 1.22–1.37%. A driven pen red inside that band with passing paint gates is explained; a reading above it needs a real-finger capture at that commit.',
  },
  'ipad-device-web:eraser': {
    ...ADR_0174,
    band: { minShare: 0.0119, maxShare: 0.0125 },
    productCommits: [E5142FAB],
    basis:
      'Explained by extension from the pen band, not by measurement: no finger capture of eraser exists, so the explanation covers only the three 1.19–1.25% readings at e5142fab. A later driven eraser red needs a real-finger capture.',
  },
};

function paintGatesPassed(paint) {
  return (
    paint?.p95 <= PAINT_P95_GATE_MS &&
    paint?.p99 <= PAINT_P99_GATE_MS &&
    paint?.max <= PAINT_MAX_GATE_MS
  );
}

// Takes a normalized matrix cell ({ aggregate, gateShare, runs }) and returns the
// disposition covering its red, or null for a green, unscoreable, or uncovered one.
export function lostFrameDispositionFor(targetId, brush, entry) {
  const disposition = LOST_FRAME_DISPOSITIONS[`${targetId}:${brush}`];
  const aggregate = entry?.aggregate;
  const runs = entry?.runs ?? [];
  if (!disposition || !aggregate || !runs.length) return null;
  if (aggregate.scoreable === false || aggregate.blankPassed !== false) return null;
  const share = aggregate.lostFrameTimeShare;
  if (!(share >= disposition.band.minShare && share <= disposition.band.maxShare)) return null;
  const phases = runs.flatMap((run) => run.phases ?? []);
  const onlyLostFrameFailed = phases.every(
    (phase) =>
      paintGatesPassed(phase.paint) &&
      (phase.passed || phase.lostFrameTimeShare > (entry.gateShare ?? LOST_FRAME_TIME_SHARE_GATE))
  );
  if (!phases.length || !onlyLostFrameFailed) return null;
  if (
    disposition.productCommits &&
    !runs.every((run) => disposition.productCommits.includes(run.productCommit))
  ) {
    return null;
  }
  return { adr: disposition.adr, adrPath: disposition.adrPath };
}

export function lostFrameTimeShareGateFor(targetId, brush) {
  return (
    LOST_FRAME_TIME_SHARE_EXCEPTIONS[`${targetId}:${brush}`]?.share ?? LOST_FRAME_TIME_SHARE_GATE
  );
}

export function scoreDrawingPhase(phase, gateShare = LOST_FRAME_TIME_SHARE_GATE) {
  const paint = phase.paintLatencyMs ?? {};
  const legacyContactMs = Number.isFinite(phase.contactSeconds)
    ? phase.contactSeconds * 1_000
    : undefined;
  const legacyLostFrameTimeShare = legacyContactMs
    ? phase.pacing?.lostMs / legacyContactMs
    : undefined;
  const lostFrameTimeShare =
    phase.starvation?.inContact?.lostFrameTimeShare ??
    phase.pacing?.lostFrameTimeShare ??
    legacyLostFrameTimeShare ??
    Infinity;
  const checks = {
    paintP95: paint.p95 <= PAINT_P95_GATE_MS,
    paintP99: paint.p99 <= PAINT_P99_GATE_MS,
    paintMax: paint.max <= PAINT_MAX_GATE_MS,
    starvation: lostFrameTimeShare <= gateShare,
  };
  return {
    phase: phase.key,
    paint,
    lostFrameTimeShare,
    gateShare,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function scoreDrawingRun(phases, gateShare = LOST_FRAME_TIME_SHARE_GATE) {
  const phaseScores = phases.map((phase) => scoreDrawingPhase(phase, gateShare));
  return {
    phases: phaseScores,
    passed: phaseScores.length > 0 && phaseScores.every((phase) => phase.passed),
  };
}

export function drawingGateRows(score) {
  return score.phases.map((phase) => ({
    phase: phase.phase,
    'paint p95': phase.paint.p95,
    'paint p99': phase.paint.p99,
    'paint max': phase.paint.max,
    'lost frame %': Number.isFinite(phase.lostFrameTimeShare)
      ? Math.round(phase.lostFrameTimeShare * 10_000) / 100
      : undefined,
    verdict: phase.passed ? 'PASS' : 'FAIL',
  }));
}
