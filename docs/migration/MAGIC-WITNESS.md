# Magic work witness (A0)

A0 adds observation to the existing Svelte/Capacitor Magic owners. It prepares causal evidence for
Phase 1 architecture comparisons. It supplies no suppression, seed, prewarm, reset, native
implementation or performance result. A1 requires its own reviewed physical evidence and plan.

## Observation contract

`window.__drawingDebug.getMagicWorkDebug()` uses the existing development/harness/PERF_MARKS seam.
Only `PERF_MARKS=true` allocates the counter owner or returns a witness; absent or disabled
observation is unavailable, never zero work. The getter reads existing facts and returns copied
primitive state, coordinates and cumulative counters. It never prepares a source, acquires a worker,
paints, registers an appearance, recodes history or changes source identity.

`web/src/lib/drawing/magicWorkDebug.ts` owns fresh counter factories. The brush and worker client
record their actual finite branches. `web/src/lib/drawing/magicWorkWitness.ts` combines the owner
readers and traces both real recode callers. Completed worker installation, logical requests,
initial/retry post attempts, resolution/rejection, retirement, main attempts, completed paints and
accepted publication remain separate. `magicSupersededDisposals` counts resolved bitmaps discarded
by the brush after its source changed. `magicOrphanedReplyDisposals` counts bitmaps closed by the
client because the request is missing or belongs to another worker, including late replies after
retirement or redispatch. They do not fabricate another resolution or rejection. Decoded-fill resize
rasterization is `fill-direct`, including on a worker-capable runtime. It does not imply worker
failure.

`magicRecodeCompletedDelegations` counts the renderer calls that returned a changed/no-change
boolean. Exceptions retain their original behavior and increment `magicRecodeThrows`; the throwing
stage is unknown, so they do not fabricate a completed delegation or no-change result. Existing
appearance registration, source keys and empty-scan scheduling remain in order, including scheduling
after no-change. Engine additions remain inside the unchanged 1030-line cap.

## Diagnostic measures and action reads

The six `magicWitness.*` brackets cover ensure, cold worker construction/listener installation,
synchronous request registration/posting (including retry), main raster, accepted publication and
recode. These browser-clock spans are inclusive synchronous costs. Nested spans overlap; never sum
them as independent CPU work or infer asynchronous worker/decode/wait costs from them.

`tools/perf/probes/action-probe.js` fences the entire namespace into `magicMeasures`. Unknown names
remain diagnostic problems and never enter scored activity. Both begin paths take one before read.
Finish freezes its action clock, frame window and measure slice before its after read. Lookup,
getter, copy/validation and error-format failures remain unavailable metadata while preserving the
action sample. Deltas require the same time origin, getter identity and fixed revision, plus
monotonic counters. No reader function is serialized.

The strict lexical factory in `tools/perf/probes/magic-action-witness.js` is assembled by
`tools/perf/lib/action-probe-source.mjs` for all three actual action transports. This narrow
extraction preserves the normal file cap and adds no window property. Both sources join the existing
action-only capture fingerprint. The existing screen collector, Chrome engine hot paths, input
recorder, undo pairing and commit samples retain their original `engine.*` boundaries.

## Evidence epoch and review

Witness revision 1 starts a distinct observer epoch. Reconcile comparisons against the ordinary
`PERF_MARKS=true` control and preserve source/build identity. Keep the existing `buildEntry`,
`buildDigest` and `productCommit` binding, effective build flags, witness-owner source revisions and
capture-tool fingerprint beside each new capture. Earlier artifacts without this observer cannot
establish witness deltas or serve as matched controls merely because they share a product version.

The implementation follows the independently reviewed A0 plan and the handler-approved lexical probe
extraction. Scoped owner tests exercise actual branches and both engine callers; boundary controls
reject unguarded recording, malformed source injection, mismatched emitter names and release-only
tokens. Actual collector/scorer controls establish metric invariance and detect misnamed engine
activity. Exact-head Claude review, ordinary release builds, full tiers, browser checks and matched
physical-device evidence remain separate integration exits. Unit tests establish observer contracts,
not native viability or a performance improvement.
