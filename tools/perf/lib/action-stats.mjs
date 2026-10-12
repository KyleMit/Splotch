import { compactSettingsActionLabel } from './action-applicability.mjs';
import { frameStampDivergence } from './frame-stamps.mjs';
import { percentile } from './real-screen-stats.mjs';

export const ACTION_FRAME_P95_GATE_MS = 20;
// Documented per-action exceptions to the P95 gate for the calibrated
// physical-iOS capture (ADR-0090's amendment, extended by ADR-0160) — each a
// measured, accepted residual rather than a loosened default, and never
// applied by default: the scorer takes allowances as an argument, the iOS
// harness passes this ledger and records it into its capture as
// `gateAllowances`, the matrix generator applies it by target id through
// ACTION_GATE_ALLOWANCE_LEDGERS below, and every target without a ledger of
// its own (desktop, the native shells, every simulator and emulator) stays on
// the base gates. Every entry is sized one rounding quantum above the worst
// committed single capture of its cell (ADR-0137's worst-single-capture rule;
// Safari's rAF clock resolves to whole milliseconds), never above a median,
// and only ratchets down — raising one needs the same evidence as adding it.
// `basis` is rendered into the matrix beside the gates so a passing cell
// never has to be read as a base-gate pass; the full measured tables, the
// trace attribution, and each entry's reopen condition are in ADR-0160.
// Measured on the physical iPad (iPadOS 26.5, 120 Hz). A regression past an
// allowance still fails.
const IOS_ACTION_FRAME_P95_ALLOWANCES = {
  'open Settings': {
    ms: 29,
    basis:
      'Worst committed P95 28 ms (perf-profiles/evidence/2026-09-05-epic-1567-advanced-controls-certification, ' +
      'landscape/dark at ebc7673b), 27 ms in six further September 2026 captures across three modes at ' +
      '3c017796, 9af487b3 and e5142fab, 20-26 ms in eleven more. The pane is prewarmed (ADR-0049 amendment) and its open still ' +
      'carries the showModal flip and the heaviest section reveal; Instruments aligns the remaining slow ' +
      'frames with animation completion, compositing-hierarchy changes, layer removal and paint, and the ' +
      'bounded `contain: layout paint` candidate measured negative. Raised from the 26 ms of ADR-0090 under ADR-0160.',
  },
  'close Settings': {
    ms: 22,
    basis:
      'Worst committed P95 21 ms in three captures (perf-profiles/evidence/2026-09-05-epic-1567-ipad-e514-control ' +
      'landscape/light and landscape/dark; 2026-09-05-epic-1567-ipad-paper-control portrait/light), 17-20 ms in ' +
      'fifteen others. The same dialog retirement over a full-screen paper layer as the coloring picker; it ' +
      'carries no dedicated trace, so ADR-0160 records the attribution as shared and the reopen condition as its own.',
  },
  'select coloring page': {
    ms: 30,
    basis:
      'Worst committed P95 29 ms (perf-profiles/evidence/2026-09-05-epic-1567-landscape-retirement-controls, ' +
      'landscape/dark at e5142fab), 26-28 ms in eight further captures, portrait/light green at 17. The 29 ms ' +
      'frame sampled in Instruments is GPU-process IOSurface pool eviction, surface creation and Metal ' +
      'submission with no app evaluation in-frame; seven bounded product mechanisms measured negative or ' +
      'insufficient (issue 1569, 2026-09-06 disposition).',
  },
  'switch light theme to dark': {
    ms: 23,
    basis:
      'Worst committed P95 22 ms (perf-profiles/evidence/2026-09-05-epic-1567-ipad-e514-control, ' +
      'portrait/light), 17 ms in fifteen other captures. A single-capture excursion sized by ADR-0137 ' +
      'worst-single-capture rule: the full-document restyle recomposites every layer in one frame (ADR-0087).',
  },
  [inkRotationActionLabel('PORTRAIT', 'LANDSCAPE')]: {
    ms: 26,
    basis:
      'Worst committed P95 25 ms in two captures (perf-profiles/evidence/2026-09-05-epic-1567-ipad-paper-control, ' +
      'portrait/light at 141288da), 22-24 ms in four others; the landscape-origin direction reads 17-18. The slow ' +
      'frame is the first full post-resize interval of the OS rotation; the aligned trace holds GPU surface-pool ' +
      'eviction and command submission beside WebContent layout, and paper-sheet compositor pre-promotion measured ' +
      'negative. Supersedes ADR-0156 decision 5 for this direction only; the 33.5 ms max gate stays.',
  },
};
const IOS_ACTION_FRAME_P95_ALLOWANCES_MS = Object.fromEntries(
  Object.entries(IOS_ACTION_FRAME_P95_ALLOWANCES).map(([label, { ms }]) => [label, ms])
);
// Two exact 60 Hz vsync intervals are 33.33 ms; the next interval is the visible 50 ms freeze.
export const ACTION_FRAME_MAX_GATE_MS = 33.5;
// A matrix cell is one capture of three scored repeats, and a single two-beat
// frame in one of them is what chance produces (ADR-0137; the physical iPad's
// `clear drawing` read 37 ms max on one mode and 17-21 on the other three at
// one commit). A max breach is therefore confirmed only when at least this many
// scored samples of the group breach it (ADR-0156). Pooled P95 cannot stand in:
// one 33 ms frame per repeat is 3 of ~120 gaps and never reaches it, so the
// max is what catches a hitch that recurs on every activation - and it must
// recur to count. A group without warm-up metadata (one bare sample) keeps the
// direct rule.
export const MAX_BREACH_CONFIRMING_SAMPLES = 2;
// The max-frame counterpart, same rules (calibrated physical-iOS capture
// ONLY, recorded into the capture, never a default). 'open Settings' has
// breached the max gate at 44-55 ms on every theme-focused automated run
// since 2026-08-17, identically at base and branch, while its post-open P95
// stayed inside the 26 ms allowance. The attribution (issue 1130, ADR-0090's
// 2026-08-26 amendment) is a NARROWING, not an acquittal: no WebContent
// main-thread saturation (Time Profiler) and zero WebContent hitches with
// every hitch on the automation overlay stack (Animation Hitches) — but the
// trace attributes per layer, so it cannot separate overlay cost from
// app-triggered composition, and the real-finger control was confounded by
// the persistent AutomationModeUI overlay. This is therefore a
// CAPTURE-ENVIRONMENT allowance with a recorded reopen condition: a
// clean-device control (overlay verifiably absent) that still shows the
// frame converts it to a product finding and retires this entry. 56 covers
// the observed three-beat frame (3 x 16.7 = 50 ms) plus scheduling jitter; a
// genuine product regression past it still fails.
const IOS_ACTION_FRAME_MAX_ALLOWANCES = {
  'open Settings': {
    ms: 56,
    basis:
      'Capture-environment allowance (issue 1130, ADR-0090 2026-08-26 amendment): every hitch under the ' +
      '44-55 ms open-Settings frame lands on the automation overlay stack with zero WebContent hitches, but ' +
      'the trace attributes per layer and the real-finger control was confounded by the persistent ' +
      'AutomationModeUI overlay. Covers the observed three-beat frame plus jitter; a clean-device control ' +
      'that still shows the frame retires it.',
  },
};
const IOS_ACTION_FRAME_MAX_ALLOWANCES_MS = Object.fromEntries(
  Object.entries(IOS_ACTION_FRAME_MAX_ALLOWANCES).map(([label, { ms }]) => [label, ms])
);
// What the iOS harness passes and records: both ledgers, keyed by statistic.
// A capture predating the split stored the flat P95 map; the scorer's
// normalizer keeps those artifacts scoring exactly as they did.
export const IOS_ACTION_GATE_ALLOWANCES = {
  p95: IOS_ACTION_FRAME_P95_ALLOWANCES_MS,
  max: IOS_ACTION_FRAME_MAX_ALLOWANCES_MS,
};
// The same ledgers with each entry's measured basis, for the matrix to render
// beside its gates (ADR-0137's mitigation: an exemption is shown, never inferred).
export const IOS_ACTION_GATE_ALLOWANCE_ENTRIES = {
  p95: IOS_ACTION_FRAME_P95_ALLOWANCES,
  max: IOS_ACTION_FRAME_MAX_ALLOWANCES,
};

// The physical Android phone's ledger (ADR-0162): one entry, the theme token
// flip taken from the compact Settings shell, measured on the SM-G990U1 in
// Chrome over direct CDP at a verified 60 Hz pin (ADR-0143). Sized by the same
// worst-committed-single-capture rule as the iPad ledger, in this probe's own
// quantum: Chrome's rAF clock resolves to 0.1 ms where Safari's is whole
// milliseconds, so one step above the worst committed 33.4 ms reading is
// 33.5 — the max gate itself, and the two coincide on purpose. Three scored
// repeats pool about 52 gaps, so the P95 is the third-highest and a P95 past
// 33.5 needs three over-gate gaps; spread one per repeat (every committed
// two-beat reading) the max gate confirms the breach on its own (ADR-0156),
// and concentrated in one repeat only this allowance fails the cell. It is at
// least as strict as the max gate on every three-repeat capture and never
// passes a cell the max gate would fail; 34 ms would pass the concentrated
// case. The enable direction and every other Android action stay on the base
// gate.
const ANDROID_WEB_ACTION_FRAME_P95_ALLOWANCES = {
  [`disable ${compactSettingsActionLabel('Night Mode')}`]: {
    ms: 33.5,
    basis:
      'Worst committed P95 33.4 ms (perf-profiles/evidence/2026-09-06-issue-1696-android-night-toggle, ' +
      'landscape/dark full-plan control at f42d0994, two beats in all three scored repeats), 33.3 ms in the ' +
      'e5142fab row capture (perf-profiles/evidence/2026-09-06-epic-1567-android-device-web-e514, ' +
      'landscape/dark) and once in landscape/light (perf-profiles/evidence/2026-09-05-epic-1567-night-mode-control-trace ' +
      'at a9438fc7); 16.7-17.1 ms in ten other captures of the same cell. The paired Chrome trace (issue 1696) ' +
      "puts the click's input task at 26-39 ms on CrRendererMain in every repeat — 9-12 ms of dispatch and a " +
      '9.5-14.7 ms whole-document style recalc for the theme token flip that the bounded closed-dialog treatment ' +
      '(PR 1702) did not move — with a DroppedFrame at the first BeginFrame after every click. One 0.1 ms clock ' +
      'quantum above the worst reading and equal to the max gate, so a P95 past it needs three over-gate gaps: ' +
      'spread across repeats the max gate confirms them, concentrated in one repeat this allowance alone fails them.',
  },
};
const ANDROID_WEB_ACTION_FRAME_P95_ALLOWANCES_MS = Object.fromEntries(
  Object.entries(ANDROID_WEB_ACTION_FRAME_P95_ALLOWANCES).map(([label, { ms }]) => [label, ms])
);
export const ANDROID_WEB_ACTION_GATE_ALLOWANCES = {
  p95: ANDROID_WEB_ACTION_FRAME_P95_ALLOWANCES_MS,
  max: {},
};
export const ANDROID_WEB_ACTION_GATE_ALLOWANCE_ENTRIES = {
  p95: ANDROID_WEB_ACTION_FRAME_P95_ALLOWANCES,
  max: {},
};

// The shipped release-gate policy by matrix target id, keyed exactly as
// ADR-0137's lost-frame exceptions are: the calibrated iPad web row and the
// physical Android web row each score under their own ledger, every other row
// on the base gates. The generator applies this rather than an artifact's
// recorded `gateAllowances` so a policy change re-scores every published cell
// on regeneration and the regeneration diff is the record (ADR-0160); the
// recorded field stays the capture-time verdict's provenance. `adrs` names
// the records that grant each ledger, rendered beside it and in each allowed
// cell's verdict.
export const ACTION_GATE_ALLOWANCE_LEDGERS = {
  'ipad-device-web': {
    adrs: ['ADR-0090', 'ADR-0160'],
    allowances: IOS_ACTION_GATE_ALLOWANCES,
    entries: IOS_ACTION_GATE_ALLOWANCE_ENTRIES,
  },
  'android-device-web': {
    adrs: ['ADR-0162'],
    allowances: ANDROID_WEB_ACTION_GATE_ALLOWANCES,
    entries: ANDROID_WEB_ACTION_GATE_ALLOWANCE_ENTRIES,
  },
};

export function actionGateAllowancesFor(targetId) {
  return Object.hasOwn(ACTION_GATE_ALLOWANCE_LEDGERS, targetId)
    ? ACTION_GATE_ALLOWANCE_LEDGERS[targetId].allowances
    : {};
}

// Both allowance shapes reach the scorer: the structured {p95, max} ledgers
// above, and the flat per-label P95 map every artifact recorded before the
// max ledger existed (a capture-time verdict re-summarized from the
// ARTIFACT's stored gateAllowances must keep scoring as it always did —
// P95 allowance applied, max gate base).
function normalizedAllowances(allowances) {
  if (allowances && (allowances.p95 || allowances.max)) {
    return { p95: allowances.p95 ?? {}, max: allowances.max ?? {} };
  }
  return { p95: allowances ?? {}, max: {} };
}
export const ACTION_FIRST_FRAME_GATE_MS = 33.5;
export const WARMUP_REPEATS = 1;
export const MIN_GATED_SAMPLES = 3;
// Four ordinary callbacks confirm that presentation recovered without reaching late static gaps.
export const ACTION_SETTLE_TAIL_FRAMES = 4;

// The orientation-change label vocabulary, owned here so the sweep that builds
// the labels and the matcher that recognizes them cannot drift apart — a
// renamed label would otherwise silently fail the N/A open, restoring the
// structurally-zero pass it exists to remove.
export function rotationActionLabel(from, to) {
  return `${from} to ${to} rotation`;
}

// The with-ink rotation label, owned here for the same reason: the sweep
// that measures it and the allowance ledger that names it must agree.
export function inkRotationActionLabel(from, to) {
  return `with ink: ${rotationActionLabel(from, to)}`;
}

// Orientation-change measurements only. The click actions taken after a
// rotation ("undo clear after blank rotation") share the bare " rotation"
// suffix and must stay gated, so the orientation vocabulary is part of the
// match; the vocabulary is closed by the two orientations the sweep drives.
const ROTATION_ACTION_LABEL = new RegExp(
  ` (?:${rotationActionLabel('PORTRAIT', 'LANDSCAPE')}|${rotationActionLabel('LANDSCAPE', 'PORTRAIT')})$`
);

// On iPad Safari the rotation first-frame gate is structurally inert under
// ADR-0142's `resize` anchor: Safari dispatches `resize` inside the same
// rendering turn whose rAF timestamp the probe records, so firstFrameMs reads
// 0-2 ms by construction and the gate cannot discriminate. The honest verdict
// is not-applicable, mirroring ADR-0139's refusal of checks that silently pass
// — the post-action frame gates carry the rotation signal there.
//
// Applicability keys on the CAPTURE RUNTIME (ADR-0139's per-runtime key), not
// the artifact's `transport`: `transport: "browser"` is the Appium web
// transport generally — Android Chrome over Appium and the iPad Simulator
// record it too — and Android Chrome is exactly the runtime ADR-0142 says must
// keep the gate (0.1-54 ms of real post-resize dynamic range). The native
// WKWebView keeps it too: its first `resize` precedes committed layout, a real
// if pre-layout reading.
//
// The desktop runner drives one runtime (`desktop-playwright`) across three
// engines, and the engine decides where the `resize` dispatch sits relative to
// the rendering turn — so desktop applicability needs the ENGINE beside the
// runtime. Declared per engine from the local measurements in
// perf-profiles/evidence/2026-08-25-desktop-rotation-first-frames/ (ADR-0142's
// second amendment). The discriminator is the sub-1 ms share of scored
// rotation first frames — WebKit 31/32, Firefox 11/32, Chromium 2/32 — since
// Playwright WebKit reports whole-millisecond timestamps and an exactly-zero
// comparison across engines would compare clocks: WebKit shares Safari's
// engine construction and cannot plausibly reach the 33.5 ms gate, while
// Chromium (two sub-1 ms samples, the rest 3.3-8.0 ms) and Firefox (bimodal to
// 9.5 ms) carry real dynamic range and stay gated. An engine absent from the
// set — and every non-desktop caller, which passes no engine — keeps the gate.
// Exported only for the declaration-pin test, which fails a drive-by addition
// that carries no measured corpus.
export const ROTATION_INERT_DESKTOP_ENGINES = new Set(['webkit']);

export function rotationFirstFrameNa(captureRuntime, label, desktopEngine = null) {
  if (!ROTATION_ACTION_LABEL.test(label)) return false;
  if (captureRuntime === 'ios-safari') return true;
  return (
    captureRuntime === 'desktop-playwright' && ROTATION_INERT_DESKTOP_ENGINES.has(desktopEngine)
  );
}

const maximum = (values) => (values.length ? Math.max(...values) : undefined);

function distribution(values) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: maximum(values),
  };
}

function finiteValues(actions, field) {
  return actions.map((action) => action[field]).filter(Number.isFinite);
}

function actionActivated(action) {
  if (action.eventType === 'uncaptured') return false;
  if (action.activation === 'native-touch') return action.trusted === true;
  if (action.activation === 'webdriver-element-click') return true;
  if (!action.activation && action.eventType === 'click') return true;
  return action.trusted !== false;
}

function activityTimes(action) {
  const times = [0];
  for (const activity of action.activities ?? []) {
    if (Number.isFinite(activity.atFromActionMs)) times.push(activity.atFromActionMs);
  }
  for (const mutation of action.canvasMutations ?? []) {
    if (Number.isFinite(mutation.atFromActionMs)) times.push(mutation.atFromActionMs);
  }
  for (const measure of action.measures ?? []) {
    if (measure.name.startsWith('action:')) continue;
    if (Number.isFinite(measure.startFromActionMs)) times.push(measure.startFromActionMs);
    if (Number.isFinite(measure.startFromActionMs) && Number.isFinite(measure.duration)) {
      times.push(measure.startFromActionMs + measure.duration);
    }
  }
  return times.filter((time) => time >= 0).sort((left, right) => left - right);
}

// The action-owned frames of one sample — every frame inside a window opened
// by action-owned activity, a visual effect, or an over-gate gap, and the
// settle tail after it. Selection reads only the scheduled channel (`gapMs`),
// so which frames are scored is the same whether or not a frame carries the
// actual clock (ADR-0163).
function scoredActionFrames(action) {
  if (!action.postActionFrames) return [];

  const activities = activityTimes(action);
  const scored = [];
  let activityIndex = 0;
  let settleFramesRemaining = 0;
  for (const frame of action.postActionFrames) {
    let actionOwnedActivity = false;
    while (
      activityIndex < activities.length &&
      activities[activityIndex] <= frame.endFromActionMs
    ) {
      actionOwnedActivity = true;
      activityIndex++;
    }
    if (actionOwnedActivity || frame.visualEffectsActive) {
      settleFramesRemaining = ACTION_SETTLE_TAIL_FRAMES;
    }
    if (settleFramesRemaining === 0) continue;

    scored.push(frame);
    if (frame.visualEffectsActive || frame.gapMs > ACTION_FRAME_MAX_GATE_MS) {
      settleFramesRemaining = ACTION_SETTLE_TAIL_FRAMES;
    } else {
      settleFramesRemaining--;
    }
  }
  return scored;
}

export function scoredActionFrameGaps(action) {
  if (!action.postActionFrames) {
    return action.postActionFrameGapsMs ?? action.frameGapsMs ?? [];
  }
  return scoredActionFrames(action).map((frame) => frame.gapMs);
}

export function summarizeActionGroup(actions, label, allowances = {}, firstFrameNaFor = null) {
  const hasWarmupMetadata = actions.some((action) => typeof action.warmup === 'boolean');
  const scoredActions = hasWarmupMetadata ? actions.filter((action) => !action.warmup) : actions;
  const frameGaps = scoredActions.flatMap(scoredActionFrameGaps);
  const rawFrameGaps = scoredActions.flatMap(
    (action) => action.postActionFrameGapsMs ?? action.frameGapsMs ?? []
  );
  const firstFrameNa = firstFrameNaFor?.(label) === true;
  const firstFrame = {
    ...distribution(finiteValues(scoredActions, 'firstFrameMs')),
    ...(firstFrameNa ? { na: true } : {}),
  };
  const ready = distribution(finiteValues(scoredActions, 'readyMs'));
  const frames = {
    ...distribution(frameGaps),
    raw: distribution(rawFrameGaps),
  };
  const activation = {
    captured: actions.filter((action) => action.eventType !== 'uncaptured').length,
    valid: actions.filter(actionActivated).length,
  };
  activation.passed = activation.valid === actions.length;
  const minimumSamples = hasWarmupMetadata ? MIN_GATED_SAMPLES : 1;
  const gate = normalizedAllowances(allowances);
  const maxGate = gate.max[label] ?? ACTION_FRAME_MAX_GATE_MS;
  const maxBreachSamples = scoredActions.filter((action) =>
    scoredActionFrameGaps(action).some((gapMs) => gapMs > maxGate)
  ).length;
  const maxBreachConfirmed =
    hasWarmupMetadata && scoredActions.length >= MIN_GATED_SAMPLES
      ? maxBreachSamples >= MAX_BREACH_CONFIRMING_SAMPLES
      : frames.max > maxGate;
  frames.maxBreachSamples = maxBreachSamples;
  frames.maxUnconfirmed = !maxBreachConfirmed && frames.max > maxGate;
  const passed =
    scoredActions.length >= minimumSamples &&
    activation.passed &&
    (firstFrameNa || firstFrame.p95 <= ACTION_FIRST_FRAME_GATE_MS) &&
    frames.p95 <= (gate.p95[label] ?? ACTION_FRAME_P95_GATE_MS) &&
    !maxBreachConfirmed;
  // Informational only, and absent from a legacy group so its summary keeps
  // the exact shape it always had (tools/perf/tests/action-frame-stamps.test.mjs
  // holds the committed corpus to that byte for byte).
  const frameStamps = frameStampDivergence(scoredActions.flatMap(scoredActionFrames), maxGate);
  return {
    count: scoredActions.length,
    totalCount: actions.length,
    activation,
    firstFrame,
    ready,
    frames,
    frameSamples: {
      scored: frameGaps.length,
      raw: rawFrameGaps.length,
    },
    ...(frameStamps ? { frameStamps } : {}),
    passed,
  };
}

export function summarizeActions(
  actions,
  expectedLabels = [],
  allowances = {},
  firstFrameNaFor = null
) {
  const groups = new Map();
  for (const action of actions) {
    const entries = groups.get(action.label) ?? [];
    entries.push(action);
    groups.set(action.label, entries);
  }
  for (const label of expectedLabels) {
    if (!groups.has(label)) groups.set(label, []);
  }
  return [...groups.entries()].map(([label, entries]) => ({
    label,
    ...summarizeActionGroup(entries, label, allowances, firstFrameNaFor),
  }));
}

export function actionRows(summaries) {
  return summaries.map((summary) => ({
    action: summary.label,
    runs: `${summary.count}/${summary.totalCount}`,
    activation: `${summary.activation.valid}/${summary.totalCount}`,
    'first p95': summary.firstFrame.na === true ? 'n/a' : summary.firstFrame.p95,
    'ready seen p50': summary.ready.p50,
    'ready seen p95': summary.ready.p95,
    'post p95': summary.frames.p95,
    'post max': summary.frames.max,
    'raw max': summary.frames.raw.max,
    'scored/raw frames': `${summary.frameSamples.scored}/${summary.frameSamples.raw}`,
    // The actual-clock channel beside the scored one (ADR-0163): attribution,
    // never part of the verdict.
    'actual p95': summary.frameStamps?.actual.p95 ?? 'n/a',
    'hidden overruns': summary.frameStamps?.hiddenOverruns ?? 'n/a',
    verdict: summary.passed ? 'PASS' : 'FAIL',
  }));
}

export function actionFailures(summaries) {
  return summaries.filter((summary) => !summary.passed);
}
