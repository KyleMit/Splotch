# Reduces a raw actions.json to what this package's claims rest on. The samples keep every
# scored timing (first frame, ready, each post-action frame gap), so each summary can be
# recomputed from them; the per-frame stamp arrays and traces stay in the local originals.
{
  sourceSha256: $sha,
  device: {os: .device.os}, engine, transport, captureRuntime, uiActivation, repeats, orientation, theme, passed,
  buildEntry, buildDigest, productCommit, refreshRatePin, pageEntries, serviceWorkerRegistration,
  actionPlan,
  coloringPreparation,
  actionGroups: .actions,
  summaries: [.summaries[] | {label, passed, count, totalCount, activation, frames, firstFrame, ready}],
  samples: [.samples[]? | {label, repeat, warmup, activation, eventType, trusted, actionAt, firstFrameMs, readyMs,
            postActionFrameGapsMs, scrollDelivery,
            armedEvents: (.armedEvents // [] | map({type, hit, x, y, trusted}))} | with_entries(select(.value != null))]
} | with_entries(select(.value != null))
