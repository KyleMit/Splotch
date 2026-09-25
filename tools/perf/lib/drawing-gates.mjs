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
const C3928CD88 = '3928cd88edbf441530e473a4e3c0b6767926bfc6';

// Drawing lost-frame reds an owner-recorded ADR explains, keyed like the
// exception table. This is an ANNOTATION, not a budget: the cell is still scored
// against its gate and still renders FAIL, with the disposition beside it so a
// reader can tell an explained red from an open one (ADR-0160's completion gate
// counts only the open ones). A red qualifies only when every paint gate passed,
// lost frame is its only failure, and its reading sits inside the band of the
// scope for its run's product commit — inclusive, on the published four-decimal
// share. A scope with null productCommits holds at any commit; one naming
// commits limits the explanation to the readings the ADR names at those commits.
// A band whose floor is the gate itself covers every red up to its ceiling. The
// bands are the ADR's own figures; `drawing-dispositions.test.mjs` fails if the
// ADR text stops stating them as `dispositionBandText` words them.
export const LOST_FRAME_DISPOSITIONS = {
  'ipad-device-web:pen': {
    ...ADR_0174,
    scopes: [
      { band: { minShare: LOST_FRAME_TIME_SHARE_GATE, maxShare: 0.0137 }, productCommits: null },
    ],
    basis:
      'Synthesized-touch transport cost, not product cost: every real-finger pen capture reads 0–0.06%, and on one commit in one session the driven arm read 1.18% and the finger 0%. A driven pen red above 1%, up to 1.37%, with passing paint gates is explained; a reading above 1.37% needs a real-finger capture at that commit.',
  },
  'ipad-device-web:eraser': {
    ...ADR_0174,
    scopes: [
      { band: { minShare: 0.0119, maxShare: 0.0125 }, productCommits: [E5142FAB] },
      { band: { minShare: 0.0101, maxShare: 0.0103 }, productCommits: [C3928CD88] },
    ],
    basis:
      'Explained by real-finger eraser captures in both landscape modes (0.04% light, 0% dark), which cover the named readings only: 1.19–1.25% at e5142fab and 1.01–1.03% at 3928cd88. A driven eraser red at any other commit needs a real-finger capture at that commit.',
  },
};

// How an ADR states a disposition band, and how the matrix prints it: two
// decimals, since the cell format's one decimal would print 1.22% as 1.2%. A
// floor at the gate reads as "above" it, because only a red is ever judged.
export function dispositionBandText({ minShare, maxShare }) {
  const twoDecimals = (share) => `${(share * 100).toFixed(2)}%`;
  if (minShare === LOST_FRAME_TIME_SHARE_GATE) {
    return `above ${Number((minShare * 100).toFixed(2))}%, up to ${twoDecimals(maxShare)}`;
  }
  return `${(minShare * 100).toFixed(2)}–${twoDecimals(maxShare)}`;
}

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
  // Every failing phase of every run is judged on its own reading against the
  // scope for its run's commit, not the aggregate maximum: a cell folding an
  // in-band red with an out-of-band one holds a red the ADR does not explain, so
  // the whole cell stays open.
  const runCovered = (run) => {
    const scope = disposition.scopes.find(
      ({ productCommits }) => !productCommits || productCommits.includes(run.productCommit)
    );
    if (!scope) return false;
    const inBand = (share) => share >= scope.band.minShare && share <= scope.band.maxShare;
    return (run.phases ?? []).every(
      (phase) => paintGatesPassed(phase.paint) && (phase.passed || inBand(phase.lostFrameTimeShare))
    );
  };
  const phaseCount = runs.reduce((count, run) => count + (run.phases?.length ?? 0), 0);
  if (!phaseCount || !runs.every(runCovered)) return null;
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
