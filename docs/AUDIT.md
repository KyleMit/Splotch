# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Code audit

### [Architecture] Fit AI requests inside Netlify's deployed function envelope

**⏸ Pending decision:** Production metadata confirms `sveltekit-render` runs in streaming mode with
a 10-second ceiling. Choose an asynchronous job flow, a suitable buffered runtime, or another host
before setting generation, verification, upload, and output budgets; a timeout-only change would
either preserve uncontrolled termination or make legitimate image generation unusable.

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
