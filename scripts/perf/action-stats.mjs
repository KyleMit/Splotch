import { percentile } from './real-screen-stats.mjs';

export const ACTION_FRAME_P95_GATE_MS = 20;
export const ACTION_FRAME_MAX_GATE_MS = 32;
export const ACTION_FIRST_FRAME_GATE_MS = 32;

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

export function summarizeActionGroup(actions) {
  const frameGaps = actions.flatMap(
    (action) => action.postActionFrameGapsMs ?? action.frameGapsMs ?? []
  );
  const firstFrame = distribution(finiteValues(actions, 'firstFrameMs'));
  const ready = distribution(finiteValues(actions, 'readyMs'));
  const frames = distribution(frameGaps);
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
    verdict: summary.passed ? 'PASS' : 'FAIL',
  }));
}

export function actionFailures(summaries) {
  return summaries.filter((summary) => !summary.passed);
}
