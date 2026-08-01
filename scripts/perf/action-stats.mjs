import { percentile } from './real-screen-stats.mjs';

export const ACTION_FRAME_P95_GATE_MS = 20;
// Two exact 60 Hz vsync intervals are 33.33 ms; the next interval is the visible 50 ms freeze.
export const ACTION_FRAME_MAX_GATE_MS = 33.5;
export const ACTION_FIRST_FRAME_GATE_MS = 33.5;
// Four ordinary callbacks confirm that presentation recovered without reaching late static gaps.
export const ACTION_SETTLE_TAIL_FRAMES = 4;

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

export function summarizeActionGroup(actions) {
  const frameGaps = actions.flatMap(scoredActionFrameGaps);
  const rawFrameGaps = actions.flatMap(
    (action) => action.postActionFrameGapsMs ?? action.frameGapsMs ?? []
  );
  const firstFrame = distribution(finiteValues(actions, 'firstFrameMs'));
  const ready = distribution(finiteValues(actions, 'readyMs'));
  const frames = {
    ...distribution(rawFrameGaps),
    max: maximum(frameGaps),
    rawMax: maximum(rawFrameGaps),
  };
  const passed =
    actions.length > 0 &&
    firstFrame.p95 <= ACTION_FIRST_FRAME_GATE_MS &&
    frames.p95 <= ACTION_FRAME_P95_GATE_MS &&
    frames.max <= ACTION_FRAME_MAX_GATE_MS;
  return {
    count: actions.length,
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

export function summarizeActions(actions) {
  const groups = new Map();
  for (const action of actions) {
    const entries = groups.get(action.label) ?? [];
    entries.push(action);
    groups.set(action.label, entries);
  }
  return [...groups.entries()].map(([label, entries]) => ({
    label,
    ...summarizeActionGroup(entries),
  }));
}

export function actionRows(summaries) {
  return summaries.map((summary) => ({
    action: summary.label,
    runs: summary.count,
    'first p95': summary.firstFrame.p95,
    'ready seen p50': summary.ready.p50,
    'ready seen p95': summary.ready.p95,
    'post p95': summary.frames.p95,
    'post max': summary.frames.max,
    'raw max': summary.frames.rawMax,
    'scored/raw frames': `${summary.frameSamples.scored}/${summary.frameSamples.raw}`,
    verdict: summary.passed ? 'PASS' : 'FAIL',
  }));
}

export function actionFailures(summaries) {
  return summaries.filter((summary) => !summary.passed);
}
