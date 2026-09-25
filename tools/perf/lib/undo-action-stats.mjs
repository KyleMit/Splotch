import { percentile } from './real-screen-stats.mjs';

export const UNDO_ENGINE_P95_GATE_MS = 20;
export const UNDO_NEXT_FRAME_P95_GATE_MS = 33;
export const UNDO_NEXT_FRAME_MAX_GATE_MS = 50;

const maximum = (values) => (values.length ? Math.max(...values) : undefined);

function distribution(values) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: maximum(values),
  };
}

// The ghost/restore split is diagnostic, never gated: `engine.undo` stays the scored
// figure. It is reported only when every action carries the sub-measure, since a
// build from before `engine.undoInkMotion` existed has none and a partial split
// would describe a different set of undos than the engine distribution beside it.
function inkMotionSplit(actions) {
  if (!actions.length || !actions.every((action) => Number.isFinite(action.inkMotionMs))) {
    return {};
  }
  return {
    inkMotion: distribution(actions.map((action) => action.inkMotionMs)),
    restore: distribution(actions.map((action) => action.engineMs - action.inkMotionMs)),
  };
}

export function summarizeUndoActions(actions, frames) {
  const engineDurations = actions.map((action) => action.engineMs);
  const nextFrameDelays = actions.flatMap((action) => {
    if (Number.isFinite(action.nextFrameMs)) return [action.nextFrameMs];
    const nextFrame = frames.find(([at]) => at > action.startedAt);
    return nextFrame ? [nextFrame[0] - action.startedAt] : [];
  });
  const engine = distribution(engineDurations);
  const nextFrame = distribution(nextFrameDelays);
  const passed =
    actions.length > 0 &&
    engine.p95 <= UNDO_ENGINE_P95_GATE_MS &&
    nextFrame.p95 <= UNDO_NEXT_FRAME_P95_GATE_MS &&
    nextFrame.max <= UNDO_NEXT_FRAME_MAX_GATE_MS;
  return { count: actions.length, engine, ...inkMotionSplit(actions), nextFrame, passed };
}

export function undoActionRows(summary) {
  return [
    {
      actions: summary.count,
      'engine p50': summary.engine.p50,
      'engine p95': summary.engine.p95,
      'engine p99': summary.engine.p99,
      'engine max': summary.engine.max,
      ...(summary.inkMotion
        ? {
            'ink motion p95': summary.inkMotion.p95,
            'restore p95': summary.restore.p95,
          }
        : {}),
      'next frame p50': summary.nextFrame.p50,
      'next frame p95': summary.nextFrame.p95,
      'next frame p99': summary.nextFrame.p99,
      'next frame max': summary.nextFrame.max,
      verdict: summary.passed ? 'PASS' : 'FAIL',
    },
  ];
}
