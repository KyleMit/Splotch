# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit

All citations below were verified against `344499f72bf1c6ea24aa179cbef2f24c70658317`. This run
intentionally covered only the Web app directory (`web/` plus its Netlify function boundary),
excluding generated build/cache directories and static binary assets.

### [Performance] Cancel Screenshot Button preparation before export composition and encoding

**File(s):** `web/src/lib/drawing/screenshot.ts` (`createPreparedScreenshot`, lines 103–163),
`web/src/lib/drawing/engine.ts` (`prepareCanvasExport`, lines 1412–1443),
`web/src/lib/components/ActionsPanel.svelte` (`screenshotTap`, lines 326–353)

#### Problem

`createPreparedScreenshot()` calls `exportPreparation.complete()` immediately when pointer-down
preparation starts. A drag-off or other canceled press therefore still resolves the captured tile
bitmaps, composes the full paper, and encodes a PNG. Cancellation only closes a pending preview and
never calls the preparation's existing `cancel()` method. Repeated canceled presses can also start
overlapping expensive exports because the cleared preparation is not protected by the active-save
gate. This contradicts ADR-0088's trusted-press contract: cancellation closes prepared bitmaps and
consumes the preparation only after activation.

#### Proposed solution

Keep `prepareCanvasExport()` on pointer-down so immutable bitmap requests begin early, but create
the `complete()` promise lazily in `activate()`. Call `CanvasExportPreparation.cancel()` when a
prepared press is canceled before activation. Preserve the no-preparation fallback for click-only
activation.

#### Verification

Add focused tests with a real-shaped `{ complete, cancel }` preparation: cancel-before-activation
must call `cancel()` once and never call `complete()`; activation must consume the preparation once.
Run the screenshot/engine-export unit suites and the screenshot action capture, including a drag-off
gesture that proves no compositor/encoder work starts.

### [Performance] Avoid base64 encoding images before a successful background handoff

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`generateImage`, lines 238–293),
`web/src/lib/server/ai/provider.ts` (`AiImageRequest`, lines 7–23),
`web/src/lib/server/ai/openai.ts` (`generateImage`, lines 101–145),
`netlify/functions/generate-image-background.ts` (lines 54–68)

#### Problem

The request handler base64-encodes every validated image before attempting the normal background
handoff. A successful handoff never uses the string. At the 15 MiB input limit this creates and
retains roughly 20 MiB of discarded text alongside the input bytes and the handoff copy. Both the
synchronous and background provider paths then encode bytes to base64 only for the OpenAI adapter to
decode the same string back to bytes for dimension inspection and retain the original string for the
vendor data URL.

#### Proposed solution

At minimum, defer the synchronous path's base64 conversion until background handoff has failed. A
follow-on simplification can make the provider boundary accept bytes, inspect dimensions directly,
and encode once at the vendor data-URL boundary if that broader type change remains low risk.

#### Verification

Instrument the encode seam and assert a successful 202 response performs no base64 preparation.
Retain synchronous fallback/background-worker coverage, then compare handler duration and peak heap
for a near-limit image before and after.

### [Performance] Compute live path bounds once instead of once per tile

**File(s):** `web/src/lib/drawing/tiledRenderer.ts` (`renderTiledOpForCommand`, lines 276–305),
`web/src/lib/drawing/tiledGeometry.ts` (`geometryIntersectsTile`, `opDeviceBounds`, lines 15–64),
`web/src/lib/drawing/opGeometry.ts` (`opGeometricExtent`, lines 44–78)

#### Problem

For each live dot/path op, the renderer visits all 16 tiles. Every intersection call rescans the
same path segments through `opPaddedUserBounds()`, and every intersecting tile scans them again for
undo bounds. A one-tile stroke therefore computes identical geometry 17 times; a path crossing four
tiles computes it 20 times. Device-bound conversion also allocates four points and four mapped
arrays per intersecting tile. This work sits on the continuous drawing hot path.

#### Proposed solution

Compute the padded user bounds once in `renderTiledOpForCommand()` and pass that immutable value to
tile-intersection and device-bound helpers. Compute transformed minima/maxima without temporary
`corners.map()` arrays. Reuse the same bounds path for history rendering where applicable.

#### Verification

Add a counter-backed unit seam proving the extent is calculated once per op while tile/pixel/undo
results remain identical. Run tiled geometry, renderer, and undo tests; compare `engine.draw`
profiles and surface-visit counters before and after.

### [Security/Performance] Reject oversized request bodies while streaming

**File(s):** `web/src/lib/server/http.ts` (`readJsonBody`, `readBodyWithinLimit`, lines 10–31),
`web/src/routes/api/generate-image/+server.ts` (`readGenerationRequest`, lines 102–133)

#### Problem

`readBodyWithinLimit()` uses `Content-Length` only as a hint, then fully materializes an absent or
dishonestly declared body before applying the authoritative byte limit. `readJsonBody()` is
unbounded. The legacy generation shape calls `request.formData()` before authorization and only caps
the extracted image, so an unauthenticated multipart envelope can carry arbitrarily large unused
fields. Oversized requests can therefore force avoidable function memory and parsing work before
rejection.

#### Proposed solution

Read `request.body` incrementally up to `maxBytes + 1`, cancel on overflow, and build bounded JSON
helpers on that primitive. Apply a whole-envelope limit before parsing legacy multipart bodies;
preserve the existing legacy wire contract while it remains supported.

#### Verification

Use chunk-counting streams with absent and false `Content-Length` values; assert reading stops,
cancels, and returns 413 immediately after the limit. Cover oversized JSON and multipart bodies
whose image is small but an unused field is large.

### [Performance] Cancel superseded Magic-sheet raster worker jobs

**File(s):** `web/src/lib/drawing/magicBrush.ts` (`beginFillRaster`, `beginGradientRaster`,
`setColorSheet`, lines 182–232 and 585–627), `web/src/lib/drawing/magicSheetRasterClient.ts`
(`pendingWorkerRasters`, lines 4–119), `web/src/lib/drawing/magicSheet.worker.ts` (lines 48–98)

#### Problem

Page, theme, and geometry changes only disown an old worker request. The client retains it until
response or a 15-second timeout, and the worker still fetches, decodes, allocates a paper-sized
canvas, paints, and transfers the obsolete bitmap. Rapid A→B→C selection can leave several full jobs
competing with the only result that can become visible.

#### Proposed solution

Give raster requests a cancellation handle and worker cancel message. Abort obsolete fetches and
check cancellation after fetch/decode and before allocation, paint, and transfer. Treat cancellation
separately from real worker failure so cancellation cannot trigger main-thread fallback rendering.

#### Verification

Worker/client tests with deferred fetch/decode must prove canceled requests neither allocate nor
publish. Add an A→B→C rapid-selection browser case proving only C publishes and stale bitmaps close;
compare page-selection timing and graphics memory before/after.

### [Performance] Render one responsive Color Picker grid instead of two hidden copies

**File(s):** `web/src/lib/components/ColorPicker.svelte` (`GRIDS`, `snapshotHexCenters`, template,
lines 10–19, 81–91, 170–190), `web/src/lib/hexPickerLayout.ts` (grid construction, lines 22–172)

#### Problem

The picker renders both portrait and landscape 9×9 grids and hides one with CSS, retaining 162
button trees and their reactive bindings. The background overlay pump pays this mount cost even if
the picker never opens. Each pointer-down also queries both grids and reads every visible/hidden
hexagon rectangle before discarding zero-width nodes.

#### Proposed solution

Render the 81 colors once with family/shade coordinates and use orientation media queries to swap
CSS grid placement. Preserve CSS-only responsive trimming so prerendered first paint remains
deterministic, and retain the established accessibility and visual order in both orientations.

#### Verification

Assert exactly 81 `.hexagon` nodes in both orientations. Retain the picker trim geometry matrix and
gap/tap E2E behavior, then compare overlay-pump mount duration and retained node count.

### [Correctness] Ignore stale free-generation refresh results

**File(s):** `web/src/lib/state/freeGenerations.svelte.ts` (`createFreeGenerationGrantRefresher`,
`refreshFreeGenerationGrant`, lines 66–105)

#### Problem

Grant refreshes have no in-flight owner, epoch, or abort signal, and every eventual result mutates
the shared state. A request started while free generation is eligible can resolve after a BYOK or
managed credential makes it ineligible and re-enable stale free allowance. Multiple reconnect
requests can also settle in reverse order, allowing an older failure to overwrite newer success.

#### Proposed solution

Give each refresh an epoch or `AbortController`; invalidate the owner on ineligibility/offline
transitions and apply results only while they still own the current eligible state.

#### Verification

Add deferred-promise tests for eligibility changing before settlement and for two reconnect requests
settling in reverse order. Assert the latest eligible state wins in success/failure order.

### [Maintainability/Privacy] Bound and fault-isolate retention sweeps

**File(s):** `web/src/lib/server/usageRecordStorage.ts` (`purgeExpiredUsageRecords`, lines 45–92),
`web/src/lib/server/generationJobs.ts` (`purgeExpiredGenerationJobs`, lines 224–250),
`web/src/lib/server/imageReportStore.ts` (`purgeExpiredImageReports`, lines 117–137)

#### Problem

Usage and generation-job sweeps perform store reads/deletes serially and abort all later records
when one operation fails; the job sweep first retains the complete keyspace. The image-report sweep
instead launches an unbounded `Promise.all()` per page and still aborts on one rejection. Large or
partially unhealthy stores can time out or abandon later records, weakening the retention promises
the sweeps exist to enforce.

#### Proposed solution

Introduce a small bounded-concurrency page processor with per-key failure accounting and continued
progress. Process generation jobs pagewise without first retaining the whole keyspace, while still
deduplicating the keys belonging to one job.

#### Verification

Use multi-page fake stores with latency and injected get/delete failures. Assert the concurrency
ceiling, bounded retained work, accurate outcome counts, and progress across later keys despite
isolated failures.

### [Performance] Snapshot Slider track width once per drag

**File(s):** `web/src/lib/components/Slider.svelte` (`onPointerDown`, `onPointerMove`, lines 74–103)

#### Problem

Every pointer move reads `trackEl.clientWidth` immediately before updating reactive state. The
previous move can have changed rendered settings chrome, so this synchronous geometry read can force
style/layout at pointer frequency even though the active track width is stable for the gesture.

#### Proposed solution

Capture an untracked drag-track width on pointer-down, reuse it for moves, and clear it on every
up/cancel/unmount path. A replacement responsive shell already terminates the active drag.

#### Verification

Add a component test whose `clientWidth` getter counts reads across many moves and expects one read
per drag. Retain button-size/volume flows and compare a CPU-throttled drag trace.

### [Performance/Correctness] Freeze drag-to-clear options and threshold per gesture

**File(s):** `web/src/lib/actions/dragToClear.ts` (`onPointerDown`, `onPointerMove`, `onPointerUp`,
lines 110–183 and 262–281), `web/src/lib/components/ClearButton.svelte` (options getter, lines
53–72)

#### Problem

The move hot path invokes the component's options getter on every pointer event, allocating a new
options object and callback closures, and repeatedly derives the viewport-based accept radius. It
reads both again on pointer-up. Besides allocation churn, a viewport change mid-gesture can make the
already-armed visual accept zone disagree with the commit threshold.

#### Proposed solution

Capture active options and accept radius on pointer-down, reuse them through movement and
termination, and clear both in every finish/cancel/destroy path. Prefer stable component callbacks
so the captured object does not manufacture per-gesture closures unnecessarily.

#### Verification

Extend `dragToClear.test.ts` with a getter spy: many moves must produce one options read, and a
simulated viewport change must not alter the active threshold. Run pointer identity, audio,
cancellation, tutorial, and exit-choreography coverage.
