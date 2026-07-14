# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Code audit

### [Correctness] Refuse to ship light-fill candidates that failed their quality gates

**File(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs` (`renderClean` and main output loop, lines
184–292)

#### Problem

`renderClean()` retries a candidate up to five times, but returns the least-bad candidate even when
none passes outline registration, worst-tile registration, white-area, and eye gates. In the normal
single-sample mode, the caller only prints a warning and immediately overwrites both the committed
`fill-src/*.light.raw.webp` source and its shipped punched asset. Gate failure does not increment
`failures`, so the command exits successfully after replacing a known-good asset with a candidate
the generator itself classified as bad.

This differs from the chalk, normalization, and fresh-outline generators, which stage candidates in
scratch space and require an explicit apply step. A later golden freeze or manifest regeneration can
make the accidental regression look intentional.

#### Proposed solution

Adopt the established scratch-and-apply workflow: always retain the best failed candidate for human
review, but do not touch committed raw or shipped assets unless a candidate passes every required
gate and the caller requested `--apply`. If an exceptional manual override is necessary, make it an
explicit, loudly named flag such as `--accept-failing`; default gate exhaustion should exit nonzero.

#### Verification

Run the CLI against temporary roots with mocked generation/scorers that make every attempt fail.
Assert the committed raw and shipped bytes remain unchanged and the process exits nonzero. Then
return a passing candidate, add `--apply`, and assert both outputs change. Cover a multi-page run so
one failed page cannot partially ship unnoticed.

### [Correctness] Give every AI generation exclusive request ownership and cancellation

**File(s):** `web/src/lib/drawing/aiImage.ts` (`generateAiImage`, lines 43–114),
`web/src/lib/state/ui.svelte.ts` (AI result transitions, lines 99–161),
`web/src/lib/components/AiImagePrompt.svelte` (`loadPreview`, lines 10–30)

#### Problem

Each generation owns only a local `AbortController`, created after canvas export. Closing the result
modal cannot abort or invalidate that request. A user can start A, close it, start B, and then have
A's late success or failure mutate B because `finishAiGeneration()` and `failAiGeneration()` accept
any completion while *some* result modal is open. A can replace B's preview/result, clear B's
generating state, or auto-save stale output.

The style preview has the same ownership gap: closing or unmounting while `exportCanvasBlob()` is
pending runs cleanup first, then the late continuation creates an object URL and writes state for a
closed instance. Canvas export in `generateAiImage()` also happens outside its `try`, so a rejected
export can leave the loading modal stuck.

#### Proposed solution

Create a monotonic run id and owned controller before export. Starting a replacement or closing the
modal should abort and invalidate the current run; every preview, result, error, and auto-save
commit must verify that it still owns the active id. Put export and request setup inside the guarded
`try/finally`, and give style-preview loading the same disposed/run-id guard so late blobs are
revoked instead of committed.

#### Verification

Unit-test deferred export and fetch promises: start A, close, start B, and resolve A/B in both
orders. Only B may mutate UI or auto-save, and every late object URL must be revoked. Add
rejected-export and close-during-style-preview cases; neither may leave a spinner or leaked URL.

### [Architecture] Preserve magic-brush source semantics beyond the raster-history boundary

**File(s):** `web/src/lib/drawing/magicBrush.ts` (mutable sheet state and rasterization, lines 55–78
and 241–350), `web/src/lib/drawing/strokeOps.ts` (`renderOp`, lines 102–120),
`web/src/lib/drawing/undoHistory.ts` (fold/keyframe/replay, lines 120–125 and 180–252),
`web/src/lib/drawing/engine.ts` (`clearCanvas`, lines 813–829)

#### Problem

A magic op stores only `magic: true`; replay resolves its paint from the module's *current*
`sheetCanvas`. That deliberately lets a page/theme change rerasterize retained magic ops, but undo
history eventually destroys their semantics: commands older than ten are folded into an ordinary
raster baseline, and long commands can become raster keyframes with their ops dropped. Those pixels
can no longer follow the new page/night fill, so old and recent magic ink can show different source
images after the same theme change.

If a color sheet is still decoding when a magic command folds, `sheetPatternFor()` returns null, the
fold paints nothing, and the command is permanently discarded. Clearing introduces another
inconsistency: it records the clear, chooses a new random rainbow when magic remains selected, and
undo replays the prior magic ops through the new rainbow rather than restoring their original
colors.

#### Proposed solution

Make source-dependent history explicit. Retain a bounded semantic mask/op representation that can be
recomposited against the current sheet, or store immutable source identity with commands and clear
operations and define when recoloring is allowed. Do not destructively fold a source-dependent op
into the ordinary color raster until its future source-change behavior has been resolved.

#### Verification

Add browser pixel tests that: paint magic ink, commit more than ten commands, switch light/dark, and
confirm old and recent regions update together; delay fill decode until after a fold and confirm the
ink appears once ready; and paint a rainbow, clear, undo, then compare restored pixels with the
pre-clear canvas.

### [Architecture] Fit AI requests inside Netlify's deployed function envelope

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`MAX_IMAGE_BYTES`, multipart parsing,
and response buffering, lines 35–41 and 112–130), `web/src/lib/server/ai/gemini.ts`
(`generateImage`/`verifyKey`, lines 44–95), `web/src/lib/drawing/aiImage.ts` (client deadline, lines
41 and 64–81), `web/svelte.config.js` (Netlify adapter)

#### Problem

The route accepts 15 MiB only *after* `request.formData()` buffers the multipart body, while current
Netlify limits buffered requests to 6 MB and says base64 overhead reduces effective binary uploads
to about 4.5 MB. The generated `sveltekit-render` manifest currently uses streaming invocation;
Netlify documents a 10-second execution limit for streaming functions. Even if the adapter switched
to buffered synchronous invocation, that limit is 60 seconds. Both are far below the server and
client's 120-second Gemini deadlines.

Consequently production can reject uploads well below the application's advertised cap and kill a
slow model call before Splotch returns its controlled 413/422/502 response. The local 16 MiB E2E
guard proves behavior the deployment cannot exercise. `verifyKey()` has no upstream abort at all, so
a merely rate-limited public probe can occupy an invocation until the platform terminates it. See
[Netlify's function limits](https://docs.netlify.com/build/functions/configuration/) and
[streaming-function API limits](https://docs.netlify.com/build/functions/api/#streaming-responses).

#### Proposed solution

Define one deployment-aware budget: cap image bytes below the effective request limit (including
multipart overhead), reject an oversized `Content-Length` before `formData()` when present, bound
output bytes, and abort both generation and key verification with headroom below the actual
invocation limit. Put the client deadline slightly beyond the server's so the server controls the
error contract. Confirm whether SvelteKit must use streaming invocation for this route; if so, a
different architecture may be required for image-generation latency.

#### Verification

Inspect the built function manifest and run a deploy-preview smoke at just-under/over upload
boundaries. Exercise a deliberately delayed provider against the deployed invocation mode and
confirm Splotch, not the platform, returns the timeout response. Add fake-timer provider tests for
both generation and key verification. Reconcile ADR-0006 and the API skill with the measured budget.

### [Correctness] Fail closed when an environment seed loses an `onlyIfNew` race

**File(s):** `web/src/lib/server/tokens.ts` (`readStore`, lines 52–80; `isAllowedToken`, lines
117–121), `web/src/lib/server/tokens.test.ts` (Blob fake and seeding coverage, lines 9–35 and
85–194)

#### Problem

An eventual-consistency read can report the token-list key as absent even though it exists. The
subsequent `setJSON(..., { onlyIfNew: true })` correctly avoids overwriting the real list, but
`readStore()` ignores the returned `modified` flag and returns the environment seed anyway. During
replica lag, a revoked token still present in `ALLOWED_TOKENS_LIST` can therefore be re-authorized,
while a newly added token can be denied. Mutations can also make decisions from the stale seed.

`onlyIfNew` prevents clobbering; it does not make the seed authoritative after `modified:false`.
This violates the immediate-revocation intent in ADR-0006 and the stale-empty reasoning in ADR-0025.

#### Proposed solution

Inspect `modified`. Return the seed only when the write actually created the key. If the write lost,
perform bounded rereads for the current list; if it cannot be confirmed, fail closed for
authorization and surface a transient persistence/conflict error to admin callers. Keep the local
`MissingBlobsEnvironment` fallback as a separate, explicit provenance.

#### Verification

Extend the fake store so `getWithMetadata()` returns null once while the underlying key contains a
different list, and `onlyIfNew` returns `modified:false`. Assert env-only tokens are never accepted,
current tokens are not denied after retry, and mutations never persist a list derived from the stale
seed. Test the exhausted-retry fail-closed path.

### [Correctness] Score night composites with the same inpainted punch the app ships

**File(s):** `tools/asset-gen/lib/night-composite.mjs` (`compositeNight`, lines 1–34),
`tools/asset-gen/lib/punch-fill.mjs` (`bleedUnderMask`/`punchFill`, lines 11–19 and 43–136),
`tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (composite eye gates, lines 303–323),
`tools/asset-gen/bin/audit-fill-eyes.mjs` (night composite audit, lines 56–72)

#### Problem

The live punch now inpaints outline-mask pixels with neighboring fill color and ships fully opaque
RGB. `compositeNight()` still simulates the retired transparent punch by replacing every chalk-ink
pixel with dark paper before screening chalk on top. It also duplicates the luma threshold instead
of importing `OUTLINE_LUMA_THRESHOLD`.

Night-eye generation, the dedicated eye audit, and golden scoring therefore judge a composite the
app no longer renders. Their answers can diverge around antialiased chalk edges—the exact area
inpainting was introduced to fix—allowing false passes or failures on paper-dark pixels that are
actually bled fill pixels in the shipped asset.

#### Proposed solution

Extract a pure buffer-level punch/inpaint primitive from `punch-fill.mjs`. Use it both for the file
writer and `compositeNight()`, then screen the chalk over the inpainted RGB. Import the shared
threshold and update the stale transparent-punch comments.

#### Verification

Add a soft antialias-edge fixture. Run the shared punch on raw fill plus chalk, independently screen
the chalk over that result, and assert `compositeNight()` matches byte-for-byte or within the chosen
rounding tolerance. The fixture should also prove the old paper-under-mask simulation differs.

### [Testing] Add the load-bearing blank-orb verdict to the golden catalog

**File(s):** `tools/asset-gen/bin/audit-golden.mjs` (imports/scoring/verdicts, lines 31–46, 108–124,
and 170–194), `tools/asset-gen/bin/audit-fill-eyes.mjs` (orb verdict, lines 18–21 and 56–80),
`tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (generation gate, lines 310–323),
`tools/asset-gen/golden/golden-scores.json`

#### Problem

Generation and `audit-fill-eyes` both enforce `scoreCompositeEyes()` because the older band-based
eye judge cannot see the blank-white-orb failure class. The gate-redundancy matrix explicitly calls
that composite gate load-bearing, but `audit-golden.mjs` neither runs it nor stores an orb verdict.
`gen:coloring-golden:diff` therefore cannot detect an asset or scorer regression that restores a
blank orb unless another, structurally different eye gate happens to fire.

#### Proposed solution

Build the chalk composite once during golden page scoring, run both eye judges, and persist an orb
verdict plus stable supporting metrics. Add the verdict to `VERDICTS`, version the golden schema if
needed, and intentionally refreeze the catalog.

#### Verification

Use the committed good and recovered blank-orb fixtures in a golden-diff test. Good → blank must be
a regression even when the existing `night.eyesOk` remains true; blank → good should report an
improvement.

### [Correctness] Recheck canvas emptiness when a service worker actually takes control

**File(s):** `web/src/lib/pwa/updates.ts` (`activateWaitingSW`, lines 81–101),
`web/src/lib/pwa/updates.test.ts` (waiting-worker coverage, lines 132–182)

#### Problem

The update lifecycle checks `canvasState.canvasEmpty` before sending `SKIP_WAITING`, then registers
an unconditional `controllerchange` reload. A child can begin a stroke during the activation gap
(the installing-worker path adds another 100 ms), after which `controllerchange` reloads and erases
the new drawing. That contradicts the module and ADR-0022 invariant that updates reload only while
the canvas is blank.

#### Proposed solution

Recheck the live canvas state inside the `controllerchange` handler. If ink appeared, leave the new
worker controlling the page but defer the document refresh to a later safe launch/check. Keep the
handler one-shot and make the deferred state explicit so multiple update checks cannot register
competing reloads.

#### Verification

Capture the registered `controllerchange` callback in the existing worker tests. Flip canvas state
from blank to nonempty before invoking it and assert no reload; retain the blank case and assert one
reload. Cover the delayed installing-worker path too.

### [Correctness] Treat drag-to-clear `pointercancel` as cancellation, not commit

**File(s):** `web/src/lib/actions/dragToClear.ts` (`onPointerUp` and listener wiring, lines
161–245), `web/src/lib/actions/dragToClear.test.ts` (cancel coverage, lines 92–105)

#### Problem

`pointercancel` is wired to the same release handler as `pointerup`. That handler recomputes
distance and invokes `onClear()` when the pointer is beyond the accept radius. If the browser or OS
cancels a drag after it crosses the threshold, Splotch deletes the drawing even though the gesture
never completed. The current cancellation test keeps the pointer at its start coordinates, so it
verifies teardown but misses the destructive case.

#### Proposed solution

Use a dedicated cancel handler that clears timers, capture/drag state, classes, progress, and audio,
then returns the control home without tutorial dismissal, clear, ripple, or commit haptic behavior.

#### Verification

Add down → far move → `pointercancel`; assert `onClear` is never called and every gesture UI state
resets. Keep the equivalent far `pointerup` case and assert it commits exactly once.

### [Correctness] Keep `canvasEmpty` false when undo replays an active stroke

**File(s):** `web/src/lib/drawing/engine.ts` (stroke-group state and `undo`, lines 368–380 and
798–810), `web/src/lib/drawing/undoHistory.ts` (`replayAll`, lines 243–252),
`web/src/lib/components/ActionsPanel.svelte` (undo activation, lines 130–136)

#### Problem

A second pointer can activate Undo while a stroke remains down. `undo()` pops a committed command
and `replayAll()` correctly paints retained history *plus* the active command, so ink remains
visible. It then unconditionally sets `canvasEmpty = undone.wasEmpty`. If the popped command began
on blank paper, the flag becomes true despite the active stroke. Committing that stroke does not
reassert false, leaving screenshot/save gating, paper locking, PWA update safety, and other
empty-state consumers inconsistent with visible pixels.

#### Proposed solution

Define active-stroke undo semantics explicitly. The smallest fix is to derive the final empty state
from both `undone.wasEmpty` and whether the active group contains ink; alternatively, disable or
defer Undo until the current group commits. Keep `canUndo` and `canvasEmpty` based on the same
committed-plus-active model.

#### Verification

Commit one stroke, hold a second stroke down, invoke Undo, then release. Assert pixels remain,
`canvasEmpty` stays false, screenshot/save remains enabled, and the active stroke is still one undo
unit.

### [Correctness] Surface the API's persistence status in the native admin console

**File(s):** `web/src/routes/api/admin/tokens/+server.ts` (snapshot response, lines 32–45),
`web/src/routes/admin/native/+page.svelte` (snapshot state/application, lines 15–63 and 122–134),
`web/src/lib/components/admin/AdminConsole.svelte` (`persistent` prop/warning, lines 38–51 and
207–213), `web/tests/admin.spec.ts` (native expectation, lines 58–63)

#### Problem

Every JSON snapshot already carries `persistent`, and the shared console already has the correct
warning UI. The native page discards the field and does not pass the prop, so it defaults to true.
Its E2E test even asserts the stale claim that JSON cannot carry the signal. During a Blobs outage
or deployment misconfiguration, an on-device admin sees successful in-memory adds/removes with no
warning; the changes disappear on a cold start.

#### Proposed solution

Track `persistent` from every successful snapshot, validate the snapshot shape, and pass it into
`AdminConsole`. Remove the stale comments and make web/native front doors present the same
durability state.

#### Verification

The local E2E server has no Blobs and already returns `persistent:false`; invert the native test to
require the fallback warning. Add a mocked `persistent:true` snapshot to prove the warning remains
hidden for durable storage and that later snapshots update the state.

### [Correctness] Commit AI credentials only after the current request persists them

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte` (verification flows, lines 31–37
and 59–128), `web/src/lib/state/settings.svelte.ts` (`setAiUserApiKey`, lines 217–222),
`web/src/lib/secureStorage.ts` (secret persistence, lines 117–170)

#### Problem

Opening/closing Parent Center resets visible key status but does not abort or invalidate in-flight
verification. A late request A can announce or persist its credential after a reopened request B.
Separately, `setAiUserApiKey()` mutates live memory before awaiting secure persistence. If the save
rejects, the UI's catch reports a network failure while `hasApiKey` has already flipped true and the
feature uses a key that will disappear on reload.

#### Proposed solution

Give verification a request id/AbortController that is invalidated on close, reopen, or replacement.
Persist the verified key first and commit it to live state only if the save succeeds and the request
still owns the active id; otherwise roll back. Distinguish secure-storage failure from network/key
verification failure in parent-facing feedback.

#### Verification

Use deferred A/B verification responses across close/reopen and assert only B can commit. Mock
`saveApiKey` rejection and assert live key state remains empty, the locked UI remains visible, and a
storage-specific error appears.

### [Testing] Run asset-pipeline unit tests in CI

**File(s):** `package.json` (`test`/`test:asset-gen`, lines 37 and 49–52),
`tools/asset-gen/vitest.config.mjs` (ten-suite config, lines 1–15), `.github/workflows/test.yml`
(test job, lines 62–115)

#### Problem

The root `npm test` includes `test:asset-gen`, and the pipeline now has ten suites/45 tests for its
load-bearing image-analysis gates. The CI workflow does not run `npm test`; it manually runs only
`test:unit` and `test:e2e`, so asset-gate regressions can merge without executing those tests. The
testing skill and script description also still claimed CI matched the old two-suite command.

#### Proposed solution

Add `npm run test:asset-gen` to the CI test job (before browser setup, since it needs no browser),
or centralize CI on a script whose suite list cannot drift from `npm test`. Keep expensive
native/manual tests explicitly separate.

#### Verification

Temporarily make one asset-gate assertion fail and confirm the CI test job fails before Playwright.
Restore it and confirm all 10 files/45 tests run. A local `npm run test:asset-gen` currently passes.

### [Accessibility] Make palette and hex buttons activate from keyboard and assistive technology

**File(s):** `web/src/lib/components/ColorPalette.svelte` (handlers/buttons, lines 49–80 and
91–130), `web/src/lib/components/ColorPicker.svelte` (delegated handlers/buttons, lines 33–104 and
128–160), `web/src/lib/actions/scribbleGuard.ts` (`scribbleTap`, lines 37–79)

#### Problem

Both controls render semantic `<button>` elements but activate exclusively from pointer events.
Keyboard Enter/Space and assistive-technology activation emit `click`, not `pointerup`, so focusable
swatches and hexagons do nothing. The codebase already has `scribbleTap`, which preserves stylus
pointer-up behavior while accepting detail-zero keyboard/AT clicks without double firing.

#### Proposed solution

Reuse `scribbleTap` (or an equivalent click/keyboard path) for palette swatches and focused
hexagons, while retaining delegated drag selection for touch/stylus exploration. Ensure a pointer
gesture still commits once and gap-snapping behavior remains unchanged.

#### Verification

Add Playwright coverage that tabs to a palette color and activates it with Enter/Space, then opens
Custom Color, focuses a hex button, activates it, and observes the chosen color plus dialog close.
Retain pointer/stylus tests to catch double activation.

### [Performance] Split the eager SVG registry so late overlays do not inflate startup

**File(s):** `web/src/lib/components/Icon.svelte` (eager glob/map, lines 4–14 and 47–55),
`web/src/lib/components/bootHiddenOverlays.ts`, `web/src/lib/components/InstallBanner.svelte`
(`splotchy` usage, lines 88 and 99), `web/src/lib/components/parent/AboutTab.svelte` (`splotchy`
usage, line 42)

#### Problem

Every `Icon` instance imports a single eager glob containing all SVG markup, and the runtime
`icons[name]` lookup prevents per-call-site tree-shaking. The icon directory is about 178 KB raw;
`splotchy.svg` alone is about 88 KB raw/~32 KB gzip and is used only in late-mounted Install Banner
and Parent Center/About UI. Yet an eagerly visible root icon pulls the same registry onto the
toddler drawing startup path, partially undermining ADR-0049's dynamic overlay split.

ADR-0044 recognized that every byte ships and optimized the SVGs, but it does not require all icons
to share the entry chunk.

#### Proposed solution

Generate typed per-icon imports/components, or split a small eager/common registry from one or more
lazy overlay registries. Preserve `IconName`, first-party `{@html}` safety, color-icon metadata, and
the dynamic-icon hydration convention.

#### Verification

Compare production bundle composition and `npm run perf:mount` before/after. The initial route chunk
should no longer contain `splotchy` markup, while every icon state still renders and the late
overlay chunk remains service-worker cached.
