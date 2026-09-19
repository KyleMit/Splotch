# Reduces a raw actions.json to what this package's claims rest on, keeping every input the
# scorer (tools/perf/lib/action-stats.mjs summarizeActions) reads, so check.mjs recomputes each
# summary instead of trusting the stored one. postActionFrameGapsMs is dropped only because it
# equals postActionFrames[].gapMs in every sample here; check.mjs restores it from the frames.
# Frames are stored as rows under postActionFrameColumns, and the files are gzipped, for size.
# Activity targets, mutation details and traces stay in the local originals.
{
  sourceSha256: $sha,
  device: {os: .device.os}, engine, transport, captureRuntime, uiActivation, repeats, orientation, theme, passed,
  buildEntry, buildDigest, productCommit, refreshRatePin, pageEntries, serviceWorkerRegistration,
  gateAllowances,
  actionPlan,
  coloringPreparation,
  actionGroups: .actions,
  summaries: [.summaries[] | {label, passed, count, totalCount, activation, frames, firstFrame, ready, frameSamples}],
  samples: [.samples[]? | {label, repeat, warmup, activation, eventType, trusted, actionAt, firstFrameMs, readyMs,
            postActionFrameColumns: ["gapMs", "endFromActionMs", "visualEffectsActive"],
            postActionFrameRows: [.postActionFrames[]? | [.gapMs, .endFromActionMs, .visualEffectsActive]],
            activityAtFromActionMs: [.activities[]? | .atFromActionMs],
            canvasMutationAtFromActionMs: [.canvasMutations[]? | .atFromActionMs],
            measures: [.measures[]? | {name, startFromActionMs, duration}],
            scrollDelivery,
            armedEvents: (.armedEvents // [] | map({type, hit, x, y, trusted}))} | with_entries(select(.value != null))]
} | with_entries(select(.value != null))
