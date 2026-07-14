# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Code audit

### [Correctness] Don't silently discard a magic op that folds mid-sheet-decode

**File(s):** `web/src/lib/drawing/strokeOps.ts` (`renderOp` null-pattern early return, lines
102–120), `web/src/lib/drawing/magicBrush.ts` (`sheetPatternFor`/`sheetReady`, lines 282–329),
`web/src/lib/drawing/undoHistory.ts` (`foldOldestIntoBaseline`, lines 201–212; `maybeKeyframe`,
lines 157–175)

> **Scope note (vet 2026-07-14):** The original finding also claimed the broader "old vs. recent
> magic ink resolves to different source images after a theme change / clear+undo recolors through a
> new rainbow" symptom. That behavior is **intentional and documented** — ADR-0043 and the
> `strokeOps.ts:14–18` comment state magic ops are ordinary command-log members that reveal the
> module's *current* sheet, and resolving-at-replay is the design (pen ink in margins follows the
> baseline the same way). The visible recoloring is cosmetic, its triggers are narrow (night fill +
> magic across >10 commands + a *live* theme toggle, or clear-then-undo), and the proposed
> snapshot-per-op fix is disproportionate. **Removed the broad architecture item; kept only the one
> non-cosmetic bug below.**

#### Problem

`foldOldestIntoBaseline` (`undoHistory.ts:201–212`) bakes the oldest command's ops into the raster
baseline via `renderOp` once the command count exceeds the retention window; `maybeKeyframe`
(`157–175`) does the same for an over-long command. For a **magic** op, `renderOp`
(`strokeOps.ts:112–118`) resolves paint from `sheetPatternFor(target)` and **returns painting
nothing when the pattern is null**. `sheetPatternFor` returns null while `!sheetReady`
(`magicBrush.ts:282–293`), and `setColorSheet` (`316–329`) sets `sheetReady = false` for the
duration of an async fill decode (page change or night-fill toggle).

So if the 11th+ command commits — triggering a fold — while a sheet decode is in flight, the folded
magic op paints nothing and is **permanently discarded** (baked out of both the retained log and the
baseline). Unlike the cosmetic recoloring above, this is silent loss of a committed drawing action.
The trigger window is small (a commit landing inside the sub-second decode of a page/theme change)
but the flow — draw many magic strokes, then change page — is realistic for an engaged child.

#### Proposed solution

Don't fold/keyframe a command while it contains a magic op whose sheet is still decoding: either
defer the fold until `sheetReady` (bounded), or detect the null-pattern case in
`foldOldestIntoBaseline` and skip that fold cycle rather than baking an empty result. Keep it narrow
— this is a data-preservation guard on the fold boundary, not the broader source-identity redesign.

#### Verification

Unit-test `foldOldestIntoBaseline`: commit >10 magic commands, force `sheetReady = false` (mock an
in-flight `setColorSheet` decode), trigger the fold, then let the sheet resolve and `replayAll`;
assert the oldest magic ink is still present (not baked to nothing). A passing baseline requires the
op to survive the fold that lands during the decode.

### [Architecture] Fit AI requests inside Netlify's deployed function envelope

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`MAX_IMAGE_BYTES`, multipart parsing,
and response buffering, lines 35–41 and 112–130), `web/src/lib/server/ai/gemini.ts`
(`generateImage`/`verifyKey`, lines 44–95), `web/src/lib/drawing/aiImage.ts` (client deadline, lines
41 and 64–81), `web/svelte.config.js` (Netlify adapter)

#### Problem

The route accepts 15 MiB only *after* `request.formData()` buffers the multipart body, while current
Netlify limits buffered requests to 6 MB and says base64 overhead reduces effective binary uploads
to about 4.5 MB. Netlify's synchronous invocation limit is 60 seconds, far below the server and
client's 120-second Gemini deadlines. Streaming functions have a still-shorter 10-second limit, but
the generated fetch-style `sveltekit-render` wrapper does not prove which invocation mode the
deployed route receives; that must be confirmed from the deploy rather than inferred from adapter
output.

Consequently production can reject uploads well below the application's advertised cap and kill a
slow model call before Splotch returns its controlled 413/422/502 response. The local 16 MiB E2E
guard proves behavior the deployment cannot exercise. `verifyKey()` has no upstream abort at all, so
a merely rate-limited public probe can occupy an invocation until the platform terminates it. See
[Netlify's function limits](https://docs.netlify.com/build/functions/configuration/) and
[streaming-function API limits](https://docs.netlify.com/build/functions/api/#streaming-responses).

#### Proposed solution

Define one deployment-aware budget: cap image bytes below the effective request limit (including
multipart overhead), reject an oversized `Content-Length` before `formData()` when present, bound
output bytes, and abort both generation and key verification with headroom below the confirmed
invocation limit. Put the client deadline slightly beyond the server's so the server controls the
error contract. If deploy telemetry shows streaming invocation, the 10-second ceiling requires a
different architecture for image-generation latency rather than another timeout adjustment.

**Vet 2026-07-14 — split the concrete from the speculative; do the concrete first:**

* **Actionable now (no deploy telemetry needed):**
  * `verifyKey()` (`gemini.ts:82–95`) has **no upstream abort at all** — unlike `generateImage`
    (`gemini.ts:61`, `AbortSignal.timeout(120_000)`). A rate-limited public probe can occupy an
    invocation until the platform kills it. Add a bounded timeout. **Highest-value, lowest-cost
    sub-fix.**
  * The 120 s deadlines (`gemini.ts:61`, `aiImage.ts:41` `AI_TIMEOUT_MS = 120_000`) exceed **any**
    plausible Netlify *synchronous* function ceiling (single-digit-to-low-tens of seconds), so on a
    slow model call the platform, not Splotch, returns the error. Pull the server deadline under the
    real ceiling and keep the client deadline just beyond it.
* **Speculative — confirm before acting, don't implement blind:** the "6 MB buffered / ~4.5 MB
  effective / 60 s sync" envelope rests on deploy behavior the repo can't prove (does the deployed
  SvelteKit function buffer or stream its response?), and the specific **"60 s synchronous limit"
  figure in the Problem above is unverified and likely wrong** — Netlify's sync ceiling is far
  lower. The 15 MiB cap (`MAX_IMAGE_BYTES = 15 * 1024 * 1024`, `+server.ts:37`) also has **no
  practical trigger for legitimate traffic**: the client only ever uploads a sub-1 MB canvas
  screenshot, so the cap-exceeds-envelope concern is a DoS-surface note, not a functional bug.
  Reject an oversized `Content-Length` early if cheap, but gate the byte-budget rewrite on measured
  deploy limits.

#### Verification

**Do first (unit, no deploy):** add a fake-timer test proving `verifyKey()` aborts on a hung
provider, and one proving `generateImage`/`verifyKey` deadlines are set below the target ceiling.
**Then, gated on deploy access:** inspect the built function manifest to determine
buffered-vs-stream invocation and the real request/time limits; run a deploy-preview smoke at
just-under/over upload boundaries and against a deliberately delayed provider, confirming Splotch
(not the platform) returns the timeout. Reconcile ADR-0006 and the API skill with the *measured*
budget — do not hard-code the unverified 6 MB / 60 s numbers.

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

**Vet 2026-07-14 (confirmed, but downgrade severity):** `readStore()` (`tokens.ts:68–70`)
destructures only `etag` from `setJSON(KEY, seeded, { onlyIfNew: true })` and unconditionally
returns `{ store, list: seeded, etag }` — the `modified` flag is ignored, so a lost write still
returns the env seed. Real. Two mitigating facts narrow the harm: (1) ADR-0025:122–123 **already
accepts** brief post-write staleness of the token list ("Acceptable for this data"); (2) the
"revoked token re-authorized" harm only fires if `ALLOWED_TOKENS_LIST` still contains that token —
after migration that env var is typically empty, in which case `seedFromEnv()` returns `[]` and the
code **already fails closed** (denies everyone briefly). The genuinely distinct, non-accepted harm
is narrow: reverting to the *migration-time env list* rather than merely-stale Blobs data. Keep the
fix (inspect `modified`; re-read on `modified:false`; fail closed if unconfirmed), but treat it as
low-severity hardening, not an active auth hole.

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

**Vet 2026-07-14 (confirmed; line refs corrected):** `undo()` sets
`setCanvasEmptyState(undone.wasEmpty)` unconditionally at `engine.ts:806`. The "commit doesn't
reassert false" fact lives at `commitStrokeGroup` (`engine.ts:446–452`) — **not** lines 368–380,
which is `beginStrokeGroup`; emptiness is re-scanned on lift only for erase strokes (`~723–725`), so
a pen/magic stroke leaves the flag stale. Trigger is credible: `ActionsPanel.svelte:130–132` fires
Undo on a plain tap, and the canvas uses per-pointer capture (`engine.ts:~734`), so a second finger
can tap Undo while finger 1 draws. The engine already has a stroke-straddling pattern to reuse —
`resetActiveCommandForClear` called from `clearCanvas` (`~823–824`).

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

**Vet 2026-07-14 (real, but low priority — ADR-documented as optional):** confirmed — the snapshot
response includes `persistent` (`+server.ts:42–44`), `applySnapshot` (`native/+page.svelte:46–63`)
reads only `data.invites`, and `AdminConsole` is rendered without the prop so it defaults to `true`
(`AdminConsole.svelte:38`). **But ADR-0025:99–103 explicitly documents this as a known, accepted
state** ("the native console defaults the AdminConsole prop to `persistent = true` … and does not
currently surface the banner, *but could* thread the field through") — so it's a documented optional
enhancement, not a latent bug, and in production the native app hits the Blobs-backed hosted API
where `persistent` is always `true`. The strongest concrete justification is that the E2E comment at
`admin.spec.ts:60–61` ("JSON snapshot can't carry a persistence signal") is **factually wrong** —
the snapshot does carry it. Keep as low-priority cleanup driven by correcting that misleading test.

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

**Vet 2026-07-14 (confirmed; persistence-ordering is the meat, reopen race is secondary):**
`setAiUserApiKey` (`settings.svelte.ts:219–222`) assigns `settings.aiUserApiKey = v`
**synchronously** (`:220`) and only *then* returns the persistence promise (`:221`);
`hasApiKey`/`aiLocked` (derived in `AiKeyManager.svelte:31–33`) flip immediately, and a `saveApiKey`
rejection lands in the outer catch (`AiKeyManager.svelte:125–128`) that shows a network error
**without rolling back** the live key. So the feature reads unlocked while the key vanishes on
reload — the primary, deterministic fix is persist-then-flip (or roll back on rejection). The reopen
race (the `$effect(open)` reset at `AiKeyManager.svelte:59–65` clears the `keyStatus === 'checking'`
re-entrancy guard, letting a late verify A resolve after a reopened B) is real but narrow (submit →
close → reopen → submit a different value inside one pending request) — fold it in as the secondary
abort/request-id fix, not the headline.

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

Add a detail-zero `click` activation path for palette swatches and focused hexagons while retaining
the existing pointer paths for touch/stylus exploration. `scribbleTap` can supply that behavior for
the palette; the delegated hex grid needs either a keyboard-only button handler or a factored
pointer-independent selection function so adding per-button pointer handling does not double-fire
the bubbled delegated gesture. Ensure a pointer gesture still commits once and gap-snapping remains
unchanged.

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
and Parent Center/About UI. The current production build places the registry in an approximately 181
KB raw/65 KB gzip chunk imported by the initial drawing route, partially undermining ADR-0049's
dynamic overlay split.

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

## Source: Extract audit

### [Extract] resolveOutlineTargets

**File(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs` (`pagesUnder` / `resolveArg`, lines
119–140), `tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (`pagesUnder` / `resolveArg`, lines
195–210), `tools/asset-gen/bin/gen-coloring-chalk.mjs` (`pagesUnder` / `resolveArg`, lines 249–264),
`tools/asset-gen/bin/check-coloring-drift.mjs` (`pagesUnder` / `resolveArg`, lines 39–57),
`tools/asset-gen/bin/audit-outline-solidity.mjs`, `tools/asset-gen/bin/audit-fill-eyes.mjs`, and
`tools/asset-gen/bin/review-orb-eyes.mjs`

#### Problem

Seven asset commands independently glob the outline tree and resolve some combination of an explicit
WebP, page id, or category directory. The copies have already drifted in observable ways: one
intentionally includes cover art while the others select only tall/wide pages, some accept an
explicit `.webp`, some sort in `pagesUnder`, some sort only after flattening, and missing targets
are variously returned for a later file error or rejected immediately. Reading any command requires
re-deriving that policy, and changes to page naming or argument behavior must be repeated across the
whole toolset. Halo/punch tools use materially different target domains and should not be folded
into this helper merely for a larger caller count.

#### Proposed solution

Add `resolveOutlineTargets` to a nearby `tools/asset-gen/lib/outline-targets.mjs`. Its options must
make the real policy differences explicit—at minimum tall/wide-only versus cover-inclusive,
explicit-file support, ordering, default-all, and missing-target behavior—rather than silently
standardizing current CLI contracts. Each caller should then read as parse options → resolve targets
→ process targets.

**Vet 2026-07-14 (confirmed across all seven callers; parameterize, don't unify):** the duplication
is present in `gen-coloring-fills.mjs` (119–138), `gen-coloring-fills-dark.mjs` (195–210),
`gen-coloring-chalk.mjs` (249–264), `check-coloring-drift.mjs` (39–57), `audit-outline-solidity.mjs`
(17–28), `audit-fill-eyes.mjs` (23–36), and `review-orb-eyes.mjs` (28–39). The drift is
**intentional policy, not accident** — `audit-outline-solidity.mjs` globs `**/*.outline.webp`
(includes category covers) while the other six glob `**/*-{tall,wide}.outline.webp` (skip covers);
sort happens inside `pagesUnder` for some and at the call site for others; missing targets return
`[asFile]` (defer to ENOENT) in most but `fail()` in `audit-fill-eyes.mjs`. So the helper is only
safe if parameterized — `resolveOutlineTargets(args, { includeCovers, onMissing, sort })`. A
zero-arg "standardizing" helper would be **more** brittle by erasing those deliberate differences;
the win is removing ~140 lines and preventing a future edit from silently un-syncing the six
cover-skipping callers.

#### Verification

Add asset-tool unit coverage using a temporary category tree for no args, category, page id,
explicit WebP, cover inclusion/exclusion, missing page, stable ordering, and Windows-style path
normalization. Run `npm run test:asset-gen` and compare target lists from all seven callers before
and after extraction; do not use the semantically different halo tool as equivalence evidence.

### [Extract] authorizeGenerationRequest

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`POST`, lines 47–92)

#### Problem

The route handler embeds a security-sensitive state machine before its image work: select BYOK vs.
managed credentials, blind rate-limited token guesses before the allowlist read, charge only failed
managed guesses to the shared verification bucket, then apply a different generation bucket for
valid managed traffic or BYOK. The intertwined early `Response`, thrown HTTP errors, and derived key
make the handler hard to read and make this auth contract difficult to unit-test independently of
multipart/image/provider behavior.

#### Proposed solution

Extract
`async function authorizeGenerationRequest(input: { apiKey: FormDataEntryValue | null;
token: FormDataEntryValue | null; clientAddress: string }): Promise<GenerationAuthorization |
Response>`
in the same route module (or a small server-only neighbor). `GenerationAuthorization` should carry
`usingByok`, `effectiveKey`, and a validated managed token when present; the `Response` arm should
be only the standard throttled response. Preserve the failure-only guess budget and the separate
valid-token/BYOK buckets exactly.

#### Verification

Unit-test limited guesses without an allowlist read, one failed guess consuming the shared bucket,
valid managed traffic not consuming it, managed per-token throttling, BYOK per-IP throttling, and a
missing server key. Then run `npm run test:api:smoke` to confirm the public 403/429/400 contract and
`Retry-After` header are unchanged.

### [Extract] readAiImageResponse

**File(s):** `web/src/lib/drawing/aiImage.ts` (`generateAiImage` response handling, lines 82–104)

#### Problem

The generation orchestrator decodes four HTTP outcomes inline while also owning export, request
construction, timeout, UI state, and auto-save. Safety refusal and throttling are early-return UI
side effects, generic errors throw with response text, and success reads the blob. That makes the
client's API interpretation difficult to test as a response matrix and hides the intent of the
happy-path call site.

#### Proposed solution

Extract `async function readAiImageResponse(response: Response): Promise<AiImageResponse>` in
`aiImage.ts` or a nearby client-only module, returning a discriminated union such as `image`,
`safety`, `throttled` (including `Retry-After` and diagnostic detail), or `error`. Keep the
child-facing UI transition and logging in `generateAiImage`; the helper should only translate the
HTTP contract into domain data.

#### Verification

Unit-test synthetic 200, 422, 429-with/without-`Retry-After`, generic non-OK, and unreadable-body
responses. Assert the extracted function never mutates `ui`; then retain orchestration tests showing
each union arm produces the same safety/retry/generic state and only the image arm can auto-save.
