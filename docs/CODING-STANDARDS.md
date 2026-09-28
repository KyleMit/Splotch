# Coding standards

The practices that matter most in this repo, each with the failure that earned it and the mechanism
that enforces it. The always-loaded one-line form of each rule is in the root `CLAUDE.md`
"Conventions" section (source: `.ruler/conventions.md`); the tools-only rules are in
`tools/CLAUDE.md` (source: `tools/.ruler/AGENTS.md`). This doc is the rationale and the evidence.
Read it by lookup, before proposing a new rule, relaxing one, or re-proposing something listed under
[Considered and not adopted](#considered-and-not-adopted).

The rules come from the 2026-09 clean-code campaign (tracking issue #2376). Its source review, with
the grades and the motivations analysis, is
[`docs/scratchpad/clean-code-principles-review-2026-09-27.md`](scratchpad/clean-code-principles-review-2026-09-27.md).
The 2026-09-28 code-quality burndown (tracking issue #2443) extended rules 1, 4, 5, 8, and 9 rather
than adding new ones. Every PR cited below merged during one of those two campaigns.

## What earns a rule

A practice becomes a standard here only when all three hold:

1. **It names a failure or a repeated cost that happened in this repo** — a bug, a drift, a
   misleading name, a gate that could not fail. Cite it.
2. **It is the smallest rule or boundary that prevents that failure.** A rule that adds indirection,
   a new abstraction, or a new file without removing a real cost does not qualify.
3. **It names its enforcement**: a lint rule, a type, a drift-guard test, a budget, or "review"
   where no mechanism fits yet. A lint rule is adopted by ADR-0031's measured bar: the codebase
   already complies, and the residue is fixed in the adopting change.

Principle names (SOLID, DRY, YAGNI, CQS, "make illegal states unrepresentable") are vocabulary, not
standards. They explain why a rule helps; they never justify a change on their own. Splotch is an
app with no outside consumers, written mostly by agent sessions with no memory, whose users cannot
report bugs. So the rules favour what lets a fresh session change one place safely: hidden coupling
and re-derived rules cost more here than long files do.

**Performance veto.** No principle outranks measured startup or per-pointer-event hot-path cost. A
refactor that adds work before hydration or on the drawing hot path needs a measurement, not an
argument (rule 7).

## Rules at a glance

| #  | Rule                                                                         | Enforcement                                                                                                                                                    |
| -- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | [Ask the owner; don't re-derive its rule](#1-ask-the-owner)                  | Review; a test on the owner; a test that settles a superseded call last                                                                                        |
| 2  | [One union per mode](#2-one-union-per-mode)                                  | Types; `expectTypeOf` type tests run by `npm run check`; `Record<Union, V>` tables                                                                             |
| 3  | [Names tell the truth about effects](#3-names-tell-the-truth)                | Review; `DeepReadonly` parameters where a query must stay pure                                                                                                 |
| 4  | [Validate at the trust boundary](#4-validate-at-the-trust-boundary)          | Boundary tests with missing and malformed inputs; `unknown` input narrowed by a guard, never cast                                                              |
| 5  | [One declared contract per wire boundary](#5-one-contract-per-wire-boundary) | A test that reads both sides; typed stubs; review for native platform behaviour                                                                                |
| 6  | [Server-only packages and storage modes are fenced by lint](#6-lint-fences)  | `SERVER_ONLY_PACKAGES`, `BLOBS_CONSISTENCY_EXPLICIT`, `STORAGE_SEAM_ONLY`, `API_HANDLER_WRAPPED` in `eslint.config.js`, each with a positive control           |
| 7  | [The startup path is a budget](#7-the-startup-path-is-a-budget)              | `STARTUP_MODULEPRELOAD_COUNT`, `NATIVE_STARTUP_MODULEPRELOAD_COUNT`, `MAX_STARTUP_JS_CSS_BYTES` (`tools/check-bundle-budgets.mjs`); `STARTUP_REQUIRED_MARKERS` |
| 8  | [Tools: entries, strict flags, validate first, size ratchet](#8-tools)       | `tools/tests/tool-specifier-resolution.test.mjs`, `tools/tests/tool-entry-flags.test.mjs`, `rejectUnknownFlags`, `TOOLS_GRANDFATHERED_MAX_LINES`, `no-undef`   |
| 9  | [Tests prove they can fail](#9-tests-prove-they-can-fail)                    | Lint guards on test files; a negative control noted in the PR, for gates too; `docs/TESTING.md`                                                                |
| 10 | [Comments state stable facts about code that exists](#10-comments)           | Review; `npm run check:doc-refs` for docs                                                                                                                      |
| 11 | [Exceptions are declared and ratchet down](#11-exceptions-ratchet-down)      | Ratchet tests and caps listed in rule 11                                                                                                                       |

## 1. Ask the owner

**Rule.** When a module owns a rule — a store method, a policy function, a layout helper — call it.
Don't rebuild the answer at the call site from the raw fields the owner reads.

**Why here.** A re-derivation is correct on the day it is written and drifts the day the owner
changes. Each agent session rebuilds hidden invariants from whatever it happened to read, so a rule
with two homes eventually has two answers.

**Earned by.** These campaign fixes were re-derivations of an owner's rule:

* PR #2377, a real bug: with the Tool Drawer off, a Pencil double-tap still selected the hidden
  Eraser, because the handler read `eraserEnabled` instead of asking
  `actionControlShown('eraserEnabled')`.
* PR #2386: six sites re-derived which AI credential applies; they now ask `aiCredentialKind()`.
* PR #2394: the orientation-lock rule was computed in three places, one with its own vocabulary;
  `orientationChoice()` owns it.
* PR #2412, a real bug: "device info only with a bug report" lived in three client sites and the
  server never applied it; `attachesDevice()` in `web/src/lib/report.ts` owns it on both sides.
* PR #2400: the extra-books count carried a `- 1` at each site; the store exposes
  `downloadedBookCount`/`downloadableBookCount`.
* PR #2415, a real bug: Settings told iPad users the Share button was "at the bottom";
  `iosShareButtonLocation()` is now the one answer both components use.
* PR #2429: every caller applied the dark-mode ink rule for the Black swatch, and one default got it
  wrong in dark mode; `colorsState.themedSwatchColor()` owns it. The same PR gave the duplicated
  credential migration one owner, `hydrate()` in `secureCredentialCoordinator.ts`.

An owner does not stop a caller that never asks. After PR #2412, the AI report still gated the
device snapshot on the opt-in alone, right only because its kind defaulted to a bug report, until PR
#2424 routed it through `attachesDevice()`.

The same holds for state: a value has one writer (ADR-0002's `$bindable` rule). PR #2419 moved the
AI report status out of a two-deep `bind:` chain into `createImageReportFlow()`. PR #2429 removed an
appearance effect that wrote another store's `activeColor`, and PR #2422 had Settings sections read
`open` from the store instead of a prop drilled to twelve sections that three used.

Code that runs after an `await` is also a writer, and by then a newer call may own the value. Before
it writes, it checks that its own call is still the current one. For a submit, that answer comes
from `createLatestRequest()` in `web/src/lib/latestRequest.ts`. Elsewhere the check compares
identity, never a flag that later calls share. PR #2449 fixed two bugs of this kind:

* A save into a folder that had moved forgot a folder the parent chose while the save was still
  running. `saveBlobToFolder` now forgets the folder only when `(await loadHandle()) === handle`.
* One boolean latch on the AI result card left the next result's Download dead until a closed card's
  save settled. The latch is now `savingUrl`, keyed to the result being saved.

**Enforcement.** Review, plus a test on the owner method rather than on a caller's copy (for example
`web/src/lib/plugins/pencilEraser.test.ts`, `web/src/lib/ai/credentials.test.ts`). A test double
that re-implements the owner's rule tests its own copy (rule 9). For the stale-write case, the test
holds the superseded call open, starts the newer one, settles the old one, and then asserts the
newer call's state survived (`web/src/lib/drawing/folderSave.test.ts`).
`web/src/lib/components/AiImageResult.download.test.ts` covers only the first half: the next
result's save starts while the old one is still pending.

## 2. One union per mode

**Rule.** Model a thing with modes as one discriminated union, where each variant carries only the
fields it uses. Props and fields must not combine into states the code ignores. This extends the
conventions' "close finite value sets in the type".

**Why here.** Agents write confident code against whatever the type allows. Three booleans that can
contradict each other invite the next session to set two of them.

**Earned by.** The engine's brush as one `BrushType` instead of three booleans (PR #2389). The AI
error phase as the `AiFailure` union (PR #2403). The free-generation grant as `FreeGenerationGrant`
(PR #2391). `Button` rejecting link props its anchor would drop (PR #2378). `SegmentedPicker` split
on mode, where `mode="toggle"` plus `inputName` used to render radios with no `aria-pressed` (PR
#2399). Secret names and style names closed as unions (PR #2410). The verify-credential result as
`VerifyCredentialResult` (PR #2386).

**Enforcement.** The types themselves, with exhaustive `Record<Union, V>` tables (a new variant
fails to compile, as with `STROKE_FLAGS_BY_BRUSH`). A component props union is pinned by a type test
— `expectTypeOf(...).not.toExtend` over `ComponentProps<typeof X>`, which `npm run check` evaluates
(`web/src/lib/components/design/Button.props.test.ts`,
`web/src/lib/components/design/SegmentedPicker.props.test.ts`) — not by `@ts-expect-error`.

**Known limits.** A spread bypasses excess-property checks, so `{...{ href, onclick }}` still
reaches `Button`. A `never` marker on every other attribute hit TS2590 ("expression produces a union
type that is too complex") in this repo; measure before widening a union that way (PRs #2378,
#2403).

## 3. Names tell the truth

**Rule.** A function named as a query has no side effects, and paired verbs behave alike. When a
name and a behaviour disagree, rename or split — don't add a comment.

**Why here.** A reader, human or agent, calls what the name promises. A query that mutates also
breaks in a Svelte render (`state_unsafe_mutation`).

**Earned by.** PR #2382, a real layout bug: `isAiImageButtonVisible` actually meant "usable", so the
toolbar glass stopped one button short whenever the AI button was shown but disabled. It is now
`isAiImageButtonUsable`, and one `shownActionButtonCount()` replaced two near-synonym counts. PR
#2390: the parental gate's input predicate mutated state and is now the pure `gateAcceptsInput()`;
`verifyCachedFileOrEvict`, `readUsageAndPurgeExpired`, and `readJobImage` name what they do. PR
#2385: `engine.ts` names that held the wrong unit (`lineWidth` in CSS pixels) or duplicated another
function's name (two `setColorSheet`s) were corrected.

**Enforcement.** Review. Where purity matters, a `DeepReadonly` parameter makes the compiler reject
a mutation (`gateAcceptsInput`).

## 4. Validate at the trust boundary

**Rule.** Input from outside the type system — a request, a worker payload, a stored record, a
server reply, a tool flag, an evidence file — arrives as `unknown`, is narrowed by a strict guard or
parser, and fails loudly when it doesn't fit. Give each API one failure convention; where an API
keeps two (reject and resolve `null`), its declaration names both and every caller handles both.
Absence never becomes a value by default. A missing field, a missing or unreadable file, or a failed
command is an error, or a case the code handles by name. It is never quietly read as an empty list,
a zero, or the harmless answer. This extends the conventions' "`as` is a boundary tool".

**Why here.** The users are toddlers: a lost drawing is the product failing silently, and nobody
files the bug. AI generation costs money, and capture tooling that accepts a bad input produces
plausible wrong numbers.

**Earned by.**

* PR #2380: generate-image relabelled an upload with no MIME type as PNG and sent it to the paid
  provider; `assertAllowedImageType` now refuses it.
* PR #2383: the background worker read a payload field before checking its shape, so a `null` POST
  threw; `isGenerationWork` guards it.
* PR #2399: an old-shape IndexedDB entry became a 9-byte "undefined" file that Try again would save;
  `isStoredPicture` validates each record.
* PR #2387: report replies were read through an implicit `any`; `readReportReply` narrows them.
* PRs #2388 and #2409: tool flags parsed leniently (`4junk` read as 4, an unknown flag was ignored);
  see rule 8.
* PR #2401: a truncated evidence index was skipped silently, which turned off a refusal gate; it now
  throws, and `assertReadableSchema` refuses an unknown capture schema.
* PR #2379, data loss: Save on Delete cleared the drawing with no banner when `exportCanvasBlob()`
  rejected instead of resolving `null`. Its declaration now names both failure channels.
* PR #2425, a real bug: a key check that got no answer was reported as 403 "Invalid API key", so a
  parent's report of an inappropriate picture was lost. The GitHub call had no timeout; it now has
  `GITHUB_REQUEST_TIMEOUT_MS`, and `web/src/lib/ai/limits.test.ts` holds the deadlines under
  `NETLIFY_SYNC_TIMEOUT_MS`.
* PR #2427: `request.formData()` reads were unbounded and turned a file part into "[object File]";
  `readFormBody` in `web/src/lib/server/http.ts` bounds them. Installation ids reached the function
  log, which `loggableError` in `web/src/lib/server/logRedaction.ts` now masks.
* PR #2430, a real bug: a failed save still wrote its dedupe record, so later AI auto-saves skipped
  the drawing, and one encode error terminated the PNG worker under concurrent exports.
* PR #2448, data loss: Android's coloring-pack `status` read a missing `books` array as an empty
  list (`call.getArray("books", new JSArray())`), and reconcile then deleted every downloaded book.
  iOS rejected the same call. `requiredArray` in `ColoringPacksPlugin.java` now rejects it too.
* PR #2446: `Number('')` is `0`, so a blank `androidVersionCode:` pinned versionCode 0, and a
  missing Gradle `versionCode` fell back to `?? 0`. The release tagged, pushed, and published before
  Play refused the build. `chooseVersionCode` in `tools/release/cut-release.mjs` now names blank as
  unpinned and rejects the rest.
* PR #2455: `check-build-version` read a missing `sw.js` as "native build", so a web build that
  stopped emitting its service worker passed. It now uses its own `--native` flag, and
  `tools/tests/check-build-version.test.mjs` fails a web build without `sw.js`.
* PR #2451 fixed in `perf:analyze:frames` the bug PR #2401 had fixed in the rescorer: a corrupt
  evidence index read as "no refusal". A fix in one reader does not reach the other readers of the
  same file, so look for them when fixing one.

**Enforcement.** Tests at the boundary, and the types: a guard or parser over `unknown`, never a
cast to the expected shape (PR #2410 replaced a `style as StyleName` cast with
`parseGenerationJobContext`). The boundary test includes the missing and malformed inputs as
fixtures, for example the blank-pin and missing-Gradle-code cases in
`tools/release/tests/cut-release.test.mjs` and the index written as `{` in
`tools/perf/tests/rescore-captures.test.mjs`. Java and Swift have no unit harness, so the plugin
side is review (rule 5).

## 5. One contract per wire boundary

**Rule.** Every wire boundary — client and server, route and worker, JS and native — has one
declared contract, imported by every side that can import it, and a test that reads both sides. This
is the conventions' "cross-file agreement is never maintained by prose" applied to the wire; it is
not restated here.

**Why here.** E2E specs mock the server, so a one-sided rename passes every test and breaks
production.

**Earned by.** The AI generation ticket: `GenerationStartedBody`, with
`web/src/routes/api/generation-result/settlementTestHarness.ts` parsing every server ticket through
the client's `readAiImageResponse` (PR #2383). Report field names and kinds
(`IMAGE_REPORT_FORM_FIELDS`, `REPORT_FORM_FIELDS`; `web/src/lib/reportClient.test.ts` sends the
client's requests to the real handlers; PRs #2387, #2406). The job-id format, owned by `isJobId` (PR
#2393). Privacy-policy claims against the purge functions' schedules (`IMAGE_REPORT_REVIEW_HOURS`;
`tools/mobile/tests/privacy-consistency.test.mjs`; PR #2411). Native plugin names and registrations
(`web/src/lib/plugins/registration.test.ts`, PR #2402), and since PR #2436 the fields each native
method resolves. The verify-key and verify-access-code request bodies (`VerifyKeyRequestBody`,
`VerifyAccessCodeRequestBody` in `web/src/lib/ai/keyFormat.ts`, sent through both real handlers by
`web/src/lib/ai/verifyCredential.wire.test.ts`; PR #2432). The privacy policy's "Last updated" date
against a hash of its rendered text (`web/src/routes/privacy/policyRevisionsTestHarness.ts`; PR
#2437, after the date stayed put through a text change).

**Enforcement.** The both-sides test. Test stubs of a boundary function are typed from the real one
(`vi.fn<typeof realFn>()`), so a changed signature fails `npm run check`; an untyped stub had
drifted to a shape the real function never returns (PRs #2383, #2393).

**Known limits.** For native plugins, the both-sides test checks names and the fields each method
resolves, not how each platform behaves. PR #2448 found two platform gaps:

* Given the same malformed `status` call, Android deleted every book and iOS rejected the call.
* iOS `remove()` left a pending `install` promise unsettled, while `cancel()` and Android both
  rejected it. `settleCompletion` in `ColoringPacksPlugin.swift` now owns taking the completion and
  calling it.

Java and Swift have no unit harness. So two properties are enforced only by review: a native method
settles its call on every path, and both platforms answer the same input the same way.

## 6. Lint fences

**Rule.** A boundary that one import or one omitted option can cross is fenced by lint, and every
lint fence has a positive control: a test that seeds the violation and fails if the rule's glob
narrows or stops firing.

**Why here.** A lint rule scoped to a glob that matches nothing reports nothing, which looks the
same as a clean repo.

**Earned by.** `sharp` sat one import away from client code in `lib/ai/` (PR #2392). Eight Blobs
stores used the SDK's default eventual consistency by omission, the mode behind ADR-0105's failed
free generations (PR #2393). An `/api` handler not wrapped in `apiHandler` compiles and passes its
unit tests, yet answers `{ message }` to clients that parse `{ ok, error }` and skips the error log
(PR #2432).

**Enforcement.** In `eslint.config.js`: `SERVER_ONLY_PACKAGES` (positive control
`tools/tests/server-only-imports-lint.test.mjs`), `BLOBS_CONSISTENCY_EXPLICIT`
(`tools/tests/blobs-consistency-lint.test.mjs`), and the existing `STORAGE_SEAM_ONLY`
(`tools/tests/boundary-string-lint.test.mjs`), and `API_HANDLER_WRAPPED`
(`tools/tests/api-handler-lint.test.mjs`). `WEB_SRC_SYNTAX_RESTRICTIONS` composes the `web/src`
syntax set once for every block that extends it. The same pattern guards tools: `no-undef`
(`tools/tests/tools-no-undef-lint.test.mjs`) and `max-lines`
(`tools/tests/tools-max-lines-lint.test.mjs`).

**Known limits.** `no-restricted-imports` sees static imports only, not `import()`. The Blobs
selectors match a bare `getStore` callee, not an alias. A selector matches a name, not a binding:
the first `API_HANDLER_WRAPPED` was bypassed by a destructured import until binding selectors pinned
`apiHandler` to its `$lib/server/http` import (PR #2432). Flat config replaces a rule's earlier
entry, so a new restriction must be recomposed into every block for that rule (ADR-0031). Some
server boundaries are still prose or defaults rather than lint: `.claude/rules/server-api.md` asks
for `readFormBody` over `request.formData()`, and `handleApiCaching` in `web/src/hooks.server.ts`
defaults every `/api` response to `no-store` (PR #2427), which the API smoke asserts
(`tools/api-smoke/lib/api-caching.mjs`, PR #2432).

## 7. The startup path is a budget

**Rule.** The code that runs before hydration is a measured budget, not a guideline. A new runtime
import from a startup module into a module that lazy code also imports can split that module into a
new startup chunk; give the shared piece its own module that no lazy client code imports, as PR
#2404 did. Where a startup module cannot share code, keep the conventions' bundle-boundary copy with
its drift guard.

**Why here.** The first stroke must land before hydration (ADR-0072), on a 120 Hz iPad.

**Earned by.** PR #2391 added a startup module's runtime import of `$lib/freeGenerations`, which
lazy code also imported, so Rolldown split it into a new 158-byte startup chunk: one more request
before hydration, invisible to the byte budget and to every module marker. PR #2404 moved the check
to `web/src/lib/installationId.ts` and pinned the count. A native-only import behind
`__IS_CAPACITOR__` can do the same to the native build while the web count holds; a reviewer found
one on PR #2406, and PR #2418 pinned the native count too.

**Enforcement.** `STARTUP_MODULEPRELOAD_COUNT` and `NATIVE_STARTUP_MODULEPRELOAD_COUNT` in
`tools/check-bundle-budgets.mjs` are exact, two-sided pins enforced by `npm run build` and
`npm run build:cap` on the release build; a change in either direction fails and asks for the
constant to move with a reason. `MAX_STARTUP_JS_CSS_BYTES` holds the bytes, and
`web/tests/startup-bundle.spec.ts` pins which modules load at startup, including
`STARTUP_REQUIRED_MARKERS` for a module that must stay eager (the install prompt's listener, PR
#2428). ADR-0032's 2026-09 amendments record the reasoning.

## 8. Tools

**Rule.** In `tools/`: a library module never imports an entry script; flags parse strictly and an
unknown flag is fatal; a tool validates the inputs a write, tag, push, or delete depends on before
that step runs; files are size-ratcheted. The detail lives in `tools/CLAUDE.md` ("Libraries: one
shared, many owned" and "Writing a tool").

**Why here.** A capture tool that accepts a mistyped flag produces a capture that looks valid and
skews a published number.

**Earned by.** Imports of entry scripts made two import cycles, and a device runner loaded a
3,000-line capture script for one regex (PR #2397). A second `=`, a bare flag, `4junk`, or an
unknown flag each ran with a silent default (PRs #2388, #2409). Exported perf functions read flags
in parameter defaults, so a flag passed to one CLI would have silently changed another's in-process
call (PR #2439). `--seconds=2.5` drew for 3 s while the capture recorded 2.5 (PR #2441), and
asset-gen overwrote tracked shipped files before checking them (PR #2435). `tools/` had no size cap
and grew by about 18,000 lines in 30 days (PR #2405). With `no-undef` off, dropped imports shipped
as `ReferenceError`s, and `freePort` killed another worktree's server (PR #2381).

Checks that ran after the writes they were meant to guard:

* `ruler:apply` rewrote every instruction file and wiped both skill trees before its source checks
  ran. When the stray-note guard threw, Ruler had already concatenated that note into the root
  `CLAUDE.md` (PR #2444).
* `npm run release` tagged, pushed, and published before a bad version pin surfaced (PR #2446).

**Enforcement.** `tools/tests/tool-specifier-resolution.test.mjs` (library → entry edges);
`rejectUnknownFlags` and `parseNumberFlag` in `tools/lib/proc.mjs`, `parsePerfArgs` in
`tools/perf/lib/cli-args.mjs`, and `tools/tests/tool-entry-flags.test.mjs` (which also fails a flag
read in an exported function's parameter default); `max-lines` with `TOOLS_GRANDFATHERED_MAX_LINES`
in `eslint.config.js`; `no-undef` across `tools/`; `freePort` in `tools/lib/vite-server.mjs` throws
on a listener outside the checkout. `generateFromValidatedSources` in `tools/ruler/apply-ruler.mjs`
runs read-only plans before generating, and the bad-source cases in
`tools/ruler/tests/apply-ruler.test.mjs` assert that generation never ran. In `cut-release.mjs`,
`main()` parses the arguments and `chooseVersionCode` decides the version code before the first
write, which is `resolveVersionCode` pinning that code into the release file. Review holds that
order; `tools/release/tests/cut-release.test.mjs` covers the rejections themselves.

## 9. Tests prove they can fail

**Rule.** Every guard or regression test ships with a negative control — the test run against the
unfixed code or a seeded violation, and seen to fail — and the PR says so. Each test builds its own
fixture, drives real stores instead of doubles that copy their rules, pins copy exactly as rendered,
and names its timeouts with measured headroom. A gate, checker, or liveness probe is a test of the
repo and meets the same bar. It reports a pass only after it has compared something, and a fixture
pins its failing verdict. An E2E spec that asserts something happened waits on a state change the
app exposes, not on a sleep. A check that something did not happen first waits until it could have
happened.

**Why here.** A test that has only ever passed carries no evidence it is connected to anything.

**Earned by.** Two release-gate tests passed with their deciding input removed, because a sibling
mutated a shared fixture (PR #2414). Plain-object settings doubles broke 23 tests when PR #2386
changed the store, and the repair copied its `aiCredentialKind` rule, so the tests checked their own
copy (PR #2413). A whitespace-collapsing copy test hid a Prettier re-wrap that changed the rendered
text (PR #2400); PR #2411's exact pins caught the same trap. Two coloring-pack regressions (caching
before verification, remembering a failed manifest load) would have passed the whole suite until PR
#2431 added `web/src/lib/coloringPacks/manager.webStore.test.ts` on the real web store, and PR #2436
gave a positive control to a blank-undo test that could pass vacuously. Tests running close to their
timeout failed on loaded CI runners, one at 5,570 ms against a 5,000 ms default (PRs #2401, #2407,
#2417).

Gates that passed without checking what they claimed:

* PR #2447: the Codex `burn-down-audits` skill looked for a running driver with a `pgrep` pattern
  that matches no file, so it always answered that nothing was running. `show-pr-state --json`
  returned a constant `checksMayStillRegister: true`, and its test asserted that constant.
  `DRIVER_PROCESS_PATTERN` in `tools/audit-burndown/lib/burndown-core.mjs` is now the one pattern,
  and `tools/audit-burndown/tests/driver-process-pattern.test.mjs` requires it at every `pgrep`
  lookup in the burndown hooks, both skill packages, and `show-status.mjs`.
* PR #2455: `check:github-actions` never read the pins inside `.github/actions/`, read a bare commit
  SHA's leading digits as a major version, and printed ✓ beside a pin it had not compared.
  `latestStatus` in `tools/check-github-action-versions.mjs` now prints ✓ only after a comparison,
  pinned by `tools/tests/check-github-action-versions.test.mjs`.
* PR #2450: the perf instrument fingerprint's tests checked only that each command's module list was
  non-empty, and the lists left out the modules that dispatch every action tap.
  `tools/perf/tests/instrument-import-graph.test.mjs` now walks each command's imports against its
  list. The AI ready-cue matcher under test was also not the copy the page ran; the page script now
  serialises the tested `isAiReadyCueAnimation` (`aiReadyCueWaitScript`).
* PR #2445: an E2E spec slept 900 ms and then read the swatch rings before `<html>` carried the new
  Reduce Motion answer. With the regression injected, it passed 3 runs of 3. The specs now sync on a
  state change the app exposes: `getAnimations(...)` `finished`, the request's
  `requestfinished`/`requestfailed`, and `strokeRevision`.

**Enforcement.** Lint rejects the structural forms of a test that cannot fail, with
`tools/tests/vacuous-test-lint.test.mjs` as their positive control. The rest is review, and
`docs/TESTING.md` carries the detail: "A regression test must fail against the old code", "A test
owns its inputs", and, for E2E waits, "No fixed `waitForTimeout` to wait for something to *happen*".

## 10. Comments

**Rule.** Comments state stable facts about code that exists. This is the existing conventions
bullet; the campaign added only the words "about code that exists".

**Earned by.** PR #2420 fixed comments that named deleted functions or files, narrated history, or
left a test-only seam unmarked, and PR #2438 repointed docs and comments at code the campaign moved.
PR #2379 corrected a comment that promised the wrong failure channel, and PR #2428 one whose
"guarantees" the orientation lock's latch made false.

**Enforcement.** Review for code comments. For docs, skills, and rules, `npm run check:doc-refs`
fails on a repo path or npm script that doesn't resolve.

## 11. Exceptions ratchet down

**Rule.** An exception to a rule is declared in one list, next to the rule, and ratchets down. The
change that makes an entry obsolete removes it. A cap frozen at its file's exact size
(`TOOLS_GRANDFATHERED_MAX_LINES`) is lowered in the change that shrinks the file; a reviewed
per-file override keeps about 75 lines of headroom by design and is lowered once the
`burn-down-oversized-code` measurement reports it stale, with more than twice that headroom spare.
Adding an entry or raising a cap stays possible, but only in the diff, with its reason, where a
reviewer sees it (the `burn-down-oversized-code` skill raises a cap when a split would make the code
worse).

**Why here.** An undeclared exception is indistinguishable from a violation, a list that grows
without a reason in the diff becomes the rule, and slack left by a stale entry is room for the next
regression.

**Enforcement.**

* `KNOWN_LIB_TO_ENTRY_IMPORTS` (`tools/tests/tool-specifier-resolution.test.mjs`) fails on a new
  edge and on a listed edge that no longer exists (PR #2397); PR #2439 cut it from four edges to
  one.
* `KNOWN_FLAG_READING_DEFAULTS` (`tools/tests/tool-entry-flags.test.mjs`) lists the exported
  functions still allowed a flag-reading default, with the same stale-entry test (PR #2439).
* The asset-gen coupling table in `tools/asset-gen/README.md` is the allowlist
  `tools/asset-gen/tests/import-boundary.test.mjs` enforces; an undocumented import or a stale row
  fails (PR #2435).
* `AUDITED_SWALLOWS` (`tools/perf/tests/silent-catch-inventory.test.mjs`) pins each silent catch by
  identity, so a swap or a new one fails; PR #2401 shrank it by two.
* `TOOLS_GRANDFATHERED_MAX_LINES` (`eslint.config.js`) freezes each oversized tool at its size, so
  growth fails lint. Lowering a cap after a shrink is review-enforced: `tools/CLAUDE.md` asks the
  shrinking PR to lower it, and PR #2405 rejected an equality test that would conflict on every
  shrinking PR, though PR #2426 shrank two listed files without lowering them and PR #2433 lowered
  them afterwards. The `burn-down-oversized-code` skill lists caps well above their file's size, and
  PR #2421 lowered ten.
* `ALLOWED_REFERENCES` (`tools/check-doc-references.mjs`) fails on an entry that stops matching.
* ADR carve-outs: the engine's module-scope state is ADR-0004's documented exception to the
  `createX()` factory convention. Changing it is an ADR amendment, not a refactor.

## Considered and not adopted

Proposed during a campaign and rejected with evidence. Don't re-propose one without new evidence.

| Idea                                                  | Why not                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Blobs repository or store-module abstraction        | Adds a hop without removing a cost: store names are already declared once, route tests mock one level up, and the one incident (consistency) is now a lint rule (rule 6).                                                                                                                                  |
| Moving direct env reads into `config.ts`              | `config.ts` is a pass-through with no validation, and `tools/tests/e2e-server-env.test.mjs` already guards the names. The real gap is startup validation of required env vars, a separate decision.                                                                                                        |
| Web fallbacks for native-only plugins                 | Dead code: every call site is already gated to its platform. PR #2402 deleted the one unreachable fallback.                                                                                                                                                                                                |
| A shared typed `$lib/platform` fake                   | A bare partial mock already fails loudly on a missing export, and a typed fake cannot catch a stale key beside a spread. No drift was observed.                                                                                                                                                            |
| Unifying `colorSheet`/`magicSheet`/`fillUrl` names    | Both sheet names are ADR vocabulary (ADR-0043, ADR-0091), about 40 sites sit on the per-pointer render path, and the fill-URL names name a different concept (the sheet's source).                                                                                                                         |
| Tree-wide `// @ts-check` for `tools/`                 | 413 errors in 110 files, about 90% inference noise; without a `tsc` step it is editor-only. `no-undef` covers the bug class that actually shipped (rule 8).                                                                                                                                                |
| `max-lines-per-function` for `tools/`                 | 101 functions over 125 lines, already bounded by the file cap; several are single page-injected functions by design (PR #2405).                                                                                                                                                                            |
| A `createDrawingEngine()` factory for the engine      | Possible under ADR-0004 and ADR-0072, but only as an ADR-0004 amendment that names the cost it removes and shows no startup or drawing regression. `BrushType` (PR #2389) took the most error-prone state.                                                                                                 |
| A brush discriminant on `StrokeOp`                    | Deferred: per-pointer hot path with an object-shape risk, and it needs a quiet-host drawing perf run. PR #2389 captured most of the value.                                                                                                                                                                 |
| Cancelling every timer, rAF, and listener on teardown | The #2443 campaign's audits found about ten timers, frames, and promise callbacks left running after teardown. None wrote live state, and several run on the startup or drawing path. The harmful form, a stale continuation that writes, is covered by rule 1.                                            |
| Declaring every repeated tuning value once            | The cross-file rule covers values that must agree, which PR #2451 drift-guarded (`MAX_RENDER_SCALE`). The capture tools' `PROBE_CONTACT_BUDGET_MS` and its siblings are tuned separately per tool, and `DISPLAY_COMMIT_CHARS` is only used for display.                                                    |
| A separate standard for native plugins                | Its incidents come from one PR (#2448), and no Java or Swift harness exists to enforce it. The missing-field lesson is in rule 4, and settling every call is in rule 5's known limits.                                                                                                                     |
| A portability rule for Claude Code hooks              | ADR-0017 and ADR-0062 already make macOS and Linux the targets. A burndown hook that tried BSD `stat` first broke that existing rule on Linux. PR #2452 fixed it with ADR-0017's own answer, doing the work in Node, and `tools/tests/agent-hooks.test.mjs` runs the hook under GNU- and BSD-style `stat`. |
