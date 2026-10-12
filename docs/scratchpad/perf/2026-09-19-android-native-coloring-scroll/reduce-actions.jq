# Reduces a raw actions.json to what this package's claims rest on. Per-frame arrays stay in the local originals.
{
  sourceSha256: $sha,
  device: {os: .device.os}, transport, captureRuntime, uiActivation, repeats, orientation, theme, passed,
  actionPlan,
  actionGroups: .actions,
  summaries: [.summaries[] | {label, passed, count, totalCount, activation, frames, firstFrame, ready}],
  samples: [.samples[]? | {label, repeat, warmup, activation, eventType, trusted, scrollDelivery,
            armedEvents: (.armedEvents // [] | map({type, hit, x, y, trusted})),
            postActionGapMaxMs: ((.postActionFrameGapsMs // []) | max)} | with_entries(select(.value != null))]
}
