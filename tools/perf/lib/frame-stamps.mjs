// The action probe's two frame clocks (ADR-0163).
//
// Every frame row `tools/perf/probes/action-probe.js` records carries the
// requestAnimationFrame timestamp argument — the vsync the frame was SCHEDULED
// for, which is the channel every action gate scores — and, since the dual
// epoch, performance.now() at callback entry — when the main thread ACTUALLY
// ran the frame. A callback that runs late keeps its on-time scheduled stamp,
// so on the scored channel a two-beat red is faithful and a green is not proof
// the frame fit (issue 1704). The actual channel exists to say how often that
// happens; nothing here decides a verdict. `summarizeActionGroup` attaches this
// module's figure beside its gates and never reads it.
import { percentile } from './real-screen-stats.mjs';

// Epoch 1: one clock per frame, the rAF timestamp — every capture committed
// before the dual channel shipped. Epoch 2: both clocks on every frame. The
// probe declares its epoch on `window.__actionProbe.frameStampEpoch` and on
// every sample `finish()` returns; a legacy sample carries no marker and reads
// as epoch 1. The probe is a plain browser script that cannot import this
// constant, so tools/perf/tests/action-probe.test.mjs pins its literal here.
// An epoch names what the scored frame table carries and which rule scores it,
// so an additive field no rule reads is not one: the probe's
// `lastPreActionFrame` boundary row marks itself, its key present on every
// sample from a probe that records it and null when no frame preceded the
// action.
export const SCHEDULED_ONLY_FRAME_STAMP_EPOCH = 1;
export const DUAL_FRAME_STAMP_EPOCH = 2;

// The epoch every sample of one capture shares, null for an empty run. A
// mixture is refused: one capture is one instrument, and a resumed sweep that
// crossed the probe change is exactly what the campaign's instrument fingerprint
// exists to stop.
export function frameStampEpochOf(samples) {
  const epochs = new Set(
    samples.map((sample) => sample.frameStampEpoch ?? SCHEDULED_ONLY_FRAME_STAMP_EPOCH)
  );
  if (epochs.size === 0) return null;
  if (epochs.size > 1) {
    throw new Error(
      `samples mix frame-stamp epochs ${[...epochs].sort().join(', ')} — one capture is one instrument`
    );
  }
  return [...epochs][0];
}

// The artifact-level marker wins; an artifact written before the marker existed
// answers from its samples, and an artifact with neither is a legacy capture.
export function artifactFrameStampEpoch(artifact) {
  return (
    artifact.frameStampEpoch ??
    frameStampEpochOf(artifact.samples ?? []) ??
    SCHEDULED_ONLY_FRAME_STAMP_EPOCH
  );
}

const hasBothChannels = (frame) =>
  Number.isFinite(frame.actualGapMs) && Number.isFinite(frame.ranFromActionMs);

const round1 = (value) => Math.round(value * 10) / 10;

function distribution(values) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: round1(Math.max(...values)),
  };
}

// The informational, non-gating scheduled-versus-actual figure for one action
// group, over the frames the scorer scored: null when no frame carries the
// actual channel (a legacy capture), so a legacy summary's shape is unchanged.
// `hiddenOverruns` is the count the whole channel exists to accumulate — frames
// the scheduled stamp keeps under the max gate while the callback-to-callback
// gap crossed it. `callbackDelay` is how late each callback ran against the
// vsync it was stamped with. Deltas are actual minus scheduled over the same
// frames, so a clean run reads zero.
export function frameStampDivergence(scoredFrames, maxGateMs) {
  const dual = scoredFrames.filter(hasBothChannels);
  if (dual.length === 0) return null;
  const scheduled = distribution(dual.map((frame) => frame.gapMs));
  const actual = distribution(dual.map((frame) => frame.actualGapMs));
  const callbackDelay = distribution(
    dual.map((frame) => frame.ranFromActionMs - frame.endFromActionMs)
  );
  return {
    frames: dual.length,
    actual,
    p95DeltaMs: round1(actual.p95 - scheduled.p95),
    maxDeltaMs: round1(actual.max - scheduled.max),
    callbackDelay: { p95: callbackDelay.p95, max: callbackDelay.max },
    hiddenOverruns: dual.filter(
      (frame) => frame.gapMs <= maxGateMs && frame.actualGapMs > maxGateMs
    ).length,
  };
}
