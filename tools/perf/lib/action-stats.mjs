import { percentile } from './real-screen-stats.mjs';

export const ACTION_FRAME_P95_GATE_MS = 20;
// Documented per-action exceptions to the P95 gate for the calibrated
// physical-iOS capture ONLY (ADR-0090's amendment) — each a measured,
// accepted residual rather than a loosened default, and never applied by
// default: the scorer takes allowances as an argument, the iOS harness
// passes this ledger and records it into its capture as `gateAllowances`,
// and every other target (desktop, Android, and matrix re-summaries of
// captures that carry no metadata) stays on the base gates. 'open Settings'
// presents a prewarmed pane (ADR-0049 amendment; PR #1124): its open carries
// exactly two ~21-25 ms frames that no hidden state can prepay — the
// showModal flip itself, and the heaviest section's staged reveal — while
// its worst frame halved against the tap-mount baseline (25 ms vs the base's
// 47 ms) and the mid-animation 41-45 ms paint stalls were eliminated.
// Measured on the physical iPad (iPadOS 26.5, 120 Hz). A regression past an
// allowance still fails.
const IOS_ACTION_FRAME_P95_ALLOWANCES_MS = {
  'open Settings': 26,
};
// Two exact 60 Hz vsync intervals are 33.33 ms; the next interval is the visible 50 ms freeze.
export const ACTION_FRAME_MAX_GATE_MS = 33.5;
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
const IOS_ACTION_FRAME_MAX_ALLOWANCES_MS = {
  'open Settings': 56,
};
// What the iOS harness passes and records: both ledgers, keyed by statistic.
// A capture predating the split stored the flat P95 map; the scorer's
// normalizer keeps those artifacts scoring exactly as they did.
export const IOS_ACTION_GATE_ALLOWANCES = {
  p95: IOS_ACTION_FRAME_P95_ALLOWANCES_MS,
  max: IOS_ACTION_FRAME_MAX_ALLOWANCES_MS,
};

// Both allowance shapes reach the scorer: the structured {p95, max} ledgers
// above, and the flat per-label P95 map every artifact recorded before the
// max ledger existed (the matrix re-summarizes from the ARTIFACT's stored
// gateAllowances, so the legacy shape must keep scoring as it always did —
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

export function scoredActionFrameGaps(action) {
  if (!action.postActionFrames) {
    return action.postActionFrameGapsMs ?? action.frameGapsMs ?? [];
  }

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

    scored.push(frame.gapMs);
    if (frame.visualEffectsActive || frame.gapMs > ACTION_FRAME_MAX_GATE_MS) {
      settleFramesRemaining = ACTION_SETTLE_TAIL_FRAMES;
    } else {
      settleFramesRemaining--;
    }
  }
  return scored;
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
  const passed =
    scoredActions.length >= minimumSamples &&
    activation.passed &&
    (firstFrameNa || firstFrame.p95 <= ACTION_FIRST_FRAME_GATE_MS) &&
    frames.p95 <= (gate.p95[label] ?? ACTION_FRAME_P95_GATE_MS) &&
    frames.max <= (gate.max[label] ?? ACTION_FRAME_MAX_GATE_MS);
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
    verdict: summary.passed ? 'PASS' : 'FAIL',
  }));
}

export function actionFailures(summaries) {
  return summaries.filter((summary) => !summary.passed);
}
