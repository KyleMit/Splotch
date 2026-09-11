import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { esc } from '../lib/html.mjs';
import { checkMatrixStaleness } from './check-matrix-staleness.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { masthead, page, siteFooter } from '../scrapbook/lib/scrapbook-chrome.mjs';
import {
  ACTION_FIRST_FRAME_GATE_MS,
  ACTION_FRAME_MAX_GATE_MS,
  ACTION_FRAME_P95_GATE_MS,
  ACTION_GATE_ALLOWANCE_LEDGERS,
  actionGateAllowancesFor,
  rotationFirstFrameNa,
  summarizeActions,
  MAX_BREACH_CONFIRMING_SAMPLES,
} from './lib/action-stats.mjs';
import { summarizeRun } from './lib/real-screen-stats.mjs';
import { IN_REGIME, UNESTABLISHED_REGIME, refreshRegimeVerdict } from './lib/refresh-regime.mjs';
import { describeHostQuiet, hostQuietTrustState } from './lib/host-quiet.mjs';
import {
  DEFAULT_CAPTURE_RUNTIME,
  describeFidelityFailures,
  inputFidelity,
  onlyUncalibratedChecksFailed,
} from './lib/input-fidelity.mjs';
import {
  CAMPAIGN_TARGETS,
  GESTURE_REPEATS,
  UNDO_COUNT,
  anomalousEraserRefills,
  eraserRefillShortfall,
  gesturePlanFor,
  recordedGesturePlan,
  recordedGestureRepeats,
  recordedPaintedOutput,
  splitUndoEvidenceProblem,
} from './lib/campaign-plan.mjs';
import {
  LOST_FRAME_TIME_SHARE_EXCEPTIONS,
  LOST_FRAME_TIME_SHARE_GATE,
  lostFrameTimeShareGateFor,
  PAINT_MAX_GATE_MS,
  PAINT_P95_GATE_MS,
  PAINT_P99_GATE_MS,
  scoreDrawingRun,
} from './lib/drawing-gates.mjs';
import {
  UNDO_ENGINE_P95_GATE_MS,
  UNDO_NEXT_FRAME_MAX_GATE_MS,
  UNDO_NEXT_FRAME_P95_GATE_MS,
} from './lib/undo-action-stats.mjs';
import { FULL_ACTION_GROUPS, actionNotApplicableReason } from './lib/action-applicability.mjs';

const DEFAULT_MANIFEST = join(
  ROOT,
  'scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json'
);
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const BRUSH_LABELS = { pen: 'Pen', crayon: 'Crayon', magic: 'Magic', eraser: 'Eraser' };
// `idle frame control` performs no interaction. It exists to prove the target can
// hold frames at rest, so that every other action's score means something — and it
// was excluded from the comparison without ever being consulted. On
// android-emulator-web it fails its own gate in both portrait modes (frame p95
// 50.0 and 33.3 ms against a 20 ms gate), so those two modes' 24-of-50 and
// 26-of-50 action failures are not attributable to the product at all.
const ACTION_CONTROL_LABELS = new Set(['idle frame control']);
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
const THEMES = ['light', 'dark'];
const MODE_KEYS = ORIENTATIONS.flatMap((orientation) =>
  THEMES.map((theme) => `${orientation.toLowerCase()}-${theme}`)
);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// A cell whose raw capture is not committed still has published, normalized
// evidence in the last data.json. Copying that forward is how a rerun of the
// generator keeps a first valid result — including a red gate — instead of
// silently dropping the cell or recapturing it into a different number.
const PRESERVED = 'preserved';
const CAPTURED_UNTRACKED = 'captured-untracked';

function loadPreservedEvidence(manifest, manifestDirectory) {
  const spec = manifest.preservedEvidence;
  if (!spec) return null;
  if (typeof spec.from !== 'string' || !spec.from.trim()) {
    throw new Error('Performance matrix preservedEvidence.from must name a published report');
  }
  if (typeof spec.reason !== 'string' || !spec.reason.trim()) {
    throw new Error('Performance matrix preservedEvidence.reason must say why raw inputs are gone');
  }
  const published = readJson(sourcePath(spec.from, manifestDirectory));
  const byTarget = new Map(
    (published.targets ?? []).map((target) => [
      target.id,
      new Map((target.modes ?? []).map((mode) => [mode.id, mode])),
    ])
  );
  return { from: spec.from, reason: spec.reason, byTarget };
}

// A preserved drawing section is the published normalized result, and its runs
// still carry the fidelity verdict they were captured with. Without acting on it, a
// preserved fidelity-failed cell rendered a bold product FAIL while a freshly
// captured one with the identical verdict rendered unscoreable — the same
// measurement, two contradictory claims, decided only by which side of a recapture
// it landed on.
//
// The verdict is not re-derived, because re-deriving needs the raw input samples and
// a preserved cell has only normalized results. So the cell is not scored at all:
// its published verdict is kept as provenance and the current one is unknown. Every
// preserved drawing cell in the matrix today already fails some check, so this
// changes no published number — it closes the case where a copied verdict that
// happened to pass would have been read as a current one.
export const PRESERVED_VERDICT_REASON = 'preserved: no current verdict';
export function withPreservedScoreability(section, preserved = true) {
  if (!preserved || !section || typeof section !== 'object') return section;
  const rescored = {};
  for (const [brush, entry] of Object.entries(section)) {
    const runs = entry?.runs ?? [];
    if (!entry?.aggregate || !runs.length) {
      rescored[brush] = entry;
      continue;
    }
    // The verdict a preserved run carries was computed by whichever expectations
    // its checkout held, and it cannot be re-derived because re-deriving needs raw
    // input samples a preserved cell does not have. Keeping it under its own name
    // says what it is; letting it drive `scoreable` would present a historical
    // verdict as a judgement under current calibration, and `scoreable` is what the
    // plots and the failure ranking read.
    // `run.fidelity` is left in place. It is not only provenance: this matrix
    // preserves cells from its own previously published `data.json`
    // (`preservedEvidence.from`), so blanking the field here destroys the source
    // the NEXT regeneration preserves from — the generator eats its own input. The
    // "no current verdict" claim therefore lives on the aggregate, which is
    // recomputed from the runs every time.
    const publishedChecks = [
      ...new Set(
        runs.flatMap((run) =>
          Object.entries(run.fidelity?.checks ?? {})
            .filter(([, passed]) => passed !== true)
            .map(([check]) => check)
        )
      ),
    ].sort();
    rescored[brush] = {
      ...entry,
      aggregate: {
        ...entry.aggregate,
        scoreable: false,
        unscoreableReason: PRESERVED_VERDICT_REASON,
        failedFidelityChecks: [],
        publishedFidelityChecks: publishedChecks,
      },
    };
  }
  return rescored;
}

function publishedSection(preserved, targetId, mode, section, evidenceState) {
  if (!preserved) {
    throw new Error(
      `Target ${targetId} mode ${mode.id} marks ${section} ${evidenceState}, but the manifest declares no preservedEvidence source`
    );
  }
  const publishedMode = preserved.byTarget.get(targetId)?.get(mode.id);
  if (!publishedMode) {
    throw new Error(
      `${preserved.from} has no ${targetId} mode ${mode.id} to carry ${section} from`
    );
  }
  if (publishedMode[section] === undefined) {
    throw new Error(`${preserved.from} has no ${section} for ${targetId} mode ${mode.id}`);
  }
  return publishedMode[section];
}

function sourcePath(source, sourceDirectory) {
  return isAbsolute(source) ? source : resolve(sourceDirectory, source);
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function roundShare(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function normalizedDistribution(distribution) {
  if (!distribution) return null;
  const normalized = Object.fromEntries(
    ['p50', 'p95', 'p99', 'max'].map((metric) => [metric, round(distribution[metric])])
  );
  // A distribution declared not-applicable (a Safari rotation first frame,
  // ADR-0142) keeps that declaration through data.json so renderers show N/A
  // rather than a structurally-zero pass.
  if (distribution.na === true) normalized.na = true;
  return normalized;
}

// The action scorer's max-breach confirmation (ADR-0156) rides beside the
// distribution: `maxBreachSamples` counts the scored repeats over the max gate
// and `maxUnconfirmed` marks a group whose single breaching repeat did not fail
// it. Both are preserved into data.json so a captured-untracked cell keeps the
// evidence the next regeneration reads it back from — the distribution alone
// would render such a cell as a plain PASS with an over-gate max.
function normalizedActionFrames(frames) {
  const normalized = normalizedDistribution(frames);
  if (!normalized) return null;
  if (Number.isFinite(frames.maxBreachSamples))
    normalized.maxBreachSamples = frames.maxBreachSamples;
  if (frames.maxUnconfirmed === true) normalized.maxUnconfirmed = true;
  return normalized;
}

function captureOrientation(profile) {
  const explicit = profile.orientation ?? profile.automation?.orientation;
  if (explicit) return String(explicit).toUpperCase();
  const viewport = profile.viewport ?? profile.report?.meta?.viewport;
  const width = viewport?.width ?? viewport?.w;
  const height = viewport?.height ?? viewport?.h;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) return null;
  return width > height ? 'LANDSCAPE' : 'PORTRAIT';
}

function captureTheme(profile) {
  const theme = profile.theme ?? profile.report?.meta?.theme;
  return theme ? String(theme).toLowerCase() : null;
}

function validateCaptureMode(profile, mode, source) {
  const orientation = captureOrientation(profile);
  const theme = captureTheme(profile);
  const modeLabel = `${mode.orientation.toLowerCase()} / ${mode.theme}`;
  if (!orientation) {
    throw new Error(`${source} is missing orientation metadata for ${modeLabel}`);
  }
  if (!theme) throw new Error(`${source} is missing theme metadata for ${modeLabel}`);
  if (orientation !== mode.orientation) {
    throw new Error(
      `${source} recorded ${orientation.toLowerCase()} orientation; expected ${mode.orientation.toLowerCase()}`
    );
  }
  if (theme !== mode.theme) {
    throw new Error(`${source} recorded ${theme} theme; expected ${mode.theme}`);
  }
}

// The verdict a capture recorded is the one its runner computed on the day, from
// whatever expectations that checkout held. The matrix already re-scores every
// drawing table with the current gates for exactly that reason, and leaving the
// fidelity verdict frozen means a correction to the expectations reaches published
// cells only through device time. So it is re-derived here too, from the input the
// capture recorded and the runtime the target declares.
//
// Only when the capture carried a verdict at all. A runner that writes none — the
// desktop transport — is not held to one, the same carve-out `artifactPassedFidelity`
// makes; deriving one for it would mark every desktop cell unscoreable on a
// trusted-touch check that Playwright cannot satisfy by construction.
//
// A PRESERVED cell keeps the verdict it was published with, because re-deriving one
// needs the raw input samples and a preserved cell has only normalized results — the
// same reason it keeps its published scores rather than being re-scored. So a target
// captured on both sides of a recapture can show a fresh mode judged by the current
// expectations beside a preserved mode judged by the ones in force when it was taken.
// That is the standing cost of preserved evidence (ADR-0138), marked as such in the
// matrix, and it resolves when the mode is recaptured — not a second verdict for the
// same measurement.
function rederiveFidelity(profile, phases, captureRuntime) {
  if (!profile.fidelity) return null;
  return inputFidelity(phases?.[0]?.input ?? {}, captureRuntime);
}

// The per-run trust ledger issue 1304 asked for: one composed list answering
// "can I trust this number?", built from the fields the instrument-fix stacks
// accreted one by one — because a run fine on five RECORDED dimensions looked
// identical to one fine on five with two unrecorded. A LIST, not a score: the
// interesting case is always which guarantee is missing. Three states:
// `verified` (measured and sound), `failed` (measured and not), `unrecorded`
// (nothing measured — the state this structure exists to make visible).
// `hostQuiet` re-derives from the raw load samples the runners now bracket a
// capture with (issue 1304; lib/host-quiet.mjs owns the threshold), and stays
// a visible `unrecorded` for every capture predating them: a capture taken on
// a busy host looks identical to a clean one, and this row is what keeps that
// gap legible instead of forgotten. The
// eraser-ink dimension appears only on runs that recorded fill machinery —
// absence of an inapplicable dimension is not an absent guarantee.
function composeRunTrust(
  profile,
  {
    fidelity,
    refreshRegime,
    gestureRepeats,
    gesturePlan,
    anomalousRefills,
    paintedOutput,
    judgingRuntime,
  }
) {
  const trust = [];
  if (fidelity?.passed === true) {
    trust.push({ name: 'inputFidelity', state: 'verified' });
  } else if (fidelity?.passed === false && onlyUncalibratedChecksFailed(fidelity)) {
    // Instrument silence, not capture failure: every real check passed and the
    // only non-passes are checks the instrument has no measured expectation
    // for. Publishing this as `failed` would brand every android-native run a
    // bad capture at the campaign-end regen (the PR 1364 review's blocking
    // finding); `unrecorded` is the ledger's own word for nothing-measured,
    // and the (uncalibrated) suffix in the detail keeps the row self-explaining.
    trust.push({
      name: 'inputFidelity',
      state: 'unrecorded',
      detail: describeFidelityFailures(fidelity),
    });
  } else if (fidelity?.passed === false) {
    trust.push({
      name: 'inputFidelity',
      state: 'failed',
      detail: describeFidelityFailures(fidelity),
    });
  } else {
    trust.push({ name: 'inputFidelity', state: 'unrecorded' });
  }
  if (refreshRegime?.verdict === IN_REGIME) {
    trust.push({ name: 'refreshRegime', state: 'verified', detail: `${refreshRegime.observed}` });
  } else if (refreshRegime?.verdict === UNESTABLISHED_REGIME) {
    trust.push({
      name: 'refreshRegime',
      state: 'unrecorded',
      // Unestablished only means the TARGET declares no regime — the beat
      // itself may well have been measured, and it is the one thing worth
      // carrying.
      detail: refreshRegime.observed
        ? `no established regime (measured ${refreshRegime.observed})`
        : 'no established regime',
    });
  } else {
    trust.push({ name: 'refreshRegime', state: 'failed', detail: refreshRegime?.verdict });
  }
  trust.push(
    Number.isFinite(gestureRepeats)
      ? { name: 'gestureRepeats', state: 'verified', detail: `${gestureRepeats}` }
      : { name: 'gestureRepeats', state: 'unrecorded' }
  );
  trust.push(
    typeof gesturePlan === 'string'
      ? { name: 'gesturePlan', state: 'verified', detail: gesturePlan }
      : { name: 'gesturePlan', state: 'unrecorded' }
  );
  const fill = profile?.eraserFill ?? null;
  if (fill !== null || anomalousRefills !== null) {
    const fillProblems = [];
    if (fill === null) fillProblems.push('no setup fill recorded');
    else if (fill.pending || (fill.transparentTiles?.length ?? 0) > 0) {
      fillProblems.push('setup fill unsound');
    }
    if ((anomalousRefills?.length ?? 0) > 0) fillProblems.push('anomalous refills');
    if (fillProblems.length) {
      trust.push({ name: 'eraserInk', state: 'failed', detail: fillProblems.join(' + ') });
    } else {
      // A repaired fill is verified — the re-check proved opaque ink — but the
      // recorded settle-wipe instability is evidence kept on purpose, so it
      // rides the detail instead of vanishing into a bare verified.
      trust.push(
        fill.repairedAfterSettle
          ? { name: 'eraserInk', state: 'verified', detail: 'repaired-after-settle' }
          : { name: 'eraserInk', state: 'verified' }
      );
    }
  }
  const identity = profile?.pageIdentity ?? null;
  if (identity === 'proven-by-url') {
    trust.push({ name: 'pageIdentity', state: 'verified' });
  } else {
    trust.push({ name: 'pageIdentity', state: 'unrecorded', detail: identity ?? 'absent' });
  }
  // Whether the canvas provably changed during the pass — the output-side
  // guarantee the temporal gates cannot give (a blank renderer passed them
  // all). Recorded only by the split probe, so most historical captures are a
  // visible `unrecorded` here, same as pageIdentity for a native run.
  if (paintedOutput === null || paintedOutput === undefined) {
    trust.push({ name: 'paintedOutput', state: 'unrecorded' });
  } else if (paintedOutput.changed === true) {
    trust.push({ name: 'paintedOutput', state: 'verified' });
  } else {
    trust.push({
      name: 'paintedOutput',
      state: 'failed',
      detail: 'no canvas change recorded during the pass',
    });
  }
  // The stored label is the runner's day-of claim — the same frozen claim
  // re-derivation exists to distrust — so it is `verified` only when it agrees
  // with the runtime the run was actually judged under, and a disagreement is
  // published as the contradiction it is rather than silently trusted (the
  // PR 1364 review: the fallback's primary read is dead for drawing runs, so
  // this row was fed exclusively by the stored fidelity label).
  const storedRuntime = profile?.captureRuntime ?? profile?.fidelity?.runtime ?? null;
  if (storedRuntime && storedRuntime === judgingRuntime) {
    trust.push({ name: 'captureRuntime', state: 'verified', detail: storedRuntime });
  } else if (storedRuntime) {
    trust.push({
      name: 'captureRuntime',
      state: 'failed',
      detail: `recorded ${storedRuntime}, judged as ${judgingRuntime}`,
    });
  } else {
    trust.push({ name: 'captureRuntime', state: 'unrecorded' });
  }
  const hostQuietState = hostQuietTrustState(profile?.hostQuiet);
  if (hostQuietState) {
    trust.push({
      name: 'hostQuiet',
      state: hostQuietState,
      detail: describeHostQuiet(profile.hostQuiet),
    });
  } else {
    trust.push({ name: 'hostQuiet', state: 'unrecorded' });
  }
  return trust;
}

function normalizeDrawingRun(
  source,
  productCommit,
  sourceDirectory,
  mode,
  gateShare,
  { expectedRefreshRegime, expectedGestureRepeats, captureRuntime }
) {
  const profile = readJson(sourcePath(source, sourceDirectory));
  validateCaptureMode(profile, mode, source);
  const summaries = profile.report ? summarizeRun(profile.report) : profile.summaries;
  const phases = summaries?.phases;
  const scored = scoreDrawingRun(phases ?? [], gateShare);
  const refreshRegime = refreshRegimeVerdict(
    summaries?.intervalMs,
    expectedRefreshRegime,
    summaries?.regimeMixture
  );
  const fidelity = rederiveFidelity(profile, phases, captureRuntime);
  const failedFidelityChecks = Object.entries(fidelity?.checks ?? {})
    .filter(([, passed]) => passed !== true)
    .map(([check]) => check);
  return {
    source,
    productCommit,
    // The repeat count the gesture plan replayed (issue 1297): first-contact
    // costs amortise across repeats, so runs at different counts measured
    // different mixes and are not comparable. Null for artifacts predating the
    // field. Read through the same helper acceptance uses, so the two readers
    // cannot drift.
    gestureRepeats: recordedGestureRepeats(profile),
    // How those repeats were fed ink (issue 1292): an unrefilled eraser capture
    // erased mostly-transparent pixels on passes 2..N and is optimistic by an
    // unknown amount, so plans mark a comparability boundary the same way the
    // repeat count does. Null for artifacts predating the field. Same shared
    // reader as acceptance, so the two cannot drift.
    gesturePlan: recordedGesturePlan(profile),
    // Same shared reader as acceptance (issue 1355): a capture whose refills
    // recorded an anomaly measured erasing blank paper on later passes, so the
    // fold below refuses it rather than publishing an optimistic cell.
    anomalousEraserRefills: anomalousEraserRefills(profile),
    eraserRefillShortfall: eraserRefillShortfall(profile, expectedGestureRepeats),
    // Whether the drawing surfaces provably changed during the pass — the split
    // probe's output-side evidence (the temporal gates scored a blank renderer;
    // 7c37d255). Null for artifacts predating the field. Same shared reader as
    // acceptance, so the two cannot drift; the fold below refuses a recorded
    // no-change run rather than publishing a number that measured no drawing.
    paintedOutput: recordedPaintedOutput(profile),
    // One composed answer to "can I trust this number?" — see composeRunTrust.
    trust: composeRunTrust(profile, {
      fidelity,
      refreshRegime,
      gestureRepeats: recordedGestureRepeats(profile),
      gesturePlan: recordedGesturePlan(profile),
      anomalousRefills: anomalousEraserRefills(profile),
      paintedOutput: recordedPaintedOutput(profile),
      judgingRuntime: captureRuntime,
    }),
    fidelity,
    // Published so a cell can be audited for the regime it was scored against.
    // Preserved cells carry normalized results and no beat, which is exactly why a
    // 6x-wrong number could not be told from a real one after the fact.
    refreshRegime,
    // A capture whose input fidelity failed is not a product pass or fail — the
    // capture runner's own contract calls it unscoreable, and rendering it as an
    // ordinary measurement launders a rejected input path into a product claim. A
    // capture measured at the other refresh rate is unscoreable for the neighbouring
    // reason: the gates are 60 Hz-calibrated (ADR-0085) and lostFrameTimeShare
    // prices frames against the observed beat, so the same drawing charged against
    // 8.3 ms instead of 16.7 ms reads as a catastrophe.
    // `scoreable`, not `matched`: a target whose regime has never been established
    // cannot have its beat compared to anything, and scoring it anyway is the
    // fail-open this guard exists to close.
    scoreable: fidelity?.passed !== false && refreshRegime.scoreable,
    failedFidelityChecks,
    phases: scored.phases.map((phase) => ({
      phase: phase.phase,
      paint: normalizedDistribution(phase.paint),
      lostFrameTimeShare: roundShare(phase.lostFrameTimeShare),
      passed: phase.passed,
    })),
    passed: scored.passed,
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function maximum(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function aggregateDrawingRuns(runs) {
  const blankPhases = runs.flatMap((run) => run.phases.filter((phase) => phase.phase === 'blank'));
  return {
    runCount: runs.length,
    paint: {
      p95: round(median(blankPhases.map((phase) => phase.paint.p95))),
      p99: round(median(blankPhases.map((phase) => phase.paint.p99))),
      max: round(maximum(blankPhases.map((phase) => phase.paint?.max))),
    },
    lostFrameTimeShare: roundShare(maximum(blankPhases.map((phase) => phase.lostFrameTimeShare))),
    blankPassed: blankPhases.length > 0 && blankPhases.every((phase) => phase.passed),
    allPhasesPassed: runs.length > 0 && runs.every((run) => run.passed),
    scoreable: runs.length > 0 && runs.every((run) => run.scoreable !== false),
    failedFidelityChecks: [
      ...new Set(runs.flatMap((run) => run.failedFidelityChecks ?? [])),
    ].sort(),
    // The regime the samples behind this cell were measured in. A cell whose runs
    // disagree is `mixed`, which is worth seeing on its own: their numbers are not
    // comparable to each other, let alone to the column.
    refreshRegime: distinctRefreshRegime(runs),
    offRefreshRegime: runs.some((run) => run.refreshRegime?.scoreable === false),
  };
}

function distinctRefreshRegime(runs) {
  const observed = [...new Set(runs.map((run) => run.refreshRegime?.observed ?? null))];
  if (observed.length === 0) return null;
  return observed.length === 1 ? observed[0] : 'mixed';
}

// Fidelity and refresh regime are two separate reasons a cell cannot be scored, and
// a label that named only the first rendered an empty parenthesis for the second.
function unscoreableReasons(aggregate) {
  if (aggregate.unscoreableReason) return [aggregate.unscoreableReason];
  const reasons = [...aggregate.failedFidelityChecks];
  if (aggregate.offRefreshRegime) reasons.push(`${aggregate.refreshRegime} beat`);
  return reasons;
}

function normalizeDrawing(sources = {}, productCommit, sourceDirectory, mode, targetId) {
  return Object.fromEntries(
    BRUSHES.map((brush) => {
      const gateShare = lostFrameTimeShareGateFor(targetId, brush);
      const target = CAMPAIGN_TARGETS[targetId];
      const expectedGestureRepeats =
        target && target.transport !== 'desktop' ? GESTURE_REPEATS : null;
      const runs = (sources[brush] ?? []).map((source) =>
        normalizeDrawingRun(source, productCommit, sourceDirectory, mode, gateShare, {
          expectedRefreshRegime: target?.refreshRegime ?? null,
          expectedGestureRepeats,
          captureRuntime: target?.captureRuntime ?? DEFAULT_CAPTURE_RUNTIME,
        })
      );
      // Two recorded counts in one cell means two instruments folded into one
      // number, which is issue 1297's defect; refusing is the fail-fast. A null
      // (an artifact predating the field) proves nothing either way and is
      // deliberately not treated as a conflict — rejecting it would strand every
      // historical capture.
      const repeatCounts = [
        ...new Set(runs.map((run) => run.gestureRepeats).filter(Number.isFinite)),
      ];
      if (repeatCounts.length > 1) {
        const sources = runs
          .map((run) => `${run.source} (${run.gestureRepeats ?? 'unrecorded'})`)
          .join(', ');
        throw new Error(
          `${targetId} ${mode.id} ${brush} folds captures with different gesture-repeat counts ` +
            `(${repeatCounts.join(', ')}) — their first-touch-to-repeat mixes are not comparable. ` +
            `Sources: ${sources}`
        );
      }
      const foreignRepeatCount = runs.find(
        (run) =>
          Number.isFinite(expectedGestureRepeats) &&
          Number.isFinite(run.gestureRepeats) &&
          run.gestureRepeats !== expectedGestureRepeats
      );
      if (foreignRepeatCount) {
        throw new Error(
          `${targetId} ${mode.id} ${brush} folds a capture recording ` +
            `${foreignRepeatCount.gestureRepeats} gesture repeats, not the campaign contract of ` +
            `${expectedGestureRepeats}. Source: ${foreignRepeatCount.source}`
        );
      }
      // The same refusal for HOW the repeats were fed ink: two recorded plans in
      // one cell folds an unrefilled eraser number into a refilled one, and the
      // unrefilled one is optimistic by an unknown amount (issue 1292). A null
      // (an artifact predating the field, accepted by standing decision — see
      // `recordedGesturePlan`) never conflicts. `typeof`, matching the repeat
      // count's Number.isFinite above: a run object not built by
      // normalizeDrawingRun must not enter the set as `undefined`.
      const plans = [
        ...new Set(runs.map((run) => run.gesturePlan).filter((plan) => typeof plan === 'string')),
      ];
      if (plans.length > 1) {
        const planSources = runs
          .map((run) => `${run.source} (${run.gesturePlan ?? 'unrecorded'})`)
          .join(', ');
        throw new Error(
          `${targetId} ${mode.id} ${brush} folds captures under different gesture plans ` +
            `(${plans.join(', ')}) — how each pass was fed ink is part of what the cell measured. ` +
            `Sources: ${planSources}`
        );
      }
      // After the plan checks, mirroring acceptance's ordering so both readers
      // name the same first problem: the plan states intent, the refills prove
      // outcome. A run with a recorded anomaly, or a clean record SHORTER than
      // the contract implies (repeats - 1: the refills never fired), measured
      // erasing blank paper on later passes (issue 1355).
      const refillFailures = runs.filter((run) => (run.anomalousEraserRefills?.length ?? 0) > 0);
      if (refillFailures.length) {
        const detail = refillFailures
          .map(
            (run) =>
              `${run.source} (${run.anomalousEraserRefills
                .map((refill) => JSON.stringify(refill))
                .join(', ')})`
          )
          .join('; ');
        throw new Error(
          `${targetId} ${mode.id} ${brush} folds a capture whose eraser refills recorded an ` +
            `anomaly — its later passes erased blank paper, so the number measures the wrong ` +
            `quantity (issue 1355). Recapture the cell. Sources: ${detail}`
        );
      }
      const shortfalls = runs.filter((run) => run.eraserRefillShortfall !== null);
      if (shortfalls.length) {
        const detail = shortfalls
          .map(
            (run) =>
              `${run.source} (recorded ${run.eraserRefillShortfall.recorded}, expected ` +
              `${run.eraserRefillShortfall.expected})`
          )
          .join('; ');
        throw new Error(
          `${targetId} ${mode.id} ${brush} folds a capture whose eraser refills never fired — ` +
            `a clean record shorter than the contract proves the later passes erased blank ` +
            `paper (issue 1355). Recapture the cell. Sources: ${detail}`
        );
      }
      // A single run is the published norm (one capture decides a cell), so the
      // run-vs-run refusal above never fires for it — a lone run recording a
      // retired or foreign plan must still collide with the CONTRACT. Scoped to
      // repeat-driven targets: the desktop transport drives no gesture plan,
      // and an unknown target has no contract to compare against.
      if (target && target.transport !== 'desktop') {
        const contract = gesturePlanFor(brush);
        const foreign = runs.find(
          (run) => typeof run.gesturePlan === 'string' && run.gesturePlan !== contract
        );
        if (foreign) {
          throw new Error(
            `${targetId} ${mode.id} ${brush} folds a capture recording gesture plan ` +
              `${foreign.gesturePlan}, not the campaign contract of ${contract}. ` +
              `Source: ${foreign.source}`
          );
        }
      }
      // Last, mirroring acceptance's ordering: a run refused above has a moot
      // blank-or-not question. A recorded no-change verdict means the temporal
      // gates scored a renderer that painted (and erased) nothing, so the
      // number is not a drawing measurement; absent records are the standing
      // historical tolerance.
      const blankRuns = runs.filter(
        (run) => run.paintedOutput !== null && run.paintedOutput.changed !== true
      );
      if (blankRuns.length) {
        throw new Error(
          `${targetId} ${mode.id} ${brush} folds a capture whose report records no canvas ` +
            `change during the pass (blank-output) — nothing was painted or erased, so the ` +
            `number measures a renderer that did no drawing work. Recapture the cell. ` +
            `Sources: ${blankRuns.map((run) => run.source).join(', ')}`
        );
      }
      return [brush, { aggregate: aggregateDrawingRuns(runs), gateShare, runs }];
    })
  );
}

function normalizeUndo(source, productCommit, sourceDirectory, mode) {
  if (!source) return null;
  const profile = readJson(sourcePath(source, sourceDirectory));
  validateCaptureMode(profile, mode, source);
  const splitEvidenceProblem = splitUndoEvidenceProblem(profile, UNDO_COUNT);
  if (splitEvidenceProblem) {
    throw new Error(`${source} cannot supply undo evidence: ${splitEvidenceProblem}`);
  }
  const summary = profile.undo;
  if (!summary) return null;
  return {
    source,
    productCommit,
    count: summary.count,
    engine: normalizedDistribution(summary.engine),
    nextFrame: normalizedDistribution(summary.nextFrame),
    passed: summary.passed,
  };
}

function normalizeActionPlan(plan, source) {
  if (plan === undefined) return null;
  if (
    plan?.schemaVersion !== 1 ||
    !Array.isArray(plan.actionGroups) ||
    !Array.isArray(plan.applicableLabels) ||
    !Array.isArray(plan.notApplicable)
  ) {
    throw new Error(`${source} has an invalid actionPlan declaration`);
  }
  const actionGroups = plan.actionGroups;
  const labels = plan.applicableLabels;
  const notApplicable = plan.notApplicable;
  const validOrientation = ['PORTRAIT', 'LANDSCAPE'].includes(plan.context?.orientation);
  const validSettingsShell = [null, 'compact', 'sectioned'].includes(plan.context?.settingsShell);
  if (
    actionGroups.some((group) => !FULL_ACTION_GROUPS.includes(group)) ||
    new Set(actionGroups).size !== actionGroups.length ||
    labels.some((label) => typeof label !== 'string' || !label.trim()) ||
    new Set(labels).size !== labels.length ||
    notApplicable.some(
      (entry) =>
        typeof entry?.label !== 'string' ||
        !entry.label.trim() ||
        typeof entry.reason !== 'string' ||
        !entry.reason.trim()
    ) ||
    new Set(notApplicable.map(({ label }) => label)).size !== notApplicable.length ||
    notApplicable.some(({ label }) => labels.includes(label)) ||
    !validOrientation ||
    !validSettingsShell
  ) {
    throw new Error(
      `${source} actionPlan must declare unique groups, labels, recorded exclusions, and product-surface context`
    );
  }
  return {
    schemaVersion: 1,
    actionGroups: [...actionGroups],
    applicableLabels: [...labels],
    notApplicable: notApplicable.map(({ label, reason }) => ({ label, reason })),
    context: {
      orientation: plan.context.orientation,
      settingsShell: plan.context.settingsShell,
    },
  };
}

// The allowance a result was scored under rides beside it in data.json, so a
// cell that passes only because of one is never read as a base-gate pass:
// the heat ratio prices it against its own budget and the tooltip names it.
// Absent from every result on the base gates.
// Whether an artifact's recorded `gateAllowances` names any action at all, in
// either shape the field has had: the flat per-label P95 map of the earliest
// captures, or the `{ p95, max }` ledgers since the max allowance split.
function recordsAnyAllowance(recorded) {
  if (!recorded || typeof recorded !== 'object') return false;
  const ledgers = 'p95' in recorded || 'max' in recorded ? Object.values(recorded) : [recorded];
  return ledgers.some((ledger) => ledger && Object.keys(ledger).length > 0);
}

function actionGateAllowance(allowances, label) {
  const gateAllowance = {};
  if (Number.isFinite(allowances.p95?.[label])) gateAllowance.p95Ms = allowances.p95[label];
  if (Number.isFinite(allowances.max?.[label])) gateAllowance.maxMs = allowances.max[label];
  return Object.keys(gateAllowance).length ? { gateAllowance } : {};
}

function normalizeActionCapture(spec, sourceDirectory, mode, targetId) {
  const profile = readJson(sourcePath(spec.source, sourceDirectory));
  validateCaptureMode(profile, mode, spec.source);
  const labels = spec.labels ? new Set(spec.labels) : null;
  // A capture is re-scored under the SHIPPED allowance policy for its matrix
  // target (ADR-0160), not under the `gateAllowances` it recorded: the record
  // is the capture-time verdict's provenance, and a policy change must reach
  // every published cell on regeneration so the diff is the record (the
  // ADR-0156 pattern). Only the ledger rows — the calibrated iPad web row
  // (ADR-0160) and the physical Android web row (ADR-0162) — score under one;
  // every other target stays on the base gates whatever its artifact recorded.
  const allowances = actionGateAllowancesFor(targetId);
  // Rotation first-frame applicability keys on the capture RUNTIME, never the
  // transport — `transport: "browser"` is the Appium web transport generally,
  // and Android Chrome over Appium must stay gated (ADR-0142). When both the
  // target's declared runtime and the artifact's recorded one exist they must
  // AGREE: a disagreement means a capture from another engine reached this
  // target's fold (campaign acceptance only tells web from native), and
  // silently preferring either side scores it under rules chosen for the other
  // — review round 2 reproduced an android-chrome artifact passing an
  // ios-safari target's rotation gate as N/A exactly that way. Fallback
  // ordering applies only when one side is absent; an artifact with neither
  // stays fully gated.
  const declaredRuntime = CAMPAIGN_TARGETS[targetId]?.captureRuntime ?? null;
  const recordedRuntime = profile.captureRuntime ?? null;
  if (declaredRuntime && recordedRuntime && declaredRuntime !== recordedRuntime) {
    throw new Error(
      `${spec.source} records captureRuntime ${recordedRuntime}, but target ${targetId} ` +
        `declares ${declaredRuntime} — an artifact from another engine cannot fold into this target`
    );
  }
  const runtime = declaredRuntime ?? recordedRuntime;
  // The desktop runtime spans three engines and rotation first-frame
  // applicability differs per engine (ADR-0142 amendment), so the engine gets
  // the same agreement rule as the runtime: both sides present must match, or
  // a capture from one engine scores under rules declared for another.
  // Non-desktop targets declare no engine and their artifacts record none.
  const declaredEngine = CAMPAIGN_TARGETS[targetId]?.desktopEngine ?? null;
  const recordedEngine = profile.engine ?? null;
  if (declaredEngine && recordedEngine && declaredEngine !== recordedEngine) {
    throw new Error(
      `${spec.source} records engine ${recordedEngine}, but target ${targetId} declares ` +
        `${declaredEngine} — an artifact from another engine cannot fold into this target`
    );
  }
  // The N/A decision takes the RECORDED engine only, never the target's
  // declaration alone: the desktop runner has recorded `engine` since its
  // first artifact, so every genuine desktop capture qualifies — while an
  // artifact recording neither runtime nor engine (the Android CDP action
  // runner's shape) misfiled under a desktop target would otherwise have its
  // rotation gate silently removed by the declaration. Such an artifact stays
  // gated, and its 100 ms first frames turn the misfile into a red cell
  // instead of an N/A.
  // A summary-only artifact (no raw samples) keeps the verdict it was written
  // with — scored under whatever ledger the capture recorded — so the shipped
  // policy cannot be applied to it. The fold accepts it only when that recorded
  // ledger IS the target's policy: on the ledger target that is never true of
  // a stored verdict (the policy is applied at fold time), and on every other
  // target it is true only of an artifact that recorded no allowance at all.
  // Anything else — a native artifact carrying the iPad ledger, say, whose
  // stored PASS at 29 ms the native row's base gate would fail — is refused
  // rather than folded as a verdict the target never scored.
  const scoredFromSamples = Boolean(profile.samples);
  if (!scoredFromSamples && Object.keys(allowances).length) {
    throw new Error(
      `${spec.source} carries summaries but no raw samples, so target ${targetId}'s ` +
        `allowance policy (ADR-0160) cannot be applied to it — fold a capture with samples`
    );
  }
  if (!scoredFromSamples && recordsAnyAllowance(profile.gateAllowances)) {
    throw new Error(
      `${spec.source} carries summaries but no raw samples, and its stored verdicts were scored ` +
        `under recorded gateAllowances that target ${targetId} does not grant (ADR-0160) — ` +
        `fold a capture with samples`
    );
  }
  const summaries = scoredFromSamples
    ? summarizeActions(profile.samples, [], allowances, (label) =>
        rotationFirstFrameNa(runtime, label, recordedEngine)
      )
    : profile.summaries;
  const results = summaries
    .filter((summary) => summary.count > 0 && (!labels || labels.has(summary.label)))
    .map((summary) => ({
      label: summary.label,
      count: summary.count,
      firstFrame: normalizedDistribution(summary.firstFrame),
      ready: normalizedDistribution(summary.ready),
      postActionFrames: normalizedActionFrames(summary.frames),
      ...actionGateAllowance(allowances, summary.label),
      passed: summary.passed,
      source: spec.source,
      productCommit: spec.productCommit,
    }));
  const missingLabels = spec.labels?.filter(
    (label) => !results.some((result) => result.label === label)
  );
  if (missingLabels?.length) {
    throw new Error(`${spec.source} does not contain: ${missingLabels.join(', ')}`);
  }
  const actionPlan = normalizeActionPlan(profile.actionPlan, spec.source);
  if (
    spec.kind === 'full' &&
    actionPlan &&
    !FULL_ACTION_GROUPS.every((group) => actionPlan.actionGroups.includes(group))
  ) {
    throw new Error(`${spec.source} is marked full but its actionPlan records a subset action run`);
  }
  if (actionPlan && actionPlan.context.orientation !== String(mode.orientation).toUpperCase()) {
    throw new Error(
      `${spec.source} actionPlan records ${actionPlan.context.orientation}, but the mode is ${mode.orientation}`
    );
  }
  const undeclaredResults = actionPlan
    ? results.filter((result) => !actionPlan.applicableLabels.includes(result.label))
    : [];
  if (undeclaredResults.length) {
    throw new Error(
      `${spec.source} measured actions outside its declared actionPlan: ${undeclaredResults
        .map(({ label }) => label)
        .join(', ')}`
    );
  }
  return {
    source: spec.source,
    productCommit: spec.productCommit,
    kind: spec.kind,
    selectedLabels: spec.labels ?? null,
    repeatCount: profile.repeats,
    actionPlan,
    results,
  };
}

// The sweep is part of the instrument: action cost depends on the state the
// preceding actions left, so a focused subset measures a different product
// state under the same label (docs/PROFILING-CAMPAIGNS.md; the 2026-08-31
// campaign hit focused-green-canonical-red three separate times). A focused
// capture may therefore replace a label only as the ISOLATION of a validated
// sweep — the same mode carrying a full-sweep capture at the same
// productCommit — never as a substitute for one. No committed manifest holds a
// focused source today, so this fails closed outright rather than granting a
// predating tolerance nothing depends on; a focused capture without a
// productCommit cannot prove agreement and is refused the same way.
function mergeActionResults(captures) {
  const fullSweepCommits = new Set(
    captures
      .filter((capture) => capture.kind === 'full' && capture.productCommit)
      .map((capture) => capture.productCommit)
  );
  const unconfirmed = captures.filter(
    (capture) =>
      capture.kind === 'focused' &&
      (!capture.productCommit || !fullSweepCommits.has(capture.productCommit))
  );
  if (unconfirmed.length) {
    const detail = unconfirmed
      .map((capture) => `${capture.source} (productCommit ${capture.productCommit ?? 'none'})`)
      .join('; ');
    throw new Error(
      `unconfirmed-focused-action: a focused capture may replace a label only when the same ` +
        `mode carries a full sweep at the same productCommit — the focused result must isolate ` +
        `a validated sweep, not substitute for one. Full sweeps here: ` +
        `${[...fullSweepCommits].join(', ') || 'none'}. Unconfirmed: ${detail}`
    );
  }
  // Same-commit is necessary, not sufficient: an isolation AGREES with the
  // sweep it isolates. A focused pass over a same-commit sweep failure is the
  // focused-green/canonical-red trap wearing a matching commit, and folding it
  // would publish exactly the green the guard above exists to refuse — the
  // disagreement is resolved by recapturing the full sweep, never by the
  // subset. A focused label the sweep never measured has no verdict to agree
  // with and is refused the same way.
  const sweepVerdicts = new Map();
  for (const capture of captures) {
    if (capture.kind !== 'full' || !capture.productCommit) continue;
    const labels = sweepVerdicts.get(capture.productCommit) ?? new Map();
    for (const result of capture.results) labels.set(result.label, result.passed);
    sweepVerdicts.set(capture.productCommit, labels);
  }
  for (const capture of captures) {
    if (capture.kind !== 'focused') continue;
    const labels = sweepVerdicts.get(capture.productCommit);
    for (const result of capture.results) {
      if (!labels.has(result.label)) {
        throw new Error(
          `unconfirmed-focused-action: ${capture.source} records "${result.label}", which the ` +
            `full sweep at ${capture.productCommit} never measured — a label without a sweep ` +
            `verdict has nothing to isolate`
        );
      }
      if (labels.get(result.label) !== result.passed) {
        throw new Error(
          `focused-contradicts-sweep: ${capture.source} records "${result.label}" as ` +
            `${result.passed ? 'passing' : 'failing'} while the full sweep at ` +
            `${capture.productCommit} recorded it ${result.passed ? 'failing' : 'passing'} — ` +
            `recapture the full sweep rather than folding the subset ` +
            `(docs/PROFILING-CAMPAIGNS.md, "A focused --actions subset is not the canonical sweep")`
        );
      }
    }
  }
  const byLabel = new Map();
  for (const capture of captures) {
    for (const result of capture.results) byLabel.set(result.label, result);
  }
  return [...byLabel.values()];
}

// The control's verdict is read off the results the section already carries, so a
// PRESERVED action section is judged the same way a freshly normalized one is —
// unlike a fidelity verdict, this needs no raw capture, only the row that is
// already published.
export function withActionControlScoreability(actions) {
  if (!actions || typeof actions !== 'object' || !Array.isArray(actions.results)) return actions;
  const control = actions.results.find((result) => ACTION_CONTROL_LABELS.has(result.label));
  // Fails CLOSED. Without a control that is present and explicitly passing, nothing
  // distinguishes product work from a sick host — which is the whole reason the
  // control exists — so an absent row, or one whose `passed` is anything other than
  // true, leaves the section unscoreable. An earlier revision defaulted a missing
  // control to scoreable on the grounds that it was not proven bad; that reasoning
  // makes the check optional, and a check a capture can skip is not a check.
  //
  // This costs nothing today: all 40 modes carrying actions in the matrix have a
  // control row with a boolean verdict.
  const scoreable = control?.passed === true;
  return {
    ...actions,
    controlLabel: control?.label ?? null,
    scoreable,
    controlEvidence: !control ? 'absent' : control.passed === true ? 'passed' : 'failed',
  };
}

function withActionReadinessSummary(actions) {
  if (!actions || typeof actions !== 'object' || !Array.isArray(actions.results)) return actions;
  const comparableResults = actions.results.filter(
    (result) => !ACTION_CONTROL_LABELS.has(result.label)
  );
  return {
    ...actions,
    worst: {
      ...actions.worst,
      readyP95: round(maximum(comparableResults.map((result) => result.ready?.p95))),
    },
  };
}

function countFinalProductCommitActions(results, finalProductCommit) {
  return results.filter(
    (result) =>
      !ACTION_CONTROL_LABELS.has(result.label) && result.productCommit === finalProductCommit
  ).length;
}

// A preserved action section carries the count computed for the report it came
// from. Re-derive it against this report's product commit so historical rows
// cannot claim current coverage.
function withFinalProductCommitActionCount(actions, finalProductCommit, preserved) {
  if (!preserved || !actions || typeof actions !== 'object' || !Array.isArray(actions.results)) {
    return actions;
  }
  return {
    ...actions,
    finalProductCommitActionCount: countFinalProductCommitActions(
      actions.results,
      finalProductCommit
    ),
  };
}

function normalizeActions(sources, finalProductCommit, sourceDirectory, mode, targetId) {
  if (!sources?.length) return null;
  const captures = sources.map((source) =>
    normalizeActionCapture(source, sourceDirectory, mode, targetId)
  );
  const results = mergeActionResults(captures);
  const fullSweep = captures.findLast((capture) => capture.kind === 'full');
  const comparableResults = results.filter((result) => !ACTION_CONTROL_LABELS.has(result.label));
  return {
    sources: captures.map(({ results: _results, ...capture }) => capture),
    fullSweepProductCommit: fullSweep?.productCommit ?? null,
    actionPlan: fullSweep?.actionPlan ?? null,
    finalProductCommitActionCount: countFinalProductCommitActions(results, finalProductCommit),
    actionCount: results.length,
    passedActionCount: results.filter((result) => result.passed).length,
    worst: {
      // A not-applicable first frame is a declared non-measurement, so it must
      // not feed the aggregate even though its near-zero value never wins it.
      firstFrameP95: round(
        maximum(
          comparableResults
            .filter((result) => result.firstFrame?.na !== true)
            .map((result) => result.firstFrame?.p95)
        )
      ),
      readyP95: round(maximum(comparableResults.map((result) => result.ready?.p95))),
      postActionFrameP95: round(
        maximum(comparableResults.map((result) => result.postActionFrames?.p95))
      ),
      postActionFrameMax: round(
        maximum(comparableResults.map((result) => result.postActionFrames?.max))
      ),
    },
    results,
  };
}

function normalizeMode(mode, target, finalProductCommit, sourceDirectory, preserved) {
  const normalizedMode = {
    ...mode,
    id: mode.id ?? modeKey(mode),
    orientation: String(mode.orientation).toUpperCase(),
    theme: String(mode.theme).toLowerCase(),
  };
  const shared = {
    id: normalizedMode.id,
    orientation: normalizedMode.orientation,
    theme: normalizedMode.theme,
    status: normalizedMode.status,
    fidelity: normalizedMode.fidelity ?? target.fidelity,
    ...(normalizedMode.actionsUnavailableReason
      ? { actionsUnavailableReason: normalizedMode.actionsUnavailableReason }
      : {}),
  };
  if (normalizedMode.status !== 'captured') {
    return { ...shared, reason: normalizedMode.reason };
  }
  const preservedSections = [];
  const untrackedSections = [];
  const resolveSection = (declared, section, compute) => {
    if (declared === PRESERVED) {
      preservedSections.push(section);
      return publishedSection(preserved, target.id, normalizedMode, section, PRESERVED);
    }
    if (declared === CAPTURED_UNTRACKED) {
      untrackedSections.push(section);
      return publishedSection(preserved, target.id, normalizedMode, section, CAPTURED_UNTRACKED);
    }
    return compute();
  };
  return {
    ...shared,
    drawingProductCommit: normalizedMode.drawingProductCommit,
    undoProductCommit: normalizedMode.undoProductCommit ?? normalizedMode.drawingProductCommit,
    // Applied only to a section that actually came from preserved evidence. A
    // freshly normalized one already carries a verdict re-derived under current
    // expectations, and blanking that would mark every cell in the matrix
    // unscoreable.
    drawing: withPreservedScoreability(
      resolveSection(normalizedMode.drawing, 'drawing', () =>
        normalizeDrawing(
          normalizedMode.drawing,
          normalizedMode.drawingProductCommit,
          sourceDirectory,
          normalizedMode,
          target.id
        )
      ),
      preservedSections.includes('drawing')
    ),
    undo: resolveSection(normalizedMode.undoSource, 'undo', () =>
      normalizeUndo(
        normalizedMode.undoSource,
        normalizedMode.undoProductCommit ?? normalizedMode.drawingProductCommit,
        sourceDirectory,
        normalizedMode
      )
    ),
    actions: withFinalProductCommitActionCount(
      withActionReadinessSummary(
        withActionControlScoreability(
          resolveSection(normalizedMode.actionSources, 'actions', () =>
            normalizeActions(
              normalizedMode.actionSources,
              finalProductCommit,
              sourceDirectory,
              normalizedMode,
              target.id
            )
          )
        )
      ),
      finalProductCommit,
      preservedSections.includes('actions')
    ),
    ...(preservedSections.length ? { preservedSections } : {}),
    ...(untrackedSections.length ? { untrackedSections } : {}),
  };
}

function modeKey(mode) {
  return `${String(mode.orientation).toLowerCase()}-${String(mode.theme).toLowerCase()}`;
}

function normalizeCandidateActions(candidateActions) {
  if (candidateActions === undefined) return [];
  if (!Array.isArray(candidateActions)) {
    throw new Error('Performance matrix manifest candidateActions must be an array');
  }
  return candidateActions.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`Performance matrix candidateActions[${index}] must be an object`);
    }
    for (const field of ['priority', 'action', 'rationale']) {
      if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
        throw new Error(`Performance matrix candidateActions[${index}].${field} must be text`);
      }
    }
    for (const field of ['applicability', 'status']) {
      if (
        candidate[field] !== undefined &&
        (typeof candidate[field] !== 'string' || !candidate[field].trim())
      ) {
        throw new Error(`Performance matrix candidateActions[${index}].${field} must be text`);
      }
    }
    return {
      priority: candidate.priority,
      action: candidate.action,
      rationale: candidate.rationale,
      ...(candidate.applicability === undefined ? {} : { applicability: candidate.applicability }),
      ...(candidate.status === undefined ? {} : { status: candidate.status }),
    };
  });
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 3) {
    const found = manifest.schemaVersion ?? 'missing';
    const migration =
      found === 2 ? ' Move each target’s capture fields into four targets[].modes entries.' : '';
    throw new Error(
      `Performance matrix manifest schemaVersion ${found} is unsupported; expected 3.${migration}`
    );
  }
  if (!Array.isArray(manifest.targets)) {
    throw new Error('Performance matrix manifest targets must be an array');
  }
  const targetIds = new Set();
  for (const target of manifest.targets) {
    if (targetIds.has(target.id)) throw new Error(`Duplicate performance target id: ${target.id}`);
    targetIds.add(target.id);
    if (!Array.isArray(target.modes)) {
      throw new Error(`Target ${target.id} must contain four explicit modes`);
    }
    const keys = target.modes.map(modeKey);
    const unknown = keys.filter((key) => !MODE_KEYS.includes(key));
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    const missing = MODE_KEYS.filter((key) => !keys.includes(key));
    if (unknown.length || duplicate || missing.length || keys.length !== MODE_KEYS.length) {
      const details = [
        unknown.length ? `unknown: ${unknown.join(', ')}` : null,
        duplicate ? `duplicate: ${duplicate}` : null,
        missing.length ? `missing: ${missing.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('; ');
      throw new Error(
        `Target ${target.id} must contain exactly four explicit modes${details ? ` (${details})` : ''}`
      );
    }
    for (const mode of target.modes) {
      const id = mode.id ?? modeKey(mode);
      if (mode.id && mode.id !== modeKey(mode)) {
        throw new Error(`Target ${target.id} mode ${mode.id} does not match ${modeKey(mode)}`);
      }
      if (!['captured', 'unavailable'].includes(mode.status)) {
        throw new Error(`Target ${target.id} mode ${id} has invalid status ${mode.status}`);
      }
      if (mode.status === 'unavailable' && !mode.reason) {
        throw new Error(`Target ${target.id} mode ${id} must record an unavailable reason`);
      }
    }
  }
}

function normalizeTarget(target, finalProductCommit, sourceDirectory, preserved) {
  return {
    id: target.id,
    number: target.number,
    label: target.label,
    platform: target.platform,
    deviceKind: target.deviceKind,
    runtime: target.runtime,
    environment: target.environment,
    fidelity: target.fidelity,
    modes: target.modes.map((mode) =>
      normalizeMode(mode, target, finalProductCommit, sourceDirectory, preserved)
    ),
  };
}

function matrixActionLabels(targets) {
  return [
    ...new Set(
      targets.flatMap((target) =>
        target.modes.flatMap((mode) => [
          ...(mode.actions?.results.map(({ label }) => label) ?? []),
          ...(mode.actions?.actionPlan?.applicableLabels ?? []),
          ...(mode.actions?.actionPlan?.notApplicable.map(({ label }) => label) ?? []),
        ])
      )
    ),
  ].filter((label) => !ACTION_CONTROL_LABELS.has(label));
}

function actionCoordinates(mode, labels) {
  const results = new Set(mode.actions?.results.map(({ label }) => label) ?? []);
  const applicable = mode.actions?.actionPlan
    ? new Set(mode.actions.actionPlan.applicableLabels)
    : null;
  return labels.map((label) => {
    if (results.has(label)) {
      return mode.actions.scoreable === false
        ? {
            label,
            state: 'no-control',
            reason: `idle frame control ${mode.actions.controlEvidence ?? 'absent'}`,
          }
        : { label, state: 'measured' };
    }
    if (applicable && !applicable.has(label)) {
      return {
        label,
        state: 'not-applicable',
        reason: actionNotApplicableReason(label, mode.actions.actionPlan),
      };
    }
    const reason =
      mode.status !== 'captured'
        ? `target mode unavailable: ${mode.reason}`
        : mode.actionsUnavailableReason
          ? `action capture unavailable: ${mode.actionsUnavailableReason}`
          : applicable
            ? 'applicable action has no valid measurement'
            : 'capture predates explicit action applicability';
    return { label, state: 'missing', reason };
  });
}

function withActionCoordinates(matrix) {
  const actionLabels = matrixActionLabels(matrix.targets);
  return {
    ...matrix,
    actionLabels,
    targets: matrix.targets.map((target) => ({
      ...target,
      modes: target.modes.map((mode) => ({
        ...mode,
        actionCoordinates: actionCoordinates(mode, actionLabels),
      })),
    })),
  };
}

function normalizeMatrix(manifest, sourceDirectory = ROOT) {
  validateManifest(manifest);
  const resolvedSourceDirectory = resolve(sourceDirectory, manifest.sourceRoot ?? '.');
  const preserved = loadPreservedEvidence(manifest, sourceDirectory);
  return withActionCoordinates({
    schemaVersion: 3,
    recordedOn: manifest.recordedOn,
    productCommit: manifest.productCommit,
    snapshotKind: manifest.snapshotKind,
    architecture: manifest.architecture,
    limitations: manifest.limitations ?? [],
    preservedEvidence: preserved ? { from: preserved.from, reason: preserved.reason } : null,
    candidateActions: normalizeCandidateActions(manifest.candidateActions),
    gates: {
      drawing: {
        paintP95Ms: PAINT_P95_GATE_MS,
        paintP99Ms: PAINT_P99_GATE_MS,
        paintMaxMs: PAINT_MAX_GATE_MS,
        lostFrameTimeShare: LOST_FRAME_TIME_SHARE_GATE,
        lostFrameTimeShareExceptions: LOST_FRAME_TIME_SHARE_EXCEPTIONS,
      },
      undo: {
        engineP95Ms: UNDO_ENGINE_P95_GATE_MS,
        nextFrameP95Ms: UNDO_NEXT_FRAME_P95_GATE_MS,
        nextFrameMaxMs: UNDO_NEXT_FRAME_MAX_GATE_MS,
      },
      actions: {
        firstFrameP95Ms: ACTION_FIRST_FRAME_GATE_MS,
        postActionFrameP95Ms: ACTION_FRAME_P95_GATE_MS,
        postActionFrameMaxMs: ACTION_FRAME_MAX_GATE_MS,
        postActionFrameMaxConfirmingSamples: MAX_BREACH_CONFIRMING_SAMPLES,
        // The per-action allowance ledgers, one per target that carries one,
        // rendered beside the gates for the same reason the lost-frame
        // exceptions are (ADR-0137, ADR-0160, ADR-0162).
        postActionAllowances: Object.entries(ACTION_GATE_ALLOWANCE_LEDGERS).map(
          ([target, { adrs, entries }]) => ({ target, adrs, ...entries })
        ),
      },
    },
    targets: manifest.targets.map((target) =>
      normalizeTarget(target, manifest.productCommit, resolvedSourceDirectory, preserved)
    ),
  });
}

// Preservation is a provenance claim about the evidence, so the report states it
// rather than leaving a copied-forward cell looking freshly captured.
function preservedEvidenceNotes(matrix) {
  if (!matrix.preservedEvidence) return [];
  const preservedCells = matrix.targets.flatMap((target) =>
    target.modes
      .filter((mode) => mode.preservedSections?.length)
      .map((mode) => `${target.label} · ${mode.id} (${mode.preservedSections.join(', ')})`)
  );
  const untrackedCells = matrix.targets.flatMap((target) =>
    target.modes
      .filter((mode) => mode.untrackedSections?.length)
      .map((mode) => `${target.label} · ${mode.id} (${mode.untrackedSections.join(', ')})`)
  );
  const notes = [];
  if (preservedCells.length) {
    notes.push(
      `${preservedCells.length} cell${preservedCells.length === 1 ? '' : 's'} carry historical results preserved from ${matrix.preservedEvidence.from} rather than re-read raw captures: ${matrix.preservedEvidence.reason} Preserved cells: ${preservedCells.join('; ')}.`
    );
  }
  if (untrackedCells.length) {
    notes.push(
      `${untrackedCells.length} cell${untrackedCells.length === 1 ? '' : 's'} were captured for this campaign but their per-mode raw inputs remain untracked under ADR-0138; regeneration carries their normalized sections from ${matrix.preservedEvidence.from}, while check:matrix-staleness still verifies their capture commits. Representative whole captures remain tracked under perf-profiles/evidence/. Untracked-source cells: ${untrackedCells.join('; ')}.`
    );
  }
  return notes;
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 ? 1 : 0) : '—';
}

function fmtPercent(value) {
  return Number.isFinite(value) ? `${fmt(value * 100)}%` : '—';
}

function displayMode(mode) {
  const orientation = `${mode.orientation[0]}${mode.orientation.slice(1).toLowerCase()}`;
  const theme = `${mode.theme[0].toUpperCase()}${mode.theme.slice(1)}`;
  return `${orientation} · ${theme}`;
}

function modeRows(matrix) {
  return matrix.targets.flatMap((target) =>
    target.modes.map((mode, modeIndex) => ({
      ...mode,
      targetId: target.id,
      targetNumber: target.number,
      targetLabel: target.label,
      platform: target.platform,
      deviceKind: target.deviceKind,
      runtime: target.runtime,
      environment: target.environment,
      modeLabel: displayMode(mode),
      firstTargetMode: modeIndex === 0,
    }))
  );
}

function rowLabel(row) {
  return `${row.targetLabel} · ${row.modeLabel}`;
}

// Only a release-gate row needs the calibration distinction: its section
// already names the role, and the chip says whether the row enforces the drawing
// gates today or is a gate-in-waiting (ADR-0156 decision 1).
function calibrationChip(target) {
  if (targetRole(target) !== RELEASE_GATE) return '';
  const calibrated = target.fidelity === GATE_FIDELITY;
  const title = calibrated
    ? 'Calibrated drawing instrument: this row enforces the drawing gates today.'
    : 'Gate-in-waiting: its drawing instrument is uncalibrated on some input-fidelity checks (ADR-0139), so a cell it cannot score counts as red (ADR-0156).';
  return `<span class="matrix-chip ${calibrated ? 'trusted' : 'waiting'}" title="${esc(title)}">${calibrated ? 'Calibrated' : 'Gate-in-waiting'}</span>`;
}

function roleHead(section, targets, tag) {
  const modes = targets.reduce((sum, target) => sum + target.modes.length, 0);
  const count = `${targets.length} target${targets.length === 1 ? '' : 's'} · ${modes} mode${modes === 1 ? '' : 's'}`;
  return `<${tag} class="role-head"><span class="role-title"><b>${esc(section.title)}</b><span class="role-count">${count}</span></span><span class="role-rule">${esc(section.rule)}</span></${tag}>`;
}

// The release gate renders open and first; every other role folds into a
// closed <details> whose summary still states the role's rule, so collapsing a
// section never hides what its red means. Native disclosure keeps the page
// readable without the script and opens for print with the notes.
function roleSections(matrix, renderTarget) {
  return ROLE_SECTIONS.map((section) => {
    const targets = targetsInRole(matrix, section.role);
    if (!targets.length) return '';
    const rows = targets.map(renderTarget).join('');
    const attrs = `class="role ${section.role === RELEASE_GATE ? 'role-primary' : 'role-fold'}" data-role="${section.role}"`;
    return section.role === RELEASE_GATE
      ? `<div ${attrs}>${roleHead(section, targets, 'div')}${rows}</div>`
      : `<details ${attrs}>${roleHead(section, targets, 'summary')}${rows}</details>`;
  }).join('');
}

// Preserved rows carry results from an earlier campaign (ADR-0138); without a
// visible mark they read as current alongside the freshly captured rows.
function targetIsPreserved(target) {
  return target.modes.some((mode) => mode.preservedSections?.length);
}

function earlierCaptureChip(target) {
  if (!targetIsPreserved(target)) return '';
  const title =
    'Results preserved from an earlier campaign — Commit provenance lists the source commits.';
  return `<a class="matrix-chip earlier" href="#provenance" title="${esc(title)}">Earlier capture</a>`;
}

// The JS tooltip consumes the title attribute, so every cell also carries the
// same text as a persistent aria-label — otherwise the first hover strips the
// cell's accessible name.
function tipCell(classes, text, tooltip, data = '') {
  return `<span class="${classes}" tabindex="0"${data ? ` ${data}` : ''} title="${esc(tooltip)}" aria-label="${esc(tooltip)}">${text}</span>`;
}

function modeFilterAttrs(target, mode) {
  return `data-target="${esc(target.id)}" data-orientation="${mode.orientation.toLowerCase()}" data-theme="${esc(mode.theme)}"`;
}

function cellLabel(target, mode) {
  return `${target.label} · ${displayMode(mode)}`;
}

const DRAWING_METRIC_KEYS = ['p95', 'p99', 'max'];

// Every paint metric rides the cell as data attributes so the metric switcher can
// swap the displayed number and heat color client-side without re-rendering.
const GATE_RED_NOTE = 'counts as red on a release-gate row (ADR-0156)';

// ADR-0156 decision 1: on a release-gate row, a cell left unscoreable only by
// checks its instrument has no calibrated expectation for counts as red, not as
// absent. Every other reason a cell is unscoreable — a real fidelity failure, an
// off-regime beat, preserved evidence — asks for a recapture instead, so it
// keeps the neutral hatch.
function countsAsGateRed(role, entry) {
  const aggregate = entry?.aggregate;
  if (role !== RELEASE_GATE || aggregate?.scoreable !== false) return false;
  if (aggregate.unscoreableReason || aggregate.offRefreshRegime) return false;
  const unscoreableRuns = (entry.runs ?? []).filter((run) => run.scoreable === false);
  return (
    unscoreableRuns.length > 0 &&
    unscoreableRuns.every((run) => onlyUncalibratedChecksFailed(run.fidelity))
  );
}

function drawingOverviewCell(target, label, brush, entry, gates) {
  const aggregate = entry.aggregate;
  const brushLabel = BRUSH_LABELS[brush];
  if (!drawingAggregateAvailable(aggregate)) {
    return tipCell('mx-cell num missing', '—', `${label} · ${brushLabel} · not measured`);
  }
  // An unscoreable cell is neither pass nor fail, so it must not carry the
  // product-failure styling; the tooltip says why instead.
  const unscoreable = aggregate.scoreable === false;
  const gateRed = countsAsGateRed(targetRole(target), entry);
  const failed = gateRed || (!unscoreable && aggregate.blankPassed === false);
  const metricGates = { p95: gates.paintP95Ms, p99: gates.paintP99Ms, max: gates.paintMaxMs };
  const metricData = DRAWING_METRIC_KEYS.map(
    (key) =>
      `data-${key}="${fmt(aggregate.paint[key])}" data-${key}h="${heatClass(aggregate.paint[key] / metricGates[key])}"`
  ).join(' ');
  const lostData = `data-lost="${fmtPercent(aggregate.lostFrameTimeShare)}" data-losth="${heatClass(aggregate.lostFrameTimeShare / entry.gateShare)}"`;
  const published = aggregate.publishedFidelityChecks?.length
    ? ` · published verdict failed ${aggregate.publishedFidelityChecks.join(', ')}`
    : '';
  const why = unscoreable
    ? ` · unscoreable: ${unscoreableReasons(aggregate).join(', ')}${published}${gateRed ? ` · ${GATE_RED_NOTE}` : ''}`
    : ` · ${aggregate.blankPassed ? 'PASS' : 'FAIL'}`;
  const title = `${label} · ${brushLabel} · paint P95 ${fmt(aggregate.paint.p95)} / P99 ${fmt(aggregate.paint.p99)} / max ${fmt(aggregate.paint.max)} ms · lost frame time ${fmtPercent(aggregate.lostFrameTimeShare)} (budget ${fmtPercent(entry.gateShare)})${captureBasis(aggregate)}${why}`;
  const heat = unscoreable ? 'unscoreable' : heatClass(aggregate.paint.p95 / metricGates.p95);
  return tipCell(
    `mx-cell num ${heat}${failed ? ' failed' : ''}`,
    fmt(aggregate.paint.p95),
    title,
    `${metricData} ${lostData}`
  );
}

function undoOverviewCell(label, mode, gates) {
  if (!mode.undo) {
    return tipCell('mx-cell missing', '—', `${label} · undo not measured`);
  }
  const undo = mode.undo;
  const title = `${label} · ${undo.count} undos · engine P95 ${fmt(undo.engine.p95)} ms (gate ${gates.engineP95Ms} ms) · next-frame P95 ${fmt(undo.nextFrame.p95)} ms (gate ${gates.nextFrameP95Ms} ms) · next-frame max ${fmt(undo.nextFrame.max)} ms (gate ${gates.nextFrameMaxMs} ms) · ${undo.passed ? 'PASS' : 'FAIL'}`;
  return tipCell(
    `mx-cell mark ${undo.passed ? 'pass' : 'hot failed'}`,
    undo.passed ? '✓' : '✕',
    title
  );
}

// Read the share as "worth a look" versus "broadly failing" — a legibility split
// for the overview color only, never a gate. A fixed count over-alarmed: 3
// failures out of 48 rendered as red as 14 out of 34.
const OVERVIEW_ACTIONS_WARN_SHARE = 0.1;

function actionsOverviewCell(label, mode) {
  if (!mode.actions) {
    const reason = mode.actionsUnavailableReason
      ? `action capture unavailable: ${mode.actionsUnavailableReason}`
      : 'actions not measured';
    return tipCell('mx-cell missing', '—', `${label} · ${reason}`);
  }
  const comparable = comparableActionResults(mode.actions);
  const passing = comparable.filter((result) => result.passed).length;
  const score = `${passing}/${comparable.length}`;
  if (mode.actions.scoreable === false) {
    // Printing the passing count here would invite a verdict the evidence
    // cannot support, so the cell says what happened instead.
    const title = `${label} · unscored: this mode’s idle frame control is ${mode.actions.controlEvidence ?? 'absent'}, so no action score is attributable to the product (measured ${score} for reference)`;
    return tipCell('mx-cell num unscoreable', 'no control', title);
  }
  const failedLabels = comparable.filter((result) => !result.passed).map((result) => result.label);
  const heat =
    failedLabels.length === 0
      ? 'pass'
      : failedLabels.length / comparable.length <= OVERVIEW_ACTIONS_WARN_SHARE
        ? 'warn'
        : 'hot';
  const title = `${label} · ${score} actions passing${failedLabels.length ? ` · failing: ${failedLabels.join('; ')}` : ''}`;
  return tipCell(`mx-cell num ${heat}`, score, title);
}

const OVERVIEW_COLUMNS = ['Pen', 'Crayon', 'Magic', 'Eraser', 'Undo', 'Actions'];

function overviewMatrix(matrix) {
  // Two sticky header rows: the group row names the drawing metric currently
  // shown (the switcher scrolls away; this label must not), the column row
  // names the cells. `mx-metric-label` is the element the switcher updates.
  const head = `<div class="mx-head">
    <div class="mx-row mx-groups"><div></div><span class="mx-group" id="mx-metric-label">Paint P95 · ms · gate ${matrix.gates.drawing.paintP95Ms} ms</span><span class="mx-group-note">verdict</span><span class="mx-group-note">passed</span></div>
    <div class="mx-row mx-cols"><div class="mx-label">Mode</div>${OVERVIEW_COLUMNS.map((name) => `<span class="mx-col">${name}</span>`).join('')}</div>
  </div>`;
  const body = roleSections(matrix, (target) => {
    const header = `<div class="mx-row mx-target" data-target-header="${esc(target.id)}"><div class="mx-target-label"><b>${target.number}. ${esc(target.label)}</b>${calibrationChip(target)}${earlierCaptureChip(target)}<small>${esc(target.environment)}</small></div></div>`;
    const rows = target.modes
      .map((mode) => {
        const attrs = modeFilterAttrs(target, mode);
        if (mode.status !== 'captured') {
          return `<div class="mx-row" ${attrs}><div class="mx-label">${esc(displayMode(mode))}</div><div class="mx-span">unavailable: ${esc(mode.reason)}</div></div>`;
        }
        const label = cellLabel(target, mode);
        const cells = BRUSHES.map((brush) =>
          drawingOverviewCell(target, label, brush, mode.drawing[brush], matrix.gates.drawing)
        ).join('');
        return `<div class="mx-row" ${attrs}><div class="mx-label">${esc(displayMode(mode))}</div>${cells}${undoOverviewCell(label, mode, matrix.gates.undo)}${actionsOverviewCell(label, mode)}</div>`;
      })
      .join('');
    return header + rows;
  });
  return `<div class="mx">${head}${body}</div>`;
}

function actionRatio(result, gates) {
  return maximum(
    [
      [result.firstFrame.na === true ? null : result.firstFrame.p95, gates.firstFrameP95Ms],
      [result.postActionFrames.p95, result.gateAllowance?.p95Ms ?? gates.postActionFrameP95Ms],
      [result.postActionFrames.max, result.gateAllowance?.maxMs ?? gates.postActionFrameMaxMs],
    ]
      .filter(([value]) => Number.isFinite(value))
      .map(([value, gate]) => value / gate)
  );
}

// Names the recorded allowance a passing cell was scored under and the ADRs
// that grant its target's ledger, so the tooltip never presents an allowed
// 27 ms P95 as a base-gate pass.
function allowanceVerdictSuffix(result, ledger) {
  const allowance = result.gateAllowance;
  if (!allowance) return '';
  const parts = [];
  if (Number.isFinite(allowance.p95Ms)) parts.push(`post P95 ≤ ${fmt(allowance.p95Ms)} ms`);
  if (Number.isFinite(allowance.maxMs)) parts.push(`post max ≤ ${fmt(allowance.maxMs)} ms`);
  const adrs = ledger?.adrs ?? [];
  const granted = adrs.length ? `; ${adrs.join(', ')}` : '';
  return ` under a recorded allowance (${parts.join(', ')}${granted})`;
}

// A report rendered from a hand-built matrix (the tests') may carry no ledger
// list at all; a target absent from the list has no ledger.
function allowanceLedgerFor(gates, targetId) {
  return (gates.postActionAllowances ?? []).find((ledger) => ledger.target === targetId) ?? null;
}

function firstFrameP95Text(result) {
  return result.firstFrame.na === true ? 'N/A' : `${fmt(result.firstFrame.p95)} ms`;
}

function heatClass(ratio) {
  if (!Number.isFinite(ratio)) return 'missing';
  if (ratio <= 0.75) return 'cool';
  if (ratio <= 1) return 'pass';
  if (ratio <= 1.5) return 'warn';
  return 'hot';
}

function comparableActionResults(actions) {
  return actions.results.filter((result) => !ACTION_CONTROL_LABELS.has(result.label));
}

function comparableActionLabels(targets) {
  return [
    ...new Set(
      targets.flatMap((target) =>
        target.actions ? comparableActionResults(target.actions).map(({ label }) => label) : []
      )
    ),
  ];
}

function actionModeCells(mode, label, labels, gates, targetId) {
  const ledger = allowanceLedgerFor(gates, targetId);
  const resultsByLabel = new Map(
    (mode.actions ? comparableActionResults(mode.actions) : []).map((result) => [
      result.label,
      result,
    ])
  );
  const coordinatesByLabel = new Map(
    (mode.actionCoordinates ?? actionCoordinates(mode, labels)).map((coordinate) => [
      coordinate.label,
      coordinate,
    ])
  );
  // A mode whose idle control failed cannot attribute any action score to the
  // product, so its cells are marked rather than coloured by ratio — the same
  // treatment a fidelity-failed drawing cell gets, for the same reason.
  const attributable = mode.actions?.scoreable !== false;
  return labels
    .map((actionLabel, index) => {
      const result = resultsByLabel.get(actionLabel);
      if (!result) {
        const coordinate = coordinatesByLabel.get(actionLabel);
        const notApplicable = coordinate?.state === 'not-applicable';
        const state = notApplicable ? 'N/A' : 'missing';
        const tooltip = `${index + 1}. ${actionLabel} · ${label} · ${state}: ${coordinate?.reason ?? 'no normalized coordinate'}`;
        const cellClass = notApplicable ? 'not-applicable' : 'missing';
        return `<span class="heat-cell ${cellClass}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
      }
      const ratio = actionRatio(result, gates);
      const provenance = result.productCommit ? ` · measured at ${result.productCommit}` : '';
      const unconfirmed = result.passed && result.postActionFrames.maxUnconfirmed === true;
      const verdict = attributable
        ? result.passed
          ? unconfirmed
            ? `PASS, max unconfirmed (over the gate in one scored repeat, not the two ADR-0156 requires)${allowanceVerdictSuffix(result, ledger)}`
            : `PASS${allowanceVerdictSuffix(result, ledger)}`
          : `FAIL${allowanceVerdictSuffix(result, ledger)}`
        : `unscoreable: this mode\u2019s idle frame control is ${mode.actions?.controlEvidence ?? 'absent'}`;
      const tooltip = `${index + 1}. ${result.label} · ${label} · first P95 ${firstFrameP95Text(result)} · ready P95 ${fmt(result.ready?.p95)} ms · post P95 ${fmt(result.postActionFrames.p95)} ms · post max ${fmt(result.postActionFrames.max)} ms · ${verdict}${provenance}`;
      const cellClass = !attributable
        ? 'unscoreable'
        : unconfirmed
          ? 'unconfirmed'
          : heatClass(ratio);
      return `<span class="heat-cell ${cellClass}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}"></span>`;
    })
    .join('');
}

function actionHeatmap(matrix) {
  const labels = matrix.actionLabels ?? comparableActionLabels(modeRows(matrix));
  const columns = labels
    .map(
      (label, index) =>
        `<span class="action-number" title="${esc(label)}" aria-label="Action ${index + 1}: ${esc(label)}">${index + 1}</span>`
    )
    .join('');
  const body = roleSections(matrix, (target) => {
    const earlier = targetIsPreserved(target)
      ? ' <small class="heat-earlier">earlier capture</small>'
      : '';
    const header = `<div class="heat-row target" data-target-header="${esc(target.id)}"><div class="heat-label"><b>${target.number}. ${esc(target.label)}${earlier}</b></div></div>`;
    const rows = target.modes
      .map((mode) => {
        const attrs = modeFilterAttrs(target, mode);
        if (mode.status !== 'captured') {
          return `<div class="heat-row" ${attrs}><div class="heat-label"><span>${esc(displayMode(mode))}</span></div><div class="heat-note">unavailable: ${esc(mode.reason)}</div></div>`;
        }
        const cells = actionModeCells(
          mode,
          cellLabel(target, mode),
          labels,
          matrix.gates.actions,
          target.id
        );
        const comparableResults = mode.actions ? comparableActionResults(mode.actions) : [];
        const passingCount = comparableResults.filter((result) => result.passed).length;
        const score = !mode.actions
          ? '—'
          : mode.actions.scoreable !== false
            ? `${passingCount}/${comparableResults.length}`
            : 'no control';
        return `<div class="heat-row" ${attrs}><div class="heat-label"><span>${esc(displayMode(mode))}</span><b>${score}</b></div><div class="heat-cells">${cells}</div></div>`;
      })
      .join('');
    return header + rows;
  });
  const legend = labels
    .map((label, index) => `<li><b>${index + 1}</b><span>${esc(label)}</span></li>`)
    .join('');
  return `<div class="heat-scroll" style="--action-columns:${labels.length}">
    <div class="heat-inner">
    <div class="heat-row header"><div class="heat-label">Mode <small>passing</small></div><div class="heat-cells">${columns}</div></div>
    ${body}
    </div>
  </div>
  <details class="action-key"><summary>Action-number key</summary><ol>${legend}</ol></details>`;
}

function rankedActionFailures(matrix) {
  // A mode whose control failed is left out entirely rather than counted as a
  // failing mode. Counting it is how "the worst cases cluster on the Android
  // emulator" became a reading of the product rather than of the emulator.
  const captured = modeRows(matrix).filter(
    (target) => target.actions && target.actions.scoreable !== false
  );
  const labels = comparableActionLabels(captured);
  const ranked = labels
    .map((label) => {
      const entries = captured.flatMap((target) => {
        const result = comparableActionResults(target.actions).find(
          (candidate) => candidate.label === label
        );
        return result ? [{ target, result }] : [];
      });
      return {
        label,
        failed: entries.filter((entry) => !entry.result.passed).length,
        measured: entries.length,
        worstRatio: maximum(
          entries.map((entry) => actionRatio(entry.result, matrix.gates.actions))
        ),
      };
    })
    .filter((entry) => entry.failed)
    .sort((a, b) => b.failed - a.failed || b.worstRatio - a.worstRatio)
    .slice(0, 10);
  return ranked
    .map(
      (entry, index) =>
        `<li><span class="rank">${index + 1}</span><span><b>${esc(entry.label)}</b><small>${entry.failed} of ${entry.measured} modes failed · worst ${fmt(entry.worstRatio)}× gate</small></span></li>`
    )
    .join('');
}

function undoTable(matrix) {
  return modeRows({ ...matrix, targets: targetsInRoleOrder(matrix) })
    .map((target) => {
      if (target.status !== 'captured') {
        return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td colspan="4" class="muted">Unavailable: ${esc(target.reason)}</td></tr>`;
      }
      if (!target.undo) {
        return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td colspan="4" class="muted">No engine/next-frame probe</td></tr>`;
      }
      return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td>${fmt(target.undo.engine.p95)}</td><td>${fmt(target.undo.nextFrame.p95)}</td><td>${fmt(target.undo.nextFrame.max)}</td><td><span class="verdict ${target.undo.passed ? 'pass' : 'fail'}">${target.undo.passed ? 'Pass' : 'Fail'}</span></td></tr>`;
    })
    .join('');
}

// A full 40-character SHA repeated 44 times is noise; the leading 12 characters
// identify the commit and the full value stays one hover (and data.json) away.
const DISPLAY_COMMIT_CHARS = 12;

function commitCode(sha) {
  if (typeof sha !== 'string' || !sha.trim()) return '—';
  const short = sha.length > DISPLAY_COMMIT_CHARS ? `${sha.slice(0, DISPLAY_COMMIT_CHARS)}…` : sha;
  return `<code title="${esc(sha)}">${esc(short)}</code>`;
}

function provenanceTable(matrix) {
  return modeRows({ ...matrix, targets: targetsInRoleOrder(matrix) })
    .map((target) => {
      if (target.status !== 'captured') {
        return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td colspan="4" class="muted">Unavailable: ${esc(target.reason)}</td></tr>`;
      }
      const actionCommits = target.actions
        ? [...new Set(target.actions.sources.map((source) => source.productCommit))]
            .map((commit) => commitCode(commit))
            .join(', ')
        : '—';
      const actionCoverage = target.actions
        ? `${target.actions.finalProductCommitActionCount}/${comparableActionResults(target.actions).length}`
        : '—';
      return `<tr class="${target.firstTargetMode ? 'target-break' : ''}"><th>${esc(rowLabel(target))}</th><td>${commitCode(target.drawingProductCommit)}</td><td>${commitCode(target.undoProductCommit)}</td><td>${actionCoverage}</td><td>${actionCommits}</td></tr>`;
    })
    .join('');
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function markdownTable(headers, rows) {
  const header = `| ${headers.map(markdownCell).join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  return [header, rule, ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)].join(
    '\n'
  );
}

function markdownStatus(passed) {
  return passed ? 'Pass' : '**FAIL**';
}

// Issue 1290: a matrix cell is however many captures its manifest lists — one,
// today, for every cell — and a gate verdict from a single capture is one draw
// from that cell's run-to-run spread. The issue's own spread figures were
// retracted twice (host load, then cross-run contamination), so no figure is
// published here; what survives is the structural statement, carried by the
// Drawing prose, `runCount` in data.json, and the per-cell capture basis in the
// plot tooltips. Verdict computation is untouched. A preserved cell's runCount
// is inherited from an earlier published report rather than read from evidence
// this run, so no basis is asserted for it.
function captureBasis(aggregate) {
  if (aggregate.unscoreableReason) return '';
  if (!Number.isFinite(aggregate.runCount) || aggregate.runCount < 1) return '';
  return ` · ${aggregate.runCount} capture${aggregate.runCount === 1 ? '' : 's'}`;
}

function drawingAggregateAvailable(aggregate) {
  return (
    aggregate.runCount > 0 ||
    ['p95', 'p99', 'max'].some((metric) => Number.isFinite(aggregate.paint[metric]))
  );
}

function renderCandidateActionsMarkdown(candidateActions) {
  if (!candidateActions.length) return '';
  const rows = candidateActions.map((candidate) => [
    candidate.priority,
    candidate.action,
    candidate.rationale,
    candidate.applicability ?? '—',
    candidate.status ?? '—',
  ]);
  return `
## Candidate actions

${markdownTable(['Priority', 'Action', 'Rationale', 'Applicability', 'Status'], rows)}
`;
}

// Every cell held to something other than the single lost-frame gate, so a
// reader never has to infer an exemption from a passing number.
function renderLostFrameExceptionsMarkdown(exceptions) {
  const entries = Object.entries(exceptions);
  if (entries.length === 0) return '';
  const lines = entries.map(([cell, { share, reason }]) => {
    const [targetId, brush] = cell.split(':');
    return `- **${BRUSH_LABELS[brush] ?? brush} on \`${targetId}\`** — ${fmtPercent(share)}. ${reason}`;
  });
  return `Cells held to a different lost-frame budget, and why (ADR-0137):\n\n${lines.join('\n')}\n`;
}

// Every action held to a measured allowance instead of the base post-action
// gates, per target that carries a ledger. Rendered so a passing cell under
// an allowance is never read as a base-gate pass (ADR-0160).
function actionAllowanceEntries(ledger) {
  if (!ledger) return [];
  return [
    ['p95', 'post-action P95'],
    ['max', 'post-action max'],
  ].flatMap(([statistic, name]) =>
    Object.entries(ledger[statistic] ?? {}).map(([label, { ms, basis }]) => ({
      label,
      statistic: name,
      ms,
      basis,
    }))
  );
}

function renderActionAllowancesMarkdown(ledgers) {
  return (ledgers ?? [])
    .map((ledger) => {
      const entries = actionAllowanceEntries(ledger);
      if (entries.length === 0) return '';
      const lines = entries.map(
        ({ label, statistic, ms, basis }) =>
          `- **${label}** — ${statistic} ≤ ${fmt(ms)} ms. ${basis}`
      );
      return `Actions on \`${ledger.target}\` held to a measured allowance instead of the base post-action gates, and why (${ledger.adrs.join(', ')}); every target without a ledger scores them at the base gates:\n\n${lines.join('\n')}\n`;
    })
    .filter(Boolean)
    .join('\n');
}

function renderMarkdown(matrix) {
  const rows = modeRows({ ...matrix, targets: targetsInRoleOrder(matrix) });
  const drawingRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, ...BRUSHES.map(() => `Unavailable: ${target.reason}`)];
    }
    return [
      label,
      ...BRUSHES.map((brush) => {
        const aggregate = target.drawing[brush].aggregate;
        if (!drawingAggregateAvailable(aggregate)) return 'Unavailable: not measured';
        const value = `${fmt(aggregate.paint.p95)} / ${fmt(aggregate.paint.p99)} / ${fmt(aggregate.paint.max)} · L${fmtPercent(aggregate.lostFrameTimeShare)}`;
        // Unscoreable is neither Pass nor FAIL. Every sample behind this cell
        // failed its input-fidelity gate, so the number describes an input path
        // the runner rejects; the failed check is named so the reader can see
        // which one rather than inferring it from a target-level advisory label.
        if (aggregate.scoreable === false) {
          const reasons = unscoreableReasons(aggregate).join(', ');
          const role = targetRole({ id: target.targetId, deviceKind: target.deviceKind });
          return countsAsGateRed(role, target.drawing[brush])
            ? `**unscoreable (${reasons}), ${GATE_RED_NOTE}**: ${value}`
            : `_unscoreable (${reasons})_: ${value}`;
        }
        return aggregate.blankPassed ? value : `**FAIL ${value}**`;
      }),
    ];
  });
  const undoRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, '—', `Unavailable: ${target.reason}`, '—'];
    }
    return [
      label,
      target.undo
        ? `${fmt(target.undo.engine.p95)} / ${fmt(target.undo.nextFrame.p95)} / ${fmt(target.undo.nextFrame.max)}`
        : '—',
      target.undo ? markdownStatus(target.undo.passed) : 'Not measured',
      target.undo ? target.undo.productCommit : '—',
    ];
  });
  const actionRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, '—', '—', '—', '—', '—', `Unavailable: ${target.reason}`];
    }
    if (!target.actions) {
      return [label, '—', '—', '—', '—', '—', 'Not measured'];
    }
    const comparable = comparableActionResults(target.actions);
    const failures = comparable.filter((result) => !result.passed).map((result) => result.label);
    // A passing cell whose max breached in one scored repeat is reported beside
    // the failures rather than hidden under "None": it is the cell the next
    // recapture targets first (ADR-0156).
    const unconfirmed = comparable
      .filter((result) => result.passed && result.postActionFrames?.maxUnconfirmed === true)
      .map((result) => `${result.label} (max ${fmt(result.postActionFrames.max)} ms unconfirmed)`);
    const failureCell = [...failures, ...unconfirmed];
    // When every comparable first frame is declared N/A the aggregate is a
    // declared non-measurement, not an absent one — render it apart from the
    // "—" that means "not measured".
    const allFirstFramesNa =
      comparable.length > 0 && comparable.every((result) => result.firstFrame?.na === true);
    return [
      label,
      `${comparable.filter((result) => result.passed).length} / ${comparable.length}`,
      `${target.actions.finalProductCommitActionCount} / ${comparable.length}`,
      allFirstFramesNa ? 'N/A' : fmt(target.actions.worst.firstFrameP95),
      fmt(target.actions.worst.readyP95),
      `${fmt(target.actions.worst.postActionFrameP95)} / ${fmt(target.actions.worst.postActionFrameMax)}`,
      failureCell.length ? failureCell.join('; ') : 'None',
    ];
  });
  const provenanceRows = rows.map((target) => {
    const label = `${target.targetNumber}. ${rowLabel(target)}`;
    if (target.status !== 'captured') {
      return [label, `Unavailable: ${target.reason}`, '—', '—'];
    }
    return [
      label,
      target.drawingProductCommit,
      target.undo ? target.undoProductCommit : '—',
      target.actions
        ? [...new Set(target.actions.sources.map((source) => source.productCommit))].join(', ')
        : '—',
    ];
  });
  const limitations = [...matrix.limitations, ...preservedEvidenceNotes(matrix)]
    .map((limitation) => `- ${limitation}`)
    .join('\n');
  return `# Deployment-target performance matrix — ${matrix.recordedOn}

This deployment-target snapshot combines the campaign evidence declared in \`sources.json\`.
\`${matrix.productCommit}\` is the measured product commit. Every normalized result retains its
target, mode, commit, and declared evidence state; focused action captures, when present, replace
only their declared scenarios within that mode, and only alongside a full sweep at the same
product commit.

The [interactive matrix](./index.html) is the quickest comparison. [\`data.json\`](./data.json)
contains every normalized drawing run and grouped action result, and
[\`sources.json\`](./sources.json) records the ordered source campaign.

Regenerate the JSON, Markdown, and HTML after updating the source manifest with:

\`\`\`sh
npm run gen:performance-matrix -- \\
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
\`\`\`

## Acceptance gates

Drawing passes at paint P95 ≤ ${matrix.gates.drawing.paintP95Ms} ms, P99 ≤ ${matrix.gates.drawing.paintP99Ms} ms,
max ≤ ${matrix.gates.drawing.paintMaxMs} ms, and cumulative lost frame time ≤ ${fmtPercent(matrix.gates.drawing.lostFrameTimeShare)} of in-contact time. Undo
passes at engine P95 ≤ ${matrix.gates.undo.engineP95Ms} ms, next-frame P95 ≤ ${matrix.gates.undo.nextFrameP95Ms} ms, and next-frame max ≤
${matrix.gates.undo.nextFrameMaxMs} ms. A discrete action passes at first-frame P95 ≤
${matrix.gates.actions.firstFrameP95Ms} ms, post-action frame P95 ≤ ${matrix.gates.actions.postActionFrameP95Ms} ms, and post-action frame max ≤
${matrix.gates.actions.postActionFrameMaxMs} ms, a max breach counting only when
${matrix.gates.actions.postActionFrameMaxConfirmingSamples} of the three scored repeats show it (ADR-0156); a cell over the max in one repeat
passes, is rendered as an unconfirmed warning, and is listed beside the failures with its max. Readiness P95 is reported separately because its
completion semantics and transport polling resolution differ by action; a frame-gate pass is not
evidence that an optimization preserved end-to-end response time. Rotation first frames on iPad Safari are not applicable rather than gated:
under ADR-0142's \`resize\` anchor the value reads 0–2 ms by construction there, so those cells
render N/A and rotation is scored by the post-action frame gates alone.

${renderLostFrameExceptionsMarkdown(matrix.gates.drawing.lostFrameTimeShareExceptions ?? {})}
${renderActionAllowancesMarkdown(matrix.gates.actions.postActionAllowances)}
## Capture limitations

${limitations || '- None recorded.'}
${renderCandidateActionsMarkdown(matrix.candidateActions ?? [])}

## Commit provenance

${markdownTable(['Target', 'Drawing', 'Undo', 'Action source commits'], provenanceRows)}

## Drawing

Each cell is blank-paper paint \`P95 / P99 / max\` in milliseconds, followed by the cumulative
lost-frame share of in-contact time. Every target retains separate portrait/landscape and
light/dark rows.

A cell aggregates however many captures its manifest lists — in this snapshot, one per cell
(\`runCount\` in \`data.json\` records the basis, and each plot tooltip states it). A gate verdict
from a single capture is one draw from that cell's run-to-run spread, so read a marginal PASS or
FAIL as provisional rather than established: ADR-0136 treats a number from the lost-frame gate as
provisional until it has been compared against the previous run of the same cell, and ADR-0137
sizes its exceptions from worst single captures for the same reason. The campaign's one attempt to
measure a cell's spread directly (issue 1290) was retracted twice — first as host load, then as
cross-run contamination — so the spread itself remains unmeasured; a clean repeat study belongs to
the campaign-end recapture, on a quiet host.

${markdownTable(['Target', 'Pen', 'Crayon', 'Magic', 'Eraser'], drawingRows)}

## Undo

Undo timing is \`engine P95 / next-frame P95 / next-frame max\` in milliseconds.

${markdownTable(['Target', 'Timing', 'Result', 'Product commit'], undoRows)}

## Discrete actions

The idle-frame profiling control is excluded from the columns below and **consulted** rather than
merely dropped: it performs no interaction, so a mode where it fails its own gate cannot attribute
any action score to the product. Such a mode is marked \`no control\` and left out of the
cross-mode failure ranking. Ready P95 is the action-specific observable completion time. The post-action column is
\`P95 / max\` in milliseconds. Full per-action timing and provenance are available in the
interactive matrix and normalized JSON.

${markdownTable(['Target', 'Passing', 'At final commit', 'Worst first P95', 'Worst ready P95', 'Worst post P95 / max', 'Failed actions'], actionRows)}

## Method

Action sources are applied in manifest order within one target mode. A focused capture replaces
only its declared labels in that mode, and only when the mode also carries a full sweep at the
same product commit (\`unconfirmed-focused-action\` refuses the fold otherwise); all other labels
retain their earlier measurement and provenance. Drawing raw tables and action samples are re-scored with the current metric definitions
when this report is generated; stored derived summaries are not trusted. ${releaseGateSentence(matrix)}
`;
}

// Which target carries the calibrated drawing instrument is a property of the
// evidence, not of the prose: the manifest marks it, and whether this campaign
// reached it — and what it found — follows from the normalized modes. Stating
// either in a fixed sentence lets the report contradict its own tables.
const GATE_FIDELITY = 'physical-safari-gated';

const RELEASE_GATE = 'release-gate';
const REGRESSION_TRIPWIRE = 'regression-tripwire';
const ADVISORY = 'advisory';

// ADR-0156 assigns a row its release role by the hardware it ran on, not by its
// fidelity class: three of the four physical rows are advisory in the fidelity
// sense (uncalibrated input checks, ADR-0139) and gate a release anyway.
const ROLE_BY_DEVICE_KIND = {
  physical: RELEASE_GATE,
  desktop: REGRESSION_TRIPWIRE,
  simulator: ADVISORY,
  emulator: ADVISORY,
};

export function targetRole(target) {
  if (!Object.hasOwn(ROLE_BY_DEVICE_KIND, target.deviceKind)) {
    throw new Error(
      `Target ${target.id} declares deviceKind ${JSON.stringify(target.deviceKind)}, which ADR-0156 assigns no release role.`
    );
  }
  return ROLE_BY_DEVICE_KIND[target.deviceKind];
}

// Page order is gate first, then the roles that never block a release. Each
// `rule` is that role's ADR-0156 decision in one sentence; `clause` is the same
// role as the report intro names it.
const ROLE_SECTIONS = [
  {
    role: RELEASE_GATE,
    title: 'Release gate · physical iPad and Android',
    rule: 'These rows gate a release: a scoreable red cell needs a recorded product outcome, and a cell an uncalibrated instrument cannot score counts as red here, not as absent.',
  },
  {
    role: REGRESSION_TRIPWIRE,
    title: 'Regression tripwire · Mac',
    rule: 'A Mac cell that turns red on a change that was green on main is a finding to attribute before shipping; a cell that was already red is not a remainder.',
    clause: 'Mac rows are a regression tripwire',
  },
  {
    role: ADVISORY,
    title: 'Advisory · simulators and emulators',
    rule: 'These rows narrow or reject a hypothesis but never fail or approve a release; their red stays visible so a systemic regression still shows.',
    clause: 'simulator and emulator rows are advisory',
  },
];

function targetsInRole(matrix, role) {
  return matrix.targets.filter((target) => targetRole(target) === role);
}

function targetsInRoleOrder(matrix) {
  return ROLE_SECTIONS.flatMap(({ role }) => targetsInRole(matrix, role));
}

function gateAggregates(target) {
  return target.modes
    .filter((mode) => mode.status === 'captured')
    .flatMap((mode) => Object.values(mode.drawing ?? {}))
    .map((brush) => brush?.aggregate)
    .filter(Boolean);
}

function calibratedGateStatus(gate) {
  const captured = gate.modes.filter((mode) => mode.status === 'captured').length;
  if (!captured) return ' and is unavailable in this campaign';

  const aggregates = gateAggregates(gate);
  const scoreable = aggregates.filter((aggregate) => aggregate.scoreable !== false);
  const unscoreable = aggregates.length - scoreable.length;
  const failing = scoreable.filter(
    (aggregate) => (aggregate.allPhasesPassed ?? aggregate.blankPassed) === false
  ).length;
  const coverage = `${captured}/${gate.modes.length} modes captured`;
  const verdict = !scoreable.length
    ? 'no drawing aggregate scored'
    : failing
      ? `${failing} of ${scoreable.length} brush aggregates over gate`
      : `all ${scoreable.length} brush aggregates inside gate`;
  const offRegime = aggregates.filter((aggregate) => aggregate.offRefreshRegime).length;
  const why = offRegime
    ? `failed input fidelity or were measured off this target's refresh regime`
    : 'failed input fidelity';
  const caveat = unscoreable ? `, ${unscoreable} unscoreable (${why})` : '';
  return ` — ${coverage}, ${verdict}${caveat}`;
}

function calibrationSentence(gates) {
  const calibrated = gates.find((target) => target.fidelity === GATE_FIDELITY);
  if (!calibrated) {
    return gates.length === 1
      ? 'It carries no calibrated drawing instrument yet, so it is a gate-in-waiting.'
      : `None of them carries a calibrated drawing instrument yet, so ${gates.length === 2 ? 'both' : `all ${gates.length}`} are gates-in-waiting.`;
  }
  const waiting = gates.length - 1;
  const others =
    waiting === 0
      ? ''
      : waiting === 1
        ? '; the other is a gate-in-waiting until its instrument is calibrated'
        : `; the other ${waiting} are gates-in-waiting until theirs are calibrated`;
  return `${waiting ? 'Only ' : ''}${calibrated.label} carries a calibrated drawing instrument${calibratedGateStatus(calibrated)}${others}.`;
}

function releaseGateSentence(matrix) {
  const gates = targetsInRole(matrix, RELEASE_GATE);
  const clauses = ROLE_SECTIONS.filter(
    ({ role, clause }) => clause && targetsInRole(matrix, role).length
  ).map(({ clause }) => clause);
  const others = clauses.length
    ? ` ${clauses.join(', and ').replace(/^./, (first) => first.toUpperCase())} (ADR-0156).`
    : '';
  if (!gates.length) return `No target in this campaign is a release-gate row.${others}`;
  const roster =
    gates.length === 1
      ? `The release gate is one physical row, ${gates[0].label}.`
      : `The release gate is the ${gates.length} physical rows: ${gates.map((target) => target.label).join(', ')}.`;
  return `${roster} ${calibrationSentence(gates)}${others}`;
}

const EXTRA_CSS = `
/* ---- sticky mode toolbar --------------------------------------------------- */
.matrix-toolbar{position:sticky;top:0;z-index:40;border-bottom:1px solid var(--hair);
  background:color-mix(in srgb,var(--paper) 92%,transparent);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.toolbar-row{display:flex;align-items:center;gap:14px;height:48px;overflow-x:auto;scrollbar-width:none}
.toolbar-row::-webkit-scrollbar{display:none}
.mode-chips{display:none}
:root.js .mode-chips{display:flex;align-items:center;gap:6px}
.toolbar-label{font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.mode-chip{font:inherit;font-size:.76rem;font-weight:650;color:var(--muted);background:var(--card);
  border:1px solid var(--hair);border-radius:999px;padding:4px 12px;cursor:pointer;white-space:nowrap}
.mode-chip[aria-pressed=true]{color:var(--accent-ink);background:var(--accent-wash);
  border-color:color-mix(in srgb,var(--accent) 35%,var(--hair))}
.mode-chip[aria-pressed=true]::before{content:"✓ ";font-weight:800}
.toolbar-sep{width:1px;height:18px;background:var(--hair-strong);flex:0 0 auto}
.toolbar-count{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.toolbar-jump{margin-left:auto;display:flex;gap:14px;font-size:.78rem;font-weight:650;white-space:nowrap}
.toolbar-jump a{color:var(--muted)}
.toolbar-jump a:hover{color:var(--accent-ink)}
.section-head{scroll-margin-top:calc(var(--toolbar-h,48px) + 16px)}

/* ---- intro ------------------------------------------------------------------ */
.matrix-intro{max-width:78ch;color:var(--muted);margin:0 0 10px}
.matrix-links{display:flex;gap:4px 14px;flex-wrap:wrap;margin:0 0 6px;font-size:.84rem;color:var(--faint)}
.matrix-links a{font-weight:650;text-decoration:underline;text-underline-offset:2px}
.matrix-chip{font-size:.67rem;font-weight:750;padding:3px 8px;border-radius:999px;
  background:var(--accent-wash);color:var(--accent-ink);white-space:nowrap}
.matrix-chip.trusted{background:color-mix(in srgb,var(--ok) 15%,var(--card));
  color:color-mix(in srgb,var(--ok) 55%,var(--ink))}
.matrix-chip.earlier{background:color-mix(in srgb,var(--gold) 14%,var(--card));
  color:color-mix(in srgb,var(--gold) 60%,var(--ink))}
.matrix-chip.waiting{background:transparent;color:color-mix(in srgb,var(--gold) 60%,var(--ink));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gold) 45%,var(--hair))}

/* ---- drawing metric switcher ------------------------------------------------ */
/* Without JS the buttons would be dead weight, but the note still explains the
   default P95 view, so only the button group hides. */
.seg-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px}
.seg{display:none;background:var(--card);border:1px solid var(--hair);border-radius:10px;padding:3px;gap:2px;flex-wrap:wrap}
:root.js .seg{display:inline-flex}
.seg-btn{font:inherit;font-size:.76rem;font-weight:700;color:var(--muted);background:transparent;
  border:0;border-radius:7px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.seg-btn[aria-pressed=true]{background:var(--accent-wash);color:var(--accent-ink)}
.seg-note{font-size:.76rem;color:var(--muted)}

/* ---- release-role sections (ADR-0156) ---------------------------------------- */
.role-head{display:flex;flex-direction:column;gap:3px;padding:12px 0 4px;margin-top:14px;border-top:1px solid var(--hair-strong)}
.role-primary > .role-head{border-top:0;margin-top:4px}
.role-title{display:flex;align-items:baseline;gap:4px 8px;flex-wrap:wrap}
.role-title b{font-size:.9rem;font-weight:750;letter-spacing:-.01em}
.role-primary .role-title b{color:color-mix(in srgb,var(--ok) 55%,var(--ink))}
.role-count{font-size:.7rem;font-weight:650;color:var(--faint)}
.role-rule{font-size:.76rem;line-height:1.45;color:var(--muted);max-width:78ch}
.role-fold > summary{position:relative;padding-left:20px;cursor:pointer;list-style:none}
.role-fold > summary::-webkit-details-marker{display:none}
.role-fold > summary:before{content:"\\25B8";position:absolute;left:3px;top:12px;color:var(--faint);transition:transform .12s}
.role-fold[open] > summary:before{transform:rotate(90deg)}
.role-fold > summary:hover .role-title b{color:var(--accent-ink)}
.role-fold > summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:7px}
/* Inside the two-way scroller a section heading pins left like the row labels. */
.heat-inner .role-head{position:sticky;left:0;z-index:3;background:var(--card);
  width:max-content;max-width:min(78ch,calc(100vw - 72px))}

/* ---- empty-cell legend --------------------------------------------------------- */
.empty-legend{display:flex;gap:6px 16px;flex-wrap:wrap;align-items:center;font-size:.72rem;color:var(--muted);margin:0 0 10px}
.empty-legend > b{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--faint)}
.empty-legend span{display:inline-flex;gap:6px;align-items:center}
.empty-legend span b{color:var(--ink);font-weight:700}
.empty-legend i{width:15px;height:15px;border-radius:4px;flex:0 0 auto}

/* ---- overview matrix -------------------------------------------------------- */
/* The label column and the cells share the sheet's full width; the header row
   takes the same template so its column names stay over their cells. */
.mx{background:var(--card);border:1px solid var(--hair);
  border-radius:var(--r-md);padding:0 16px 14px}
.mx-row{display:grid;gap:4px;align-items:center;border-radius:7px;
  grid-template-columns:minmax(230px,1.5fr) repeat(4,minmax(var(--mx-brush,72px),1fr)) minmax(var(--mx-undo,54px),.7fr) minmax(var(--mx-actions,80px),1fr)}
.mx-row:hover .mx-label{color:var(--ink)}
.mx-head{position:sticky;top:var(--toolbar-h,48px);z-index:5;background:var(--card);
  border-bottom:1px solid var(--hair);padding:8px 0 7px;font-size:.68rem;font-weight:700;color:var(--muted)}
.mx-groups{margin-bottom:2px}
.mx-group{grid-column:2/6;text-align:center;font-weight:650;color:var(--muted);
  border-bottom:1px solid var(--hair-strong);padding-bottom:2px}
.mx-group-note{text-align:center;font-weight:600;color:var(--muted)}
.mx-col{text-align:center}
.mx-target{margin-top:12px}
.mx-target-label{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0;padding:6px 0 3px}
.mx-target-label b{font-size:.8rem;white-space:nowrap}
.mx-target-label small{color:var(--faint);font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-label{font-size:.72rem;color:var(--muted)}
.mx-span{grid-column:2/-1;font-size:.72rem;color:var(--faint)}
.mx-cell{display:grid;place-items:center;height:28px;border-radius:7px;font-size:.72rem;font-weight:650;
  font-variant-numeric:tabular-nums;cursor:default}
.mx-cell.cool{background:color-mix(in srgb,var(--accent) 16%,var(--card-2))}
.mx-cell.pass{background:color-mix(in srgb,var(--ok) 22%,var(--card-2))}
.mx-cell.warn{background:color-mix(in srgb,var(--warn) 36%,var(--card-2))}
.mx-cell.hot{background:color-mix(in srgb,var(--bad) 36%,var(--card-2))}
.mx-cell.failed{box-shadow:inset 0 0 0 2px var(--bad)}
.mx-cell:focus-visible,.heat-cell:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.mx-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.72rem;color:var(--muted);margin:0 0 8px}
.mx-legend b{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--faint)}
.mx-legend span{display:inline-flex;gap:5px;align-items:center}
.mx-legend .mx-cell{width:13px;height:13px;border-radius:4px;padding:0}
.mx-note{font-size:.76rem;color:var(--muted);max-width:78ch;margin:0 0 12px}

/* ---- action heatmap ---------------------------------------------------------- */
.heat-scroll{--heat-cell:16px;overflow:auto;max-height:76vh;overscroll-behavior:contain;
  background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:0 13px 13px}
@media (pointer:coarse){.heat-scroll{--heat-cell:22px}}
/* Every row must span the full scrolled content width or its sticky label has
   nothing to pin against — min-width:100% on a row resolves against the
   scrollport, so the width lives on this shared wrapper instead. */
.heat-inner{width:max-content;min-width:100%}
.heat-row{display:grid;grid-template-columns:158px max-content;gap:10px;align-items:center;margin:4px 0}
.heat-row.header{position:sticky;top:0;z-index:6;background:var(--card);margin:0;
  padding:12px 0 7px;border-bottom:1px solid var(--hair)}
.heat-row.target{margin-top:12px}
.heat-label{position:sticky;left:0;z-index:2;background:var(--card);display:flex;justify-content:space-between;
  gap:8px;align-items:center;font-size:.72rem;white-space:nowrap;padding-right:8px;align-self:stretch}
.heat-row.header .heat-label{z-index:7;font-weight:700}
.heat-row.target .heat-label b{font-size:.76rem}
.heat-label b{font-size:.68rem;color:var(--muted)}
.heat-label span{color:var(--muted)}
.heat-note{font-size:.7rem;color:var(--faint);white-space:nowrap}
.heat-cells{display:grid;grid-template-columns:repeat(var(--action-columns),var(--heat-cell));gap:3px}
.heat-cell,.action-number{width:var(--heat-cell);height:var(--heat-cell);border-radius:4px;display:block;position:relative}
/* Empty cells: N/A by design is one struck stroke, unavailable a hatch, missing
   a dashed hole. The shapes carry the meaning, so it survives without colour;
   the dashed edge is a border because outline is the focus ring. */
.heat-cell.not-applicable{background:transparent;box-shadow:inset 0 0 0 1px var(--hair-strong)}
.heat-cell.not-applicable:after{content:"";position:absolute;left:2px;right:2px;top:50%;
  border-top:1px solid var(--muted);transform:rotate(-45deg)}
.heat-cell.unscoreable,.mx-cell.unscoreable{color:var(--muted);box-shadow:none;
  background:repeating-linear-gradient(45deg,var(--card-2) 0 2px,color-mix(in srgb,var(--muted) 55%,var(--card-2)) 2px 4px)}
.mx-cell.unscoreable{background:repeating-linear-gradient(45deg,var(--card-2) 0 4px,color-mix(in srgb,var(--muted) 30%,var(--card-2)) 4px 8px)}
.mx-cell.unscoreable.failed{box-shadow:inset 0 0 0 2px var(--bad)}
.heat-cell.missing,.mx-cell.missing{color:var(--faint);background:transparent;box-shadow:none;
  border:1.5px dashed var(--muted)}
.action-number{font-size:.52rem;text-align:center;color:var(--muted);line-height:var(--heat-cell)}
.heat-cell.cursor{outline:2px solid var(--accent);outline-offset:1px}
.heat-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.heat-hint{color:var(--faint)}
.heat-earlier{font-weight:600;color:color-mix(in srgb,var(--gold) 60%,var(--ink))}
.heat-cell.cool{background:color-mix(in srgb,var(--accent) 35%,var(--card-2))}
.heat-cell.pass{background:color-mix(in srgb,var(--ok) 70%,var(--card))}
.heat-cell.warn{background:color-mix(in srgb,var(--warn) 78%,var(--card))}
.heat-cell.hot{background:var(--bad)}
.heat-cell.unconfirmed{background:color-mix(in srgb,var(--warn) 78%,var(--card));
  box-shadow:inset 0 0 0 2px var(--card),inset 0 0 0 3px var(--warn)}
.heat-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.72rem;color:var(--muted);margin:0 0 10px}
.heat-legend span{display:inline-flex;gap:5px;align-items:center}
.heat-legend i{width:12px;height:12px;border-radius:3px}
.action-key{margin-top:10px;font-size:.78rem;color:var(--muted)}
.action-key summary{cursor:pointer;font-weight:700;color:var(--accent-ink)}
.action-key ol{columns:3;column-gap:30px;padding-left:24px}
.action-key li{break-inside:avoid;padding:2px 0}
.rank-card{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);
  padding:15px;margin-top:16px;max-width:640px}
.rank-card h3{font-size:.95rem;margin:0 0 4px}
.rank-scope{font-size:.72rem;color:var(--faint);margin:0 0 10px}
.rank-list{list-style:none;padding:0;margin:0}
.rank-list li{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--hair)}
.rank-list li:first-child{border-top:0}
.rank{display:grid;place-items:center;min-width:23px;height:23px;border-radius:7px;
  background:var(--card-2);font-size:.68rem;font-weight:800}
.rank-list b{display:block;font-size:.78rem}
.rank-list small{display:block;color:var(--muted);font-size:.68rem}

/* ---- filtered rows (mode chips) ---------------------------------------------- */
.mx-row.filtered,.heat-row.filtered{display:none}

/* ---- collapsed notes ---------------------------------------------------------- */
.note{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);margin:0 0 10px}
.note summary{display:flex;align-items:center;gap:10px;padding:13px 18px;cursor:pointer;list-style:none}
.note summary::-webkit-details-marker{display:none}
.note summary h2{font-size:.98rem;margin:0;font-weight:750;letter-spacing:-.01em}
.note-count{font-size:.7rem;font-weight:700;color:var(--muted);background:var(--card-2);border-radius:999px;padding:2px 9px}
.note summary:after{content:"\\25B8";margin-left:auto;color:var(--faint);transition:transform .12s}
.note[open] summary:after{transform:rotate(90deg)}
.note-body{padding:0 18px 16px;color:var(--muted);font-size:.85rem}
.note-body p{margin:0 0 10px}
.note-list{margin:0;padding-left:20px}
.note-list li{margin:0 0 8px}

/* ---- tables (undo, provenance, candidate actions) ----------------------------- */
.provenance{overflow-x:auto;background:var(--card-2);border:1px solid var(--hair);border-radius:var(--r-sm);padding:10px}
.provenance code{font-size:.68rem}
table{width:100%;border-collapse:collapse;font-size:.72rem}
th,td{text-align:right;padding:6px;border-top:1px solid var(--hair)}
th:first-child{text-align:left}
thead th{border-top:0;color:var(--muted);font-weight:650}
tr.target-break th,tr.target-break td{border-top-color:var(--hair-strong)}
.muted{color:var(--faint);text-align:left}
.verdict{font-weight:800}
.verdict.pass{color:var(--ok)}
.verdict.fail{color:var(--bad)}
.candidate-actions th,.candidate-actions td{text-align:left;vertical-align:top}

/* ---- tooltip ------------------------------------------------------------------ */
/* pointer-events stays on so the tooltip itself can be hovered (to select or
   magnify a long failing-actions list) without dismissing it. */
.tip{position:fixed;z-index:80;max-width:min(360px,calc(100vw - 16px));background:var(--ink);color:var(--paper);
  padding:8px 12px;border-radius:9px;font-size:.75rem;line-height:1.5;font-weight:500;
  box-shadow:var(--shadow-lg)}

@media (prefers-reduced-motion:reduce){
  .note summary:after,.role-fold > summary:before{transition:none}
}
@media (max-width:720px){
  .section-head{flex-direction:column;align-items:flex-start;gap:2px}
  .toolbar-jump,.toolbar-label,.toolbar-sep,.count-word{display:none}
  .toolbar-row{gap:8px}
  :root.js .mode-chips{gap:4px}
  .mode-chip{padding:3px 7px;font-size:.68rem}
  .toolbar-count{font-size:.68rem}
  :root:not(.js) .matrix-toolbar{display:none}
  .mx{width:auto;max-width:none;margin-inline:-16px;border-radius:0;border-left:0;border-right:0;padding-inline:6px}
  .mx-row{--mx-brush:41px;--mx-undo:28px;--mx-actions:56px;gap:3px;
    grid-template-columns:minmax(92px,1fr) repeat(4,var(--mx-brush)) var(--mx-undo) var(--mx-actions)}
  .mx-cell{font-size:.62rem;height:26px}
  .mx-label{font-size:.66rem}
  .heat-row{grid-template-columns:118px max-content}
  .heat-label{font-size:.66rem}
  .action-key ol{columns:1}
}
@media (max-width:370px){
  .toolbar-row{gap:6px}
  .mode-chip{padding:2px 6px;font-size:.62rem}
  :root.js .mode-chips{gap:3px}
  .toolbar-count{font-size:.62rem}
  .mx{padding-inline:4px}
  .mx-row{--mx-brush:36px;--mx-undo:24px;--mx-actions:44px;gap:2px;
    grid-template-columns:minmax(84px,1fr) repeat(4,var(--mx-brush)) var(--mx-undo) var(--mx-actions)}
  .mx-cell{font-size:.56rem;height:24px}
  .mx-label{font-size:.6rem}
}

/* ---- print ---------------------------------------------------------------- */
@media print{
  .matrix-toolbar,.seg,.tip{display:none}
  .mx-head{position:static}
  .heat-scroll{max-height:none;overflow:visible;--heat-cell:9px;padding-top:8px}
  .heat-cells{gap:2px}
  .heat-row{grid-template-columns:130px max-content}
  .heat-row.header{position:static}
  .heat-label,.heat-inner .role-head{position:static;font-size:.6rem}
  .action-key ol{columns:2}
  .note{break-inside:avoid}
}
`;

// Runs inline in the generated page: the tap/hover tooltip, the mode filters, and
// the drawing metric switcher. The page stays fully readable without it — every
// cell keeps a title attribute and all rows render visible.
const PAGE_SCRIPT = `
(() => {
  document.documentElement.classList.add('js');

  const toolbar = document.querySelector('.matrix-toolbar');
  const setToolbarHeight = () => {
    if (!toolbar) return;
    document.documentElement.style.setProperty('--toolbar-h', toolbar.offsetHeight + 'px');
  };
  setToolbarHeight();
  addEventListener('resize', setToolbarHeight);

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let tipAnchor = null;
  let keyboardNavAt = 0;

  const tipText = (el) => {
    if (el.hasAttribute('title')) {
      el.dataset.tip = el.getAttribute('title');
      el.removeAttribute('title');
    }
    return el.dataset.tip || '';
  };
  const hideTip = () => {
    tip.hidden = true;
    tipAnchor = null;
  };
  const showTip = (el) => {
    const text = tipText(el);
    if (!text) return hideTip();
    tip.textContent = text;
    tip.hidden = false;
    tipAnchor = el;
    const box = el.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const x = Math.min(
      Math.max(8, box.left + box.width / 2 - size.width / 2),
      innerWidth - size.width - 8
    );
    const clearance = (toolbar ? toolbar.offsetHeight : 0) + 8;
    let y = box.top - size.height - 8;
    if (y < clearance) y = box.bottom + 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  };

  // Leaving a cell toward its tooltip crosses an 8px gap; an instant hide made
  // the tooltip impossible to reach, so the hover path hides on a short delay
  // that entering the tooltip (or another cell) cancels.
  let hideTimer = null;
  const cancelHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  };
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (tip.contains(event.target)) return cancelHide();
    const el = event.target.closest('[title], [data-tip]');
    if (el) {
      cancelHide();
      showTip(el);
    } else if (tipAnchor && !hideTimer) {
      hideTimer = setTimeout(() => {
        hideTimer = null;
        hideTip();
      }, 250);
    }
  });
  // Always show, never toggle off: on touch the tap that follows focusin was
  // closing the tooltip the focus had just opened. Dismissal is tapping
  // elsewhere, Escape, or scrolling.
  document.addEventListener('click', (event) => {
    if (event.target.closest('a, button, summary') || tip.contains(event.target)) return;
    const el = event.target.closest('[title], [data-tip]');
    if (!el) return hideTip();
    showTip(el);
  });
  document.addEventListener('focusin', (event) => {
    const el = event.target.closest('[title], [data-tip]');
    if (el) showTip(el);
    else hideTip();
  });
  addEventListener(
    'scroll',
    () => {
      if (Date.now() - keyboardNavAt > 300) hideTip();
    },
    { capture: true, passive: true }
  );
  addEventListener('resize', hideTip);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTip();
  });

  const pressed = {
    orientation: { portrait: true, landscape: true },
    theme: { light: true, dark: true },
  };
  const modeCount = document.getElementById('mode-count');
  const applyModeFilters = () => {
    const rows = document.querySelectorAll('[data-orientation][data-theme]');
    let visibleCount = 0;
    rows.forEach((row) => {
      const visible =
        pressed.orientation[row.dataset.orientation] && pressed.theme[row.dataset.theme];
      row.classList.toggle('filtered', !visible);
      if (visible && row.classList.contains('mx-row')) visibleCount += 1;
    });
    document.querySelectorAll('[data-target-header]').forEach((header) => {
      const targetRows = document.querySelectorAll(
        '[data-target="' + header.dataset.targetHeader + '"]'
      );
      const anyVisible = [...targetRows].some((row) => !row.classList.contains('filtered'));
      header.classList.toggle('filtered', !anyVisible);
    });
    if (modeCount) {
      modeCount.textContent =
        visibleCount + '/' + document.querySelectorAll('.mx .mx-row[data-orientation]').length;
    }
  };
  document.querySelectorAll('.mode-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = pressed[chip.dataset.kind];
      const otherActive = Object.entries(group).some(
        ([value, active]) => value !== chip.dataset.value && active
      );
      // Refuse to empty a dimension: with no orientation (or theme) selected
      // every row disappears and the page looks broken.
      if (group[chip.dataset.value] && !otherActive) return;
      group[chip.dataset.value] = !group[chip.dataset.value];
      chip.setAttribute('aria-pressed', String(group[chip.dataset.value]));
      applyModeFilters();
    });
  });

  const metricNote = document.getElementById('metric-note');
  const metricHead = document.getElementById('mx-metric-label');
  const HEAT_CLASSES = ['cool', 'pass', 'warn', 'hot', 'missing'];
  document.querySelectorAll('.seg-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document
        .querySelectorAll('.seg-btn')
        .forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      const metric = button.dataset.metric;
      document.querySelectorAll('.mx-cell[data-p95]').forEach((cell) => {
        cell.textContent = cell.dataset[metric] || '\\u2014';
        if (cell.classList.contains('unscoreable')) return;
        cell.classList.remove(...HEAT_CLASSES);
        cell.classList.add(cell.dataset[metric + 'h'] || 'missing');
      });
      if (metricNote) metricNote.textContent = button.dataset.note;
      if (metricHead) metricHead.textContent = button.dataset.head;
    });
  });

  // The heatmap's cells are deliberately not tab stops (there are ~2,400 of
  // them); the pane is one stop and arrow keys walk the grid instead, with
  // aria-activedescendant naming the selected cell for assistive tech.
  const pane = document.querySelector('.heat-scroll');
  if (pane) {
    pane.tabIndex = 0;
    pane.setAttribute('role', 'grid');
    pane.setAttribute(
      'aria-label',
      'Discrete action results. Use the arrow keys to move between cells; each cell announces its measurement.'
    );
    pane.querySelectorAll('.heat-row').forEach((row) => row.setAttribute('role', 'row'));
    pane
      .querySelectorAll('.heat-cell, .heat-label, .action-number, .heat-note')
      .forEach((cell) => cell.setAttribute('role', 'gridcell'));
    let cursor = null;
    let cellSequence = 0;
    const DELTAS = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    pane.addEventListener('keydown', (event) => {
      const delta = DELTAS[event.key];
      // A focused role-section summary inside the pane keeps its own keys.
      if (!delta || event.target !== pane) return;
      // Rows folded into a closed role section are off screen, so the cursor
      // skips them instead of scrolling to a cell nobody can see.
      const grid = [...pane.querySelectorAll('.heat-row:not(.header):not(.filtered)')]
        .filter((row) => !row.closest('details:not([open])'))
        .map((row) => [...row.querySelectorAll('.heat-cell')])
        .filter((cells) => cells.length);
      if (!grid.length) return;
      event.preventDefault();
      if (!cursor) {
        cursor = { row: 0, column: 0 };
      } else {
        cursor.row = Math.min(Math.max(0, cursor.row + delta[0]), grid.length - 1);
        cursor.column = Math.min(
          Math.max(0, cursor.column + delta[1]),
          grid[cursor.row].length - 1
        );
      }
      const cell = grid[cursor.row][cursor.column];
      pane.querySelectorAll('.heat-cell.cursor').forEach((c) => c.classList.remove('cursor'));
      cell.classList.add('cursor');
      if (!cell.id) {
        cellSequence += 1;
        cell.id = 'heat-cell-' + cellSequence;
      }
      pane.setAttribute('aria-activedescendant', cell.id);
      keyboardNavAt = Date.now();
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      showTip(cell);
    });
    pane.addEventListener('blur', () => {
      pane.querySelectorAll('.heat-cell.cursor').forEach((c) => c.classList.remove('cursor'));
      pane.removeAttribute('aria-activedescendant');
      cursor = null;
    });
  }

  // Print: sticky panes and collapsed notes would drop most of the content, so
  // everything opens for the printout and closes back afterwards.
  let printOpened = [];
  addEventListener('beforeprint', () => {
    printOpened = [...document.querySelectorAll('details:not([open])')];
    printOpened.forEach((details) => (details.open = true));
    hideTip();
  });
  addEventListener('afterprint', () => {
    printOpened.forEach((details) => (details.open = false));
    printOpened = [];
  });
})();
`;

function modeToolbar(modeCount) {
  const chip = (kind, value, label) =>
    `<button type="button" class="mode-chip" data-kind="${kind}" data-value="${value}" aria-pressed="true">${label}</button>`;
  return `<div class="matrix-toolbar">
  <div class="shell toolbar-row">
    <div class="mode-chips" role="group" aria-label="Which rows to show">
      <span class="toolbar-label">Rows</span>
      ${chip('orientation', 'portrait', 'Portrait')}
      ${chip('orientation', 'landscape', 'Landscape')}
      <span class="toolbar-sep"></span>
      ${chip('theme', 'light', 'Light')}
      ${chip('theme', 'dark', 'Dark')}
      <span class="toolbar-count"><span id="mode-count">${modeCount}/${modeCount}</span><span class="count-word"> modes</span></span>
    </div>
    <nav class="toolbar-jump" aria-label="Sections"><a href="#results">Results</a><a href="#actions">Actions</a><a href="#notes">Notes</a></nav>
  </div>
</div>`;
}

function metricSwitcher(gates) {
  const options = [
    {
      metric: 'p95',
      label: 'Paint P95',
      head: `Paint P95 · ms · gate ${gates.paintP95Ms} ms`,
      note: `Brush cells show blank-paper paint P95 in ms · gate ${gates.paintP95Ms} ms`,
    },
    {
      metric: 'p99',
      label: 'P99',
      head: `Paint P99 · ms · gate ${gates.paintP99Ms} ms`,
      note: `Brush cells show blank-paper paint P99 in ms · gate ${gates.paintP99Ms} ms`,
    },
    {
      metric: 'max',
      label: 'Max',
      head: `Paint max · ms · gate ${gates.paintMaxMs} ms`,
      note: `Brush cells show the worst blank-paper paint in ms · gate ${gates.paintMaxMs} ms`,
    },
    {
      metric: 'lost',
      label: 'Lost frame time',
      head: `Lost frame time · % of drawing time`,
      note: `Brush cells show time lost to delayed frames as a share of drawing time · budget ${fmtPercent(gates.lostFrameTimeShare)} — tooltips carry each cell’s own budget`,
    },
  ];
  const buttons = options
    .map(
      (option, index) =>
        `<button type="button" class="seg-btn" aria-pressed="${index === 0}" data-metric="${option.metric}" data-head="${esc(option.head)}" data-note="${esc(option.note)}">${option.label}</button>`
    )
    .join('');
  return `<div class="seg-row"><div class="seg" role="group" aria-label="Drawing metric">${buttons}</div><span class="seg-note" id="metric-note">${esc(options[0].note)}</span></div>`;
}

// A cell with no product verdict means one of three things, and each asks for
// different work: nothing to do, fix the instrument, or go capture it. The
// swatches carry a stroke, a hatch, and a dashed outline so the three stay
// apart without colour.
function emptyLegend() {
  return `<div class="empty-legend"><b>Empty cells</b><span><i class="heat-cell not-applicable"></i><b>N/A by design</b>the check does not apply to this runtime</span><span><i class="heat-cell unscoreable"></i><b>Unavailable</b>this instrument or capture cannot score the cell; the tooltip says why</span><span><i class="heat-cell missing"></i><b>Missing</b>not captured yet — a gap to close</span></div>`;
}

function overviewLegend() {
  return `<div class="mx-legend"><b>Brush cells</b><span><i class="mx-cell cool"></i>≤ 0.75× gate</span><span><i class="mx-cell pass"></i>0.75–1×</span><span><i class="mx-cell warn"></i>1–1.5×</span><span><i class="mx-cell hot"></i>&gt; 1.5×</span><span><i class="mx-cell failed"></i>fails a drawing gate</span><span><i class="mx-cell unscoreable failed"></i>uncalibrated on a release-gate row: counts as red</span></div>
  ${emptyLegend()}
  <div class="mx-legend"><b>Undo</b><span>✓ pass · ✕ fail against the undo gates</span><b>Actions</b><span>passed/measured — green all pass, amber a few failing, red more than one in ten failing</span></div>`;
}

function noteDetails({ title, count = null, body, id = null, open = false }) {
  const countChip = count === null ? '' : `<span class="note-count">${count}</span>`;
  return `<details class="note"${id ? ` id="${id}"` : ''}${open ? ' open' : ''}><summary><h2>${title}</h2>${countChip}</summary><div class="note-body">${body}</div></details>`;
}

// The HTML twin of renderLostFrameExceptionsMarkdown: every cell held to
// something other than the single lost-frame gate, so a reader never has to
// infer an exemption from a passing number.
function lostFrameExceptionsHtml(exceptions) {
  const entries = Object.entries(exceptions);
  if (entries.length === 0) return '';
  const items = entries
    .map(([cell, { share, reason }]) => {
      const [targetId, brush] = cell.split(':');
      return `<li><b>${esc(BRUSH_LABELS[brush] ?? brush)} on <code>${esc(targetId)}</code></b> — ${fmtPercent(share)}. ${esc(reason)}</li>`;
    })
    .join('');
  return `<p><b>Lost-frame budget exceptions (ADR-0137).</b> Cells held to a different lost-frame budget, and why:</p><ul class="note-list">${items}</ul>`;
}

// The HTML twin of renderActionAllowancesMarkdown.
function actionAllowancesHtml(ledgers) {
  return (ledgers ?? [])
    .map((ledger) => {
      const entries = actionAllowanceEntries(ledger);
      if (entries.length === 0) return '';
      const items = entries
        .map(
          ({ label, statistic, ms, basis }) =>
            `<li><b>${esc(label)}</b> — ${esc(statistic)} ≤ ${fmt(ms)} ms. ${esc(basis)}</li>`
        )
        .join('');
      return `<p><b>Action allowances on <code>${esc(ledger.target)}</code> (${esc(ledger.adrs.join(', '))}).</b> Actions held to a measured allowance instead of the base post-action gates, and why; every target without a ledger scores them at the base gates:</p><ul class="note-list">${items}</ul>`;
    })
    .join('');
}

function scoringNotes(matrix) {
  const gates = matrix.gates;
  return `
    <p><b>Gates.</b> Drawing passes when blank-paper paint P95 ≤ ${gates.drawing.paintP95Ms} ms, P99 ≤ ${gates.drawing.paintP99Ms} ms, max ≤ ${gates.drawing.paintMaxMs} ms, and lost frame time stays under ${fmtPercent(gates.drawing.lostFrameTimeShare)} of in-contact time. Undo passes at engine P95 ≤ ${gates.undo.engineP95Ms} ms, next-frame P95 ≤ ${gates.undo.nextFrameP95Ms} ms, and next-frame max ≤ ${gates.undo.nextFrameMaxMs} ms. An action passes at first-frame P95 ≤ ${gates.actions.firstFrameP95Ms} ms, post-action frame P95 ≤ ${gates.actions.postActionFrameP95Ms} ms, and post-action frame max ≤ ${gates.actions.postActionFrameMaxMs} ms. A post-action max over its gate counts only when ${gates.actions.postActionFrameMaxConfirmingSamples} of the three scored repeats show it (ADR-0156); one breaching repeat renders as a warning, not a failure. Ready P95 appears in tooltips but is not gated: its completion semantics differ per action, so a frame-gate pass says nothing about end-to-end response time.</p>
    ${lostFrameExceptionsHtml(gates.drawing.lostFrameTimeShareExceptions ?? {})}
    ${actionAllowancesHtml(gates.actions.postActionAllowances)}
    <p><b>Release roles (ADR-0156).</b> ${ROLE_SECTIONS.map(({ title, rule }) => `<b>${esc(title)}:</b> ${esc(rule)}`).join(' ')} A row’s role follows the hardware it ran on, not its fidelity class; the chip on a release-gate row says whether its drawing instrument is calibrated or the row is a gate-in-waiting.</p>
    <p><b>Empty cells.</b> A cell without a product verdict renders one of three ways. A single struck stroke is N/A by design: the check does not apply to that runtime. A diagonal hatch is unavailable: the capture exists but cannot be scored, because it failed an input-fidelity check, was measured at a refresh rate this target is not scored against, has a failed idle control, or is preserved evidence with no current verdict. A dashed, empty outline is missing: nothing valid was captured, so it is a gap to close. Every tooltip names the reason.</p>
    <p><b>The idle-frame control.</b> Every action sweep includes a control sample that performs no interaction, proving the target can hold frames at rest. When the control fails its own gate the host was dropping frames on its own, so none of that mode’s action scores can be attributed to the app: the mode is marked “no control” and left out of the failure ranking.</p>
    <p><b>One capture per cell.</b> Most drawing cells have one capture behind them; each tooltip states the count. A result close to a limit needs repeat captures before it is trusted either way (ADR-0136).</p>
    <p><b>Focused action captures.</b> Sources are applied in their listed order within each mode. A focused capture replaces only its named actions and requires a full sweep from the same product commit; anything else is refused. Raw drawing tables and action samples are re-scored with the current metric definitions whenever this report is regenerated — stored verdicts are not trusted. A struck action cell is N/A under the action plan that mode’s product surface declared; a dashed one is missing, and both tooltips keep the reason.</p>
    <p><b>Rotation first frames on iPad Safari</b> are N/A rather than gated: under ADR-0142’s resize anchor the value reads 0–2 ms by construction, so rotation there is scored by the post-action frame gates alone.</p>`;
}

function renderCandidateActionsHtml(candidateActions) {
  if (!candidateActions.length) return '';
  const rows = candidateActions
    .map(
      (candidate) =>
        `<tr><td><b>${esc(candidate.priority)}</b></td><td><b>${esc(candidate.action)}</b></td><td>${esc(candidate.rationale)}</td><td>${esc(candidate.applicability ?? '—')}</td><td>${esc(candidate.status ?? '—')}</td></tr>`
    )
    .join('');
  return noteDetails({
    title: 'Candidate actions',
    count: candidateActions.length,
    body: `<p>Additional scenarios and their remaining coverage.</p><div class="provenance candidate-actions"><table><thead><tr><th>Priority</th><th>Action</th><th>Rationale</th><th>Applicability</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  });
}

function renderReport(matrix) {
  const rows = modeRows(matrix);
  const capturedTargetCount = matrix.targets.filter((target) =>
    target.modes.some((mode) => mode.status === 'captured')
  ).length;
  const capturedModeCount = rows.filter((row) => row.status === 'captured').length;
  const actionCount = (matrix.actionLabels ?? comparableActionLabels(rows)).length;
  const limitations = [...(matrix.limitations ?? []), ...preservedEvidenceNotes(matrix)];
  const stats = `<span class="chip"><b>${capturedTargetCount}/${matrix.targets.length}</b> targets captured</span><span class="chip"><b>${capturedModeCount}/${rows.length}</b> modes captured</span><span class="chip"><b>${actionCount}</b> action${actionCount === 1 ? '' : 's'} measured</span>`;
  const header = masthead({
    title: 'Deployment-target performance matrix',
    tagline:
      'Drawing, undo, and interface-action frame timing across every deployment target, in four display modes each.',
    home: '../../index.html',
    crumbs: [{ label: 'Performance', href: '../' }, { label: matrix.recordedOn }],
    stats,
  });
  const preservedTargetCount = matrix.targets.filter((target) =>
    target.modes.some((mode) => mode.preservedSections?.length)
  ).length;
  const preservedSentence = preservedTargetCount
    ? ` ${preservedTargetCount} of ${matrix.targets.length} targets are marked “Earlier capture”: their results are preserved from an earlier campaign, not re-measured here — Commit provenance lists their source commits.`
    : '';
  const ranked = rankedActionFailures(matrix);
  const rankedCard = ranked
    ? `<section class="rank-card"><h3>Actions failing in the most modes</h3><p class="rank-scope">Counted across all scoreable modes — the row filters above do not change this list.</p><ol class="rank-list">${ranked}</ol></section>`
    : '';
  const body = `${header}
${modeToolbar(rows.length)}
<main><div class="shell">
  <p class="matrix-intro">Product commit ${commitCode(matrix.productCommit)}, captured ${esc(matrix.recordedOn)}.${preservedSentence} ${esc(releaseGateSentence(matrix))}</p>
  <div class="matrix-links"><span>Data:</span><a href="data.json">normalized results JSON</a><a href="index.md">Markdown report</a><a href="sources.json">source manifest</a></div>

  <div class="section-head" id="results"><h2>Results by target</h2><span class="desc">Four modes per target · hover or tap any cell for the numbers behind it</span></div>
  ${metricSwitcher(matrix.gates.drawing)}
  ${overviewLegend()}
  ${overviewMatrix(matrix)}
  <p class="mx-note">Most drawing cells aggregate a single capture, so treat a result close to its limit as provisional; each tooltip states the cell’s capture count.</p>

  <div class="section-head" id="actions"><h2>Discrete actions</h2><span class="desc">${actionCount} action columns · coverage varies by mode · color is the worst of first-frame P95, post-action P95, and post-action max against its gate</span></div>
  <div class="heat-legend"><span><i class="heat-cell cool"></i>≤ 0.75× gate</span><span><i class="heat-cell pass"></i>0.75–1×</span><span><i class="heat-cell warn"></i>1–1.5×</span><span><i class="heat-cell hot"></i>&gt; 1.5×</span><span><i class="heat-cell unconfirmed"></i>pass, max over gate in one repeat</span><span class="heat-hint">The grid scrolls both ways · arrow keys step through cells</span></div>
  ${emptyLegend()}
  ${actionHeatmap(matrix)}
  ${rankedCard}

  <div class="section-head" id="notes"><h2>Notes and method</h2><span class="desc">What the cells do and do not claim</span></div>
  ${noteDetails({ title: 'Capture limitations', count: limitations.length, body: `<ul class="note-list">${limitations.map((limitation) => `<li>${esc(limitation)}</li>`).join('')}</ul>` })}
  ${noteDetails({ title: 'How scoring works', body: scoringNotes(matrix) })}
  ${renderCandidateActionsHtml(matrix.candidateActions ?? [])}
  ${noteDetails({ title: 'Undo timing per mode', body: `<p>Engine time is the state rollback alone; next-frame adds the following rendered frame. Gates: engine P95 ≤ ${matrix.gates.undo.engineP95Ms} ms, next-frame P95 ≤ ${matrix.gates.undo.nextFrameP95Ms} ms, next-frame max ≤ ${matrix.gates.undo.nextFrameMaxMs} ms.</p><div class="provenance"><table><thead><tr><th>Target</th><th>Engine P95</th><th>Next P95</th><th>Next max</th><th>Gate</th></tr></thead><tbody>${undoTable(matrix)}</tbody></table></div>` })}
  ${noteDetails({ title: 'Commit provenance', id: 'provenance', body: `<p>The product commit each cell’s evidence was captured at. “Actions at final commit” counts the action rows measured at this campaign’s final product commit.</p><div class="provenance"><table><thead><tr><th>Target</th><th>Drawing</th><th>Undo</th><th>Actions at final commit</th><th>Action source commits</th></tr></thead><tbody>${provenanceTable(matrix)}</tbody></table></div>` })}
</div></main>
${siteFooter({ home: '../../index.html' })}
<script>${PAGE_SCRIPT}</script>`;
  return page({
    title: `Deployment performance — ${matrix.recordedOn}`,
    extraCss: EXTRA_CSS,
    body,
  });
}

// The staleness check runs IN PROCESS against the manifest this run resolved, not
// as a shell chain. npm appends forwarded arguments to the end of a compound
// command, so `gen:performance-matrix -- <manifest>` handed the path to the
// checker and generated the DEFAULT manifest — exiting 0 having verified a
// different file than it wrote.
// dprint owns Markdown in this repo (ADR-0057), and its wrapping is not something
// a renderer can be hand-tuned to match — every prose edit here would otherwise
// have to reproduce the formatter's line breaks exactly. Formatting the emitted
// file makes a regenerate idempotent against `dprint check`, so rebuilding the
// report cannot be what turns CI red.
function formatGeneratedMarkdown(path) {
  // dprint's configured includes cover the repo, so a report generated outside it
  // — a test fixture, an ad-hoc manifest in a temp directory — has no formatter to
  // answer for and is left as rendered. Inside the repo the formatting IS the
  // contract, so a failure there is fatal rather than skipped.
  const insideRepo = !relative(ROOT, path).startsWith('..');
  if (!insideRepo) return;
  const result = spawnSync('npx', ['dprint', 'fmt', path], { cwd: ROOT, stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(
      `dprint could not format ${relative(ROOT, path)}: ${result.stderr?.toString().trim()}`
    );
  }
}

// The manifest stays positional; `--strict` is the only flag, so the manifest is
// the first argument that is not one.
const positionalArguments = () => process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

export async function generateDeploymentMatrixReport(
  manifestArg = positionalArguments()[0],
  { strict = process.argv.includes('--strict') } = {}
) {
  const manifestPath = manifestArg
    ? isAbsolute(manifestArg)
      ? manifestArg
      : join(ROOT, manifestArg)
    : DEFAULT_MANIFEST;
  const outputDir = dirname(manifestPath);
  const matrix = normalizeMatrix(readJson(manifestPath), outputDir);
  writeFileSync(join(outputDir, 'data.json'), `${JSON.stringify(matrix, null, 2)}\n`);
  writeFileSync(join(outputDir, 'index.md'), renderMarkdown(matrix));
  writeFileSync(join(outputDir, 'index.html'), renderReport(matrix).replace(/[ \t]+$/gm, ''));
  formatGeneratedMarkdown(join(outputDir, 'index.md'));
  console.log(`Wrote ${relative(ROOT, join(outputDir, 'data.json'))}`);
  console.log(`Wrote ${relative(ROOT, join(outputDir, 'index.md'))}`);
  console.log(`Wrote ${relative(ROOT, join(outputDir, 'index.html'))}`);

  await checkMatrixStaleness({ manifestPath: relative(ROOT, manifestPath), strict });
}

if (isMain(import.meta.url)) runMain(generateDeploymentMatrixReport);

export { mergeActionResults, normalizeMatrix, renderMarkdown, renderReport };
