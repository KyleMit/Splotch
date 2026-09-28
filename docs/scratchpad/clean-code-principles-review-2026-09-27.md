# Clean-code principles review — 2026-09-27 (reconciled)

A whole-repository grading of Splotch against clean-code principles, and an analysis of which
motivations for those principles apply to this project. This note reconciles two independent reviews
of the same commit, one from a Claude Code session and one from a Codex session. Neither original
was committed, and this note replaces both.

* **Snapshot:** c34034213f2d27fe6ff8e98c30dbcc0e8f7f547f (`main` at the merge of PR 2375). Both
  reviews and the reconciling session read this commit.
* **Changes made:** none to code. No tests were run, and no issues or PRs were opened.
* **Status:** a point-in-time judgement. Nothing here is a backlog. The candidate follow-ups in
  section 9 are not filed as issues.

## 1. Sources and method

| Review          | How it ran                                                                                                                                                                                                                                                            | Weighting                                                                           | Evidence style                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** | Five read-only reviewer subagents ran in parallel with four principles each (Structure, Abstractions, Economy, Call-site style, Correctness/clarity). The orchestrating session then re-checked six findings.                                                         | Shipped app (`web/src`, server included) 70%, `tools/` and tests 30%; Economy 60/40 | Measured counts from `grep`, `wc`, `git log`, one-off `node -e` scripts (an import-graph walk, a 10-line duplication hash), `knip` |
| **Codex**       | One agent assessed the repository by major area: drawing engine, AI client and server, UI and state, settings, storage, PWA, native shells, automation, CI, and representative tests. It used the architecture and code-audit guidance, the code map, and call sites. | Not stated                                                                          | Qualitative judgments with cited files. It consulted ADRs for the motivations analysis. `node_modules` was absent.                 |

Both reviews graded from A+ to F against a well-run professional production codebase, where B means
solid and above average.

**Reconciliation rules.** The rules below produced each reconciled grade:

1. If both reviews gave the same grade, that grade stands.
2. If one review cited evidence that the other lacked, the reconciled grade includes that evidence.
3. If both reviews cited the same evidence but weighted it differently, the grade follows the Claude
   review because it measured counts. Section 4 shows each resulting spread.
4. A principle graded by only one review keeps that grade. The grade changes when the other review's
   evidence bears on the principle.
5. Before this note carried over any claim cited by only one review, the reconciling session checked
   it against the snapshot (section 7).

**Provenance:** the Claude reviewers' counts are operator observations from one-liners, and their
raw output was not preserved, so treat each figure as approximate. The Codex review ran no
measurement scripts. Section 7 lists every figure that the orchestrating or reconciling session
re-checked.

**Scale at the snapshot:** `docs/CODE-MAP.md` (snapshot 2026-09-25) reports 414,725 measured lines
across 2,528 files. Non-test `web/src` is about 62.6k LOC in 472 files, with a median file of 85
lines. Non-test `tools/` is about 94.8k LOC, and its tests add another 61.5k LOC.

## 2. The principles

The two reviews chose overlapping lists of twenty. Their union has twenty-two principles: Codex
split cohesion from coupling, Codex alone graded Encapsulate What Varies, and Claude alone graded
Tell, Don't Ask and the Boy Scout Rule.

| #  | Principle                           | One-line statement                                                              | Graded by |
| -- | ----------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 1  | Single Responsibility (SRP)         | A module, class, or function has one reason to change.                          | Both      |
| 2  | Open/Closed (OCP)                   | Open for extension, closed for modification — add behavior by adding code.      | Both      |
| 3  | Liskov Substitution (LSP)           | A subtype is usable anywhere its parent is expected without surprising callers. | Both      |
| 4  | Interface Segregation (ISP)         | Clients don't depend on members they don't use.                                 | Both      |
| 5  | Dependency Inversion (DIP)          | High-level policy depends on abstractions, not concrete I/O details.            | Both      |
| 6  | DRY                                 | Every piece of *knowledge* has one authoritative source.                        | Both      |
| 7  | KISS                                | The simplest solution that meets the need.                                      | Both      |
| 8  | YAGNI                               | Don't build features, options, or extension points until they are needed.       | Both      |
| 9  | Separation of Concerns              | Keep UI, business logic, persistence, and I/O apart.                            | Both      |
| 10 | High Cohesion                       | Things that change together live together.                                      | Both¹     |
| 11 | Low Coupling                        | Modules know little about each other.                                           | Both¹     |
| 12 | Composition over Inheritance        | Build behavior by combining small pieces, not deep class hierarchies.           | Both      |
| 13 | Encapsulate What Varies             | Isolate the decisions most likely to change.                                    | Codex     |
| 14 | Law of Demeter                      | Talk only to immediate collaborators; avoid `a.getB().getC().doThing()`.        | Both      |
| 15 | Command-Query Separation (CQS)      | A function either changes state or returns a value, not both.                   | Both      |
| 16 | Least Astonishment                  | Code behaves the way its name and signature suggest.                            | Both      |
| 17 | Make Illegal States Unrepresentable | Use types so invalid combinations cannot compile.                               | Both      |
| 18 | Fail Fast                           | Detect invalid state at the boundary and fail loudly and early.                 | Both      |
| 19 | Explicit over Implicit              | Visible data flow and dependencies over hidden global state and magic.          | Both      |
| 20 | Meaningful Names                    | Names reveal intent; if a variable needs a comment, rename it.                  | Both      |
| 21 | Tell, Don't Ask                     | Tell an object what to do instead of pulling its state out and deciding for it. | Claude    |
| 22 | Boy Scout Rule                      | Leave the code a little cleaner than you found it.                              | Claude    |

¹ Claude graded "High Cohesion, Low Coupling" as one principle, so its single grade appears in both
rows.

## 3. Report card

**Overall: B (GPA 3.15 / 4.0 across 22 principles).** Both reviews also reached B separately. Claude
graded 20 principles at a GPA of 3.2, and Codex graded 20 at a GPA of 3.1.

| #  | Principle                      | Claude | Codex | **Reconciled** | Key evidence                                                                                                                                                                           |
| -- | ------------------------------ | ------ | ----- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Single Responsibility          | B      | B−    | **B**          | Lint caps `web/src` files at 500 lines and functions at 125; median file 85 lines. `engine.ts` (1,486 lines) and `gen-performance-matrix.mjs` (3,516) are the outliers.                |
| 2  | Open/Closed                    | B      | B+    | **B**          | Settings, sections, rate limits, and the AI provider are table- or interface-driven. Adding a brush touches about 12 files.                                                            |
| 3  | Liskov Substitution            | B+     | B     | **B+**         | Web and native storage backends honor one contract. 5 of 7 native plugins lack a web fallback.                                                                                         |
| 4  | Interface Segregation          | B+     | B−    | **B+**         | Component props are small (median 3, max 14). `SettingsState` has about 62 members and is injected whole into factories that use 3–4.                                                  |
| 5  | Dependency Inversion           | B−     | B−    | **B−**         | `localStorage` sits behind a lint-enforced seam, and the AI vendor sits behind a thin adapter. Six server modules call Netlify Blobs directly, and the engine is a concrete singleton. |
| 6  | DRY                            | B+     | A−    | **B+**         | 51 centralized storage keys, settings tables, generated design tokens, and 68 drift-guard tests. A few small constants are duplicated, and tooling reimplements `median` 7 times.      |
| 7  | KISS                           | C+     | C+    | **C+**         | The app earns about a B+. The tooling is 1.5× the app, and the perf harness alone (36k LOC) exceeds it. 248 npm scripts.                                                               |
| 8  | YAGNI                          | B−     | B+    | **B−**         | knip reports nothing, with no ignore list. An 8k-LOC frozen archive stays CI-guarded, and one-campaign scripts became permanent tools.                                                 |
| 9  | Separation of Concerns         | B+     | B+    | **B+**         | Lint mechanically enforces the storage and server boundaries. `aiImage.ts` mixes HTTP, persistence, and UI.                                                                            |
| 10 | High Cohesion                  | B      | B     | **B**          | Most modules are focused; `engine.ts`, `aiImage.ts`, and the perf-matrix generator are broad.                                                                                          |
| 11 | Low Coupling                   | B      | C+    | **B−**         | The import graph is sparse (about 2.8 edges per file, 1 cycle). The drawing layer shares 69 module-level `let`s, and the Actions Panel reaches into five stores.                       |
| 12 | Composition over Inheritance   | A      | A−    | **A**          | 2 classes in all of `web/src`, 0 `abstract`/`implements`, 74 `createX()` factories.                                                                                                    |
| 13 | Encapsulate What Varies        | —      | A−    | **B+**         | The AI adapter and the stroke raster queue contain their choices. Brush behavior, the concept the product keeps adding, does not.                                                      |
| 14 | Law of Demeter                 | A−     | B     | **A−**         | Shipped code has 5 chains of 4+ dots; the worst is `preview.source.source.tiles` in `exportDrawing.ts`.                                                                                |
| 15 | Command-Query Separation       | B+     | B+    | **B+**         | About 3 of 150 query-named functions have real side effects, one of them in the parental gate.                                                                                         |
| 16 | Least Astonishment             | B      | B     | **B**          | Failure modes are mixed (throw, `null`, or `{ok}`). `isAiImageButtonVisible` controls *disabled*. `Button` accepts `href` with `disabled` and ignores the combination.                 |
| 17 | Illegal States Unrepresentable | B      | B     | **B**          | 0 `any`, 0 TS suppressions, and an exemplary `AiPhase` union. The engine holds the brush as three parallel booleans despite `BrushType`.                                               |
| 18 | Fail Fast                      | B+     | B     | **B**          | API bodies are byte-capped and validated. Env vars are never validated at startup, and capture-tool flags parse permissively.                                                          |
| 19 | Explicit over Implicit         | B      | B−    | **B−**         | Factories get their peers injected. The engine depends on `initDrawingCanvas` having run first and on hidden module state, and perf entry modules parse argv at import.                |
| 20 | Meaningful Names               | A−     | A−    | **A−**         | Unit suffixes and glossary-matching components. Vocabulary drifts: `colorSheet`/`magicSheet`/`fillUrl`, and `strokeWidth`/`lineWidth`/`size`.                                          |
| 21 | Tell, Don't Ask                | B+     | —     | **B+**         | Stores are read-only with intention methods. Callers sometimes re-derive rules from raw fields, which produced a real bug (section 7).                                                 |
| 22 | Boy Scout Rule                 | A−     | —     | **A−**         | 1 TODO in about 150k LOC and 11 `eslint-disable` in `web/src`. 700+ audit-fix commits in 3 months show the cleanup runs in campaigns.                                                  |

GPA arithmetic (A = 4.0, A− = 3.7, B+ = 3.3, B = 3.0, B− = 2.7, C+ = 2.3): one A, three A−, seven
B+, six B, four B−, and one C+ give 69.3 / 22 ≈ 3.15.

## 4. Where the reviews disagreed

The comparison covers nineteen grade pairs: 18 shared principles, with Claude's combined
cohesion/coupling grade compared against Codex's two separate grades. Eight were identical, seven
differed by one step (such as B vs B−), and four differed by two steps. No pair differed by more
than two steps. Both reviews gave KISS the lowest grade, and both named `engine.ts` and
`gen-performance-matrix.mjs` as the clearest breadth problems.

The four two-step disagreements:

* **Interface Segregation (Claude B+, Codex B−) → B+.** Both reviews named the broad `SettingsState`
  as the main violation, so they differ only in weighting. Rule 3 applies: Claude measured the rest
  of the surface (component props, `SecureBackend`, `ColoringPackStore`, `MagicBrushHost`,
  `AiImageProvider`), and it is narrow. This is the least settled grade. Treating the
  whole-`SettingsState` injection as the dominant fact would justify B−. The difference does not
  change what to do (section 8).
* **YAGNI (Claude B−, Codex B+) → B−.** Codex found the necessity of the extensive tooling "harder
  to infer" and cited nothing against it. Claude cited specific retained items. Rule 2 applies.
  About half of that evidence is kept code rather than code built ahead of need, and it overlaps
  with the KISS C+. The app alone earns about A−.
* **Low Coupling (Claude B, Codex C+) → B−.** Claude measured a sparse import graph. Codex cited
  specific couplings that Claude did not examine: the Actions Panel's fan-out, and a 42-line device
  runner importing from a 2,997-line capture module. Both were verified (section 7). Rule 2 takes
  the grade one step down from Claude's measured baseline.
* **Law of Demeter (Claude A−, Codex B) → A−.** Codex's evidence was tooling that reads deeply
  nested artifact data, and it noted that "this rule has limited reach in data parsing." Nested
  reads of plain JSON records are not collaborator chains, and the shipped-code chains that Claude
  counted are few.

The one-step splits resolved by rule 2 are OCP (Claude's brush evidence, B), Fail Fast (Codex's
capture-flag evidence, B), Explicit (Codex's tooling ambient state, B−), and Encapsulate What Varies
(Claude's brush evidence, B+). SRP, LSP, DRY, and Composition followed the measured review under
rule 3. Codex rated its own LSP grade "provisional" because inheritance is rare. Claude instead
assessed LSP at the interface-implementation level, which is where the principle applies in a
codebase with almost no classes.

## 5. Per-principle detail

Detail comes from the Claude review unless a bullet ends with *(Codex)*.

### Structure

**Single Responsibility — B.**

* Strengths:
  * `eslint.config.js:447` caps files at 500 lines and functions at 125. 11 files carry a documented
    per-file exception, and `web/src` has 0 size/complexity `eslint-disable` comments.
  * `lib/drawing` is decomposed into 66 focused modules, and nine of ten `routes/api/*/+server.ts`
    files are under 175 lines.
  * Focused helpers surround the broad coordinators *(Codex)*.
* Weaknesses:
  * `web/src/lib/drawing/engine.ts` (1,486 lines against a grandfathered 1,030 cap, 31 exports, 24
    module `let`s) handles pointer input, resize, undo, export, brush modes, and a dev-harness
    replay.
  * `lib/drawing/aiImage.ts` does WebP encoding, deduplication, auto-save, request building, fetch,
    polling, and opening settings.
  * `components/settings/WideShell.svelte` has a 514-line `<script>` block.
  * `tools/perf/gen-performance-matrix.mjs` (3,516 lines, 128 functions) combines normalization,
    scoring, Markdown, HTML, and file output *(Codex, confirmed by Claude)*.

**Open/Closed — B.**

* Strengths:
  * 18 `switch` statements in about 62k LOC, against 138 `Record<>` maps (20 of them
    `satisfies Record`).
  * `SectionBody.svelte:28` uses a `Record<SectionId, Component>` registry. The
    `BOOL_SETTINGS`/`INT_SETTINGS` tables drive settings, and `rateLimitPolicy.ts` drives rate
    limits.
  * The `AiImageProvider` interface hides the AI vendor, and ADR-0047 deliberately keeps that seam
    thin *(Codex)*.
* Weaknesses:
  * Brushes are not pluggable. There are three engine booleans (`engine.ts:176-178`), precedence
    rules in `committedBrushMode` (`:1376`) and `strokeOps.ts:124-145`, separate
    `erase`/`magic`/`crayon` op flags, and 24 `brush === '…'`/`!==` comparisons across 11 files.
  * `sections.ts:92` `sectionSubtitle` switches on `SectionId` beside the registry.
  * `isNative()` branches appear in 18 files instead of behind platform adapters.

**Separation of Concerns — B+.**

* Strengths:
  * The `STORAGE_SEAM_ONLY` lint rule (`eslint.config.js:62`) confines `localStorage`, and no
    `.svelte` file touches storage or IndexedDB.
  * `@netlify/blobs` is imported only in `lib/server`, and server code never imports client state.
  * `apiHandler` (`lib/server/http.ts:115`) centralizes API error mapping.
  * Major domains have clear homes *(Codex)*.
* Weaknesses:
  * `aiImage.ts` mixes HTTP, persistence, and UI.
  * `AiImageReport.svelte:90,103,113` and `settings/ReportForm.svelte:74` call `fetch` directly.
  * Some imports run the wrong way. `state/tool.svelte.ts:2` and `state/strokeWidth.svelte.ts:3`
    import `components/iconTypes`, `state/sectionsSeen.svelte.ts:6` imports
    `components/settings/sections`, and server routes import `SAFETY_REFUSAL_STATUS` from
    `$lib/drawing/aiImageResponse`.
  * `state/books.ts` holds a static catalog and grid layout rather than state, and the admin wire
    types live in `AdminConsole.svelte`'s module script.

**High Cohesion — B.**

* Strengths:
  * Small `createX()` state factories (`ui.svelte.ts` is 81 lines).
  * Most modules are focused *(Codex)*.
* Weaknesses:
  * `engine.ts`, `aiImage.ts`, and `gen-performance-matrix.mjs` as described under SRP.
  * Brush-mode sync is split between `earlyBoot.ts:18-22` and `DrawingCanvas.svelte:176`.
  * The `lib/` root is a flat set of about 45 modules.

**Low Coupling — B−.**

* Strengths:
  * 470 files, 1,337 runtime import edges, and one runtime cycle.
  * Fan-in concentrates in genuinely shared modules (`Icon.svelte` 49, `settings.svelte.ts` 37,
    `platform/index.ts` 29).
* Weaknesses:
  * `engine.ts` has a fan-in of 27 and a fan-out of 25, and UI components call it directly.
  * Module-scope `let` counts are 24 in `engine.ts`, 16 in `magicBrush.ts`, 12 in
    `tiledRenderer.ts`, and 10 in `audio/drawingSound.ts`, against the repo's own factory rule.
  * `ActionsPanel.svelte` imports five state modules (`colors`, `settings`, `ui`, `modal`, `layout`)
    plus the engine and `actionButtonLayout` *(Codex)*.
  * `tools/mobile/ios/run-on-device.mjs` (42 lines) imports `isPhysicalAppleUdid` from
    `tools/perf/ios/capture-xcuitest-actions.mjs` (2,997 lines), so a device runner depends on a
    perf capture entry module *(Codex)*.
  * The one cycle runs through `AdminConsole.svelte` ↔
    `InviteLedger.svelte`/`InviteRowActions.svelte`.

### Abstractions

**Liskov Substitution — B+.**

* Strengths:
  * `SecureBackend` (`lib/secureStorage.ts:204-227`) has native and IndexedDB implementations, and
    both return `null` rather than throw.
  * `ColoringPackStore` picks its web or native store once (`coloringPacks/manager.ts:42-45`) and
    treats both uniformly.
  * `AiImageProvider` returns tagged unions. The Blobs fake in `server/tokensTestHarness.ts:23-49`
    reproduces etag compare-and-set.
* Weaknesses:
  * 5 of 7 plugin wrappers in `lib/plugins/` have no `web:` fallback, and `PhotoLibrary` is
    Android-only while typed as universal.
  * Only 1 of 280 unit-test files has a typed or `satisfies` fake, and 16 hand-written
    `vi.mock('$lib/platform')` partials can drift.
  * `secureStorage.ts:309` branches on `isNative()` inside the selector, and
    `ColoringPackStore.rootPath` is native-only.
  * Production inheritance is rare, so class-level substitution has little to assess *(Codex)*.

**Interface Segregation — B+.**

* Strengths:
  * 78 of 142 `.svelte` files declare `$props()`, with a median of 3 props and a maximum of 14.
  * `MagicBrushHost` has 5 members, `SecureBackend` 3, `ColoringPackStore` 4, and
    `AiImageProvider` 2. The raster dependencies are narrow *(Codex)*.
* Weaknesses:
  * `SettingsState` (`settings.svelte.ts:274`) has about 62 members. It is injected whole into
    `createAppearance`, which uses 4, and `createFreeGenerations`, which uses 3, and nothing uses
    `Pick<SettingsState…>` *(both)*.
  * `engine.ts` exposes 35 exports to 29 importers, and `tiledRenderer.ts` exposes 27.
  * `ParentalGateFields` (18) and `ParentalGateMutators` (13) share one object.

**Dependency Inversion — B−.**

* Strengths:
  * 0 `localStorage.*Item` calls outside `lib/storage.ts`. IndexedDB is opened only in
    `idbDatabase.ts`, and the OpenAI SDK sits behind `AiImageProvider`.
  * Factories take their peers and I/O seams as parameters
    (`createSaveFailure({savePicture, pictureStore})`, `createNetwork(loadNetworkPlugin?)`), and
    about 44 test files exercise factories without module mocks.
  * Server code takes the clock as a default parameter at 17 sites.
* Weaknesses:
  * Six server modules import `getStore` from `@netlify/blobs` directly, so 24 of 33 server/API test
    files rely on `vi.mock`.
  * Module state at `tokens.ts:14-17` forces `vi.resetModules()` in 26 test files.
  * 5 modules read `$env/dynamic/private` directly despite `config.ts`.
  * `engine.ts` is a concrete singleton with a 64-line unit test, and 14 test files mock it
    wholesale.
  * 86 `isNative()`/`getPlatform()`/`__IS_CAPACITOR__` branches appear across 39 files outside
    `lib/platform`, many of them deliberate for tree-shaking.
  * Native tooling imports a perf entry module, as described under Low Coupling *(Codex)*.

**Composition over Inheritance — A.**

* Strengths:
  * `web/src` has two classes (`CanvasContextRecoveryError extends Error`, `CrayonPassTracker`) and
    0 `abstract`/`implements`. Functions and modules are the building blocks *(both)*.
  * The codebase has 74 `export function createX` factories, and `readonlyView(state, mutators)`
    composes state with mutators.
  * The engine composes its collaborators through callbacks (`createCrayonPassBoundaries`,
    `createInkMotion`). Components use 45 `{#snippet}`, 39 `{@render}`, and 63 `use:` actions.
* Weaknesses: some "composition" is a static import graph between singletons.

**Encapsulate What Varies — B+.**

* Strengths:
  * The AI provider adapter (ADR-0047) and `drawing/strokeRasterQueue.ts` contain their key
    decisions *(Codex)*.
  * Settings, sections, and rate limits vary through tables. The web-vs-native choice is made at
    build time.
* Weaknesses: brush behavior varies more than anything else in the product, yet it is spread across
  engine booleans, op flags, and about 11 files (see Open/Closed).

### Economy

**DRY — B+.**

* Strengths:
  * `lib/storageKeys.ts` centralizes 51 keys, and no storage-key literal appears inline outside
    tests. `tools/tests/boundary-string-lint.test.mjs` guards the lint rule itself.
  * Settings metadata tables drive initial state, setters, and reload behavior, and
    `lib/design/tokens.ts` is the single source of design tokens *(Codex)*.
  * 68 drift-guard test files exist, and the deliberate bundle-boundary duplication really is
    guarded.
  * Only 62 duplicated 10-line windows appear in about 40k meaningful `web/src` lines, mostly in the
    styleguide.
* Weaknesses:
  * `INSTALLATION_ID_PATTERN` and `COARSE_POINTER_QUERY` are each defined twice (section 7).
  * `SaveFailureBanner.svelte:19-21` redefines the "shared motion vocabulary" from
    `InstallBanner.svelte:32`, and `BREAKPOINT_EPSILON_PX` appears in both
    `actionButtonLayout.ts:67` and `design/trimGeometry.ts:14`.
  * Tooling reimplements `median` 7 times, 3 of them in `tools/asset-gen/lib` despite
    `image-stats.mjs:11`.

**KISS — C+.**

* Strengths:
  * The `web/src` size cap uses shrink-only grandfathered exceptions (`eslint.config.js:442-479`).
  * Generic utilities stay tiny (`singleFlight.ts` 27 lines, `latestRequest.ts` 45).
  * Complex drawing code is backed by measurements and ADRs.
* Weaknesses:
  * The perf harness is 36.0k source LOC plus 30.7k test LOC, which is larger than the app.
  * `tools/` has no size cap: 12 files exceed 1,000 lines and 36 exceed 500.
  * The repo has 248 npm scripts (45 of them `perf:*`), 59 top-level `tools/` entries, about 170
    ADRs, and a multi-stage Ruler pipeline for two agent vendors.
  * Several performance and drawing workflows carry substantial local complexity *(Codex)*.

**YAGNI — B−.**

* Strengths:
  * `knip` (files, exports, types, duplicates) reports 0 findings, and `knip.json` has no ignore
    list.
  * Test seams carry the required comment (10 sites), and dev routes are gated in one place.
* Weaknesses:
  * `pageSelectorImage` (`state/books.ts:308`) is a production export that only its test calls. knip
    misses this class because tests are entry points.
  * `tools/asset-gen/ideas-exploration` is a self-described frozen archive (7,988 LOC) that
    `check:ideas-review` still guards.
  * `tools/perf/run-person-session.mjs` (1,682 lines) walks one epic's tasks.
  * About 17.9k LOC of tooling exists to run the agent workflow itself.

**Boy Scout Rule — A−.**

* Strengths:
  * Across about 150k LOC there is 1 TODO-style marker, 34 `eslint-disable` comments (11 of them in
    `web/src`), and 0 TS suppressions.
  * The last 3 months include 468 `fix(audit):` commits and 259 `chore(audit):` commits, and 91 of
    93 `type:audit` issues are closed.
* Weaknesses: cleanup happens mostly in campaigns, size enforcement stops at `web/src`, and frozen
  archives are guarded instead of deleted.

### Call-site style

**Law of Demeter — A−.**

* Strengths: non-test `web/src` has 72 chains of 3+ dots and 5 of 4+, mostly DOM or plain-record
  access. Stores are flat getter facades, and the engine exposes a flat function API.
* Weaknesses:
  * `preview.source.source.tiles` (`drawing/exportDrawing.ts:106,116,117,187`),
    `job.build.fields.height.length` (`crayonBrush.ts:588-593`), and
    `pending.magicRecode.previousSheets.set(...)` (`tiledMagicRecode.ts:97-98`).
  * Tooling reads deeply nested artifact data, but those are data reads, not collaborator chains
    *(Codex)*.

**Command-Query Separation — B+.**

* Strengths:
  * Of 150 query-named exports, 6 were flagged and about 3 are real. All 7 `$derived.by` blocks are
    pure.
  * The read-only state views expose named changes *(both)*.
* Weaknesses:
  * `hasVerifiedCachedFile` (`coloringPacks/webStore.ts:102`) deletes the cache entry, and
    `getUsage` (`server/usage.ts:131`) purges expired rows.
  * `lockoutHolds()` (`state/parentalGate.svelte.ts:326`) ends the lockout and announces, and the
    predicate `acceptsInput()` (`:386`) calls it.
  * Some commands also return a result that no production caller uses (`recordSession`) *(both)*.

**Least Astonishment — B.**

* Strengths:
  * `storage.ts` has one documented never-throw policy. Server verbs say what they do (`claimJob`,
    `reserveFreeGeneration`, `purgeExpired*`).
  * PWA updates never reload a visible session: the reload fires only while the document is hidden
    and the canvas is blank (`lib/pwa/updates.ts`) *(Codex)*.
* Weaknesses:
  * `takeJobInput` deletes, while `takeJobImage` only reads (`server/generationJobs.ts:264,315`).
  * `isAiImageButtonVisible()` drives `disabled`, while `isAiImageButtonShown()` drives `hidden`
    (`actionButtonLayout.ts:134-143`).
  * 15 top-level executable statements appear in `lib`, and server failure modes are mixed.
  * `components/design/Button.svelte` accepts `href` together with `disabled` or `busy`, but its
    `<a>` branch (`:37-38`) applies neither. The only `href` caller, `beta/BetaStep.svelte`, passes
    link-appropriate props, so this is an API affordance rather than an observed misuse *(Codex)*.
  * An unknown flag to a perf capture entry prints only a warning, so a typo'd flag runs the capture
    with defaults *(Codex)*. The warning-only behavior is deliberate
    (`tools/perf/lib/cli-args.mjs:31-34`).

### Correctness and clarity

**Fail Fast — B.**

* Strengths:
  * `readJsonBody` (`server/http.ts:10-33`) enforces a byte cap and returns a typed failure, and
    `apiHandler` logs unexpected throws as 500s. API and canvas boundaries report failures clearly
    *(both)*.
  * Stored Blobs records get guards (`validUsage`, `isStoredJob`), and all 7 empty catches in
    shipped `web/src` are justified.
* Weaknesses:
  * Env vars are not validated at startup, so a missing secret degrades each request.
  * generate-image accepts an empty MIME type (section 7).
  * IndexedDB reads are trusted through generics (`unsavedPictureStore.ts:66`), and `isRecord` is
    defined three times.
  * `positiveInteger` in `tools/perf/ios/capture-xcuitest-actions.mjs:171` uses `Number.parseInt`,
    so it accepts `--repeats=4junk` as 4 *(Codex)*.

**Make Illegal States Unrepresentable — B.**

* Strengths:
  * The codebase has 0 real `any`, 0 `@ts-ignore`/`@ts-expect-error`, and 2 shipped non-null
    assertions.
  * `AiPhase` (`state/aiGeneration.svelte.ts:24-44`) is an exemplary documented union *(both)*.
  * `{ok:true}|{ok:false}` results appear throughout the server, alongside 206 literal discriminants
    and 54 `satisfies`.
* Weaknesses:
  * `eraserActive`/`magicActive`/`crayonActive` (`engine.ts:176-178`) are resolved by precedence
    (`:1376-1380`) despite `BrushType`.
  * `StrokeOp` (`strokeOps.ts:40-70`) permits magic plus crayon, or `magicSheet` without `magic`.
    The UI enforces the intended combinations, so this is a type-level risk rather than a
    user-visible bug *(both)*.
  * `Button`'s props allow `href` with `disabled`/`busy` (see Least Astonishment) *(Codex)*.
  * `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are off, and there are no branded
    IDs.

**Explicit over Implicit — B−.**

* Strengths:
  * Factories receive their dependencies explicitly (`settingsState = createSettings(toolState)`).
  * Only 2 side-effect imports exist, both test-guarded. The web-vs-native split is decided at build
    time.
* Weaknesses:
  * 25 files hold 102 module-scope `let`s, 69 of them in five drawing/audio modules (ADR-0004 carves
    out the engine).
  * Every engine export depends on `initDrawingCanvas` having run (`let canvas!`/`let ctx!` at
    `engine.ts:169-170`).
  * Env access is split between `config.ts` and direct `env.X` reads.
  * Perf entry modules parse argv at module scope, and other code also imports them as libraries
    (`cli-args.mjs:31-34`) *(Codex)*.

**Meaningful Names — A−.**

* Strengths: about 106k lines contain 10 weak declaration names. Component names match the
  `docs/ARCHITECTURE.md` glossary, and constants carry unit suffixes (`TICKET_TTL_MS`,
  `MAX_REPORT_BODY_BYTES`). Names distinguish important outcomes *(both)*.
* Weaknesses:
  * One concept has three names, `colorSheet`/`magicSheet`/`fillUrl`, and stroke width has
    `strokeWidth`/`lineWidth`/`size`.
  * The op field is `erase` while the brush is `eraser`, and both `HMAC_ALG` and `HMAC_ALGORITHM`
    exist.

**Tell, Don't Ask — B+.**

* Strengths: 19 of 24 `.svelte.ts` stores declare `readonly` interfaces, and `readonlyView` makes
  outside writes throw. Stores carry intention methods (`toggleEraser`, `actionControlShown`,
  `aiCredentialKind`, `orientationChoice`).
* Weaknesses:
  * `handleDoubleTap` re-derives whether the Eraser is available and gets it wrong (section 7).
  * `AiImageButton.svelte` and `actionButtonLayout.ts:135` re-derive `aiUserApiKey || aiAccessToken`
    despite `aiCredentialKind()`.
  * `applyDeviceOrientationPreference(bool, bool, bool)` receives raw fields even though
    `orientationChoice()` exists.

## 6. App vs. tooling

Only the Claude review graded the two halves separately. These principles differed by a full grade
or more:

| Principle      | App | Tooling | Driver                                                                  |
| -------------- | --- | ------- | ----------------------------------------------------------------------- |
| KISS           | B+  | C−      | The perf harness and agent-workflow tooling outweigh the app            |
| YAGNI          | A−  | C       | Archived experiments and one-off campaign scripts are kept permanently  |
| SRP / Cohesion | B+  | C+      | No size cap, and 12 tool files exceed 1,000 lines                       |
| Illegal states | B   | C−      | 711 `.mjs` files have no `@ts-check`, and 8 have JSDoc type annotations |
| DRY            | A−  | B−      | `median` is reimplemented 7 times                                       |

The Codex review's tooling evidence supports the same split: the device runner imports from a perf
capture module, capture flags parse permissively, and entry modules parse argv at import. Tooling
does better on Dependency Inversion. Clients take `fetchImpl`/`sleepImpl` parameters, only 18 of 265
tool test files mock modules, and 76 use real temp directories.

## 7. Findings verified directly

The reconciling session re-checked every finding below against
c34034213f2d27fe6ff8e98c30dbcc0e8f7f547f. Findings 1–6 came from the Claude review, and its
orchestrator had already checked them. Findings 7–11 came only from the Codex review and are checked
here for the first time.

1. **Apple Pencil double-tap can select a hidden Eraser (real bug).** `handleDoubleTap`
   (`web/src/lib/plugins/pencilEraser.ts:25-30`) checks only `settingsState.pencilEraserEnabled` and
   `settingsState.eraserEnabled`, and `toggleEraser` (`state/tool.svelte.ts:119-122`) adds no guard.
   `eraserEnabled` belongs to `TOOL_DRAWER_CONTROLS` (`state/settings.svelte.ts:90-96`). When the
   `toolDrawerEnabled` switch hides those controls, it leaves "their stored flags" untouched
   (`:63-67`). `actionControlShown` (`:303-305`) encodes the full rule, but the handler does not use
   it. So with the Tool Drawer off, the Eraser button is hidden while a double-tap still toggles it.
   The test "does not select an unavailable eraser" (`pencilEraser.test.ts:86`) covers only the
   stored-flag-false case.
2. **generate-image accepts an empty MIME type.** `assertAllowedImageType`
   (`web/src/routes/api/generate-image/+server.ts:69-72`) skips the check when `mimeType` is empty,
   and `:269` substitutes `'image/png'`. No content sniffing happens. Low severity.
3. **Duplicated constants.** `INSTALLATION_ID_PATTERN` appears at
   `lib/state/freeGenerations.svelte.ts:16` and `lib/server/freeGenerationGrants.ts:12`.
   `COARSE_POINTER_QUERY` appears at `lib/boot/webBackHandler.ts:7` and `lib/platform/index.ts:21`.
4. **Plugins without a web fallback.** In `web/src/lib/plugins/`, `appSettings`, `coloringPacks`,
   `photoLibrary`, `sensorOrientation`, and `systemBack` have no `web:` fallback. `deviceLock` and
   `pencilEraser` have one.
5. **Direct Blobs access.** `getStore` appears in six modules under `web/src/lib/server/`:
   `generationJobs.ts`, `usage.ts`, `freeGenerationGrants.ts`, `tokens.ts`, `imageReportStore.ts`,
   and `usageRecordStorage.ts`.
6. **Scale checks.** `engine.ts` has 1,486 lines, `package.json` has 248 scripts, and `docs/adrs/`
   holds 170 numbered files. Non-test files contain 24 `brush === '…'`/`!==` comparisons across 11
   files.
7. **`Button` ignores `disabled`/`busy` on links.** `components/design/Button.svelte:37-38` renders
   `<a>` with only `href`/`target`/`rel`. `disabled || busy` and `aria-busy` reach only the
   `<button>` branch (`:44-45`).
8. **Lenient capture-flag parsing.** `positiveInteger` (`capture-xcuitest-actions.mjs:171-175`)
   rejects `NaN` and values below 1 but accepts trailing junk. `parsePerfArgs`
   (`tools/perf/lib/cli-args.mjs:31-56`) warns on unknown flags and fails on an unknown device. Its
   comment explains why: the entry modules are also imported by vitest suites, where argv belongs to
   vitest.
9. **Cross-area tooling import.** `tools/mobile/ios/run-on-device.mjs:10` imports
   `isPhysicalAppleUdid` (defined at `capture-xcuitest-actions.mjs:339`) from a 2,997-line perf
   capture module.
10. **Actions Panel fan-out.** `components/ActionsPanel.svelte:13-19` imports `colors`, `settings`,
    `ui`, `modal`, and `layout` state plus `actionButtonLayout` and `drawing/engine`.
11. **PWA update guard.** `lib/pwa/updates.ts:24-41` reloads only while the document is hidden and
    the canvas is blank, so a visible session is never reloaded out from under the child.

## 8. Motivations for adopting these principles

### General motivations

| Motivation                      | What it buys                                                        | Principles that mainly serve it                                      |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cheaper change over time        | The 100th feature costs about what the 10th did                     | SRP, Cohesion/Coupling, OCP, DRY                                     |
| Understanding code in one place | A module can be changed safely after reading only that module       | Explicit, Demeter, Least Astonishment, Names, Separation of Concerns |
| Fewer defects                   | Mistakes surface at compile time or the boundary, not in production | Illegal States, Fail Fast, CQS                                       |
| Testability                     | Logic can be tested without the real network, canvas, or clock      | DIP, SRP                                                             |
| Several people working at once  | Fewer edits to the same file, and clear ownership                   | SRP, Cohesion                                                        |
| Onboarding and bus factor       | A newcomer becomes productive quickly                               | Names, KISS, Least Astonishment                                      |
| Reuse and swapping parts        | A database or vendor can be replaced, or a library published        | DIP, ISP, OCP, LSP, Encapsulate What Varies                          |
| Less to carry                   | Every line must be read, tested, kept working, and paid for in CI   | YAGNI, KISS                                                          |
| Settling review arguments       | A shared vocabulary ends style debates                              | All                                                                  |

Some adoption comes from fashion, dogma, or the need for ammunition in review arguments. Every
principle costs indirection, and applying one where its motivation does not hold makes code worse.

### What is unusual about Splotch

* **Users who cannot report bugs.** Toddlers don't file issues, so a lost stroke, a lost drawing, or
  an unexpected reload is the product failing silently. The parental gate is a security boundary,
  and AI generation costs money.
* **One human, many agents.** The three months to 2026-09-27 saw about 7,000 commits, 5,819 of them
  non-merge. At least 63% of the non-merge commits were authored or co-authored by an agent, and 177
  Codex branches were merged. Agent sessions often run concurrently in separate worktrees, and each
  one is effectively a new team member with no memory.
* **Two targets from one codebase.** Web and native builds share one SvelteKit tree, so cross-target
  and theme drift is a standing risk.
* **A performance-sensitive core.** The product is canvas drawing at 120 Hz on iPad, and the first
  stroke must land before hydration (ADR-0072).
* **An app, not a library.** Nobody outside the repo consumes its interfaces.

### Which motivations apply

The two reviews approached this from opposite ends. The Claude review started from how the code is
written (agent sessions, concurrency, carrying cost). The Codex review started from what the product
must protect (drawings, drift, responsiveness). The results are complementary.

| Motivation                                                            | Fit                   | Why here                                                                                                                                                                            | Principles it justifies                                               |
| --------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Preserve drawings and predictable child interactions                  | Very high             | The core experience fails silently when these break. The engine lifecycle (ADR-0004) and the PWA update guard already encode this.                                                  | Fail Fast, Illegal States, Least Astonishment                         |
| Understanding code in one place                                       | Very high             | Each agent session rebuilds hidden invariants from whatever it reads. The Pencil bug happened because a rule lived in `actionControlShown` and a second site re-derived half of it. | Explicit, Tell Don't Ask, Least Astonishment, SoC                     |
| Make routine changes safer                                            | Very high             | Boundaries, cohesion, and clear names reduce the number of sites one change can disturb.                                                                                            | Cohesion, Coupling, Names, SRP                                        |
| Prevent web/native and theme drift                                    | Very high             | One codebase ships several targets, so shared definitions and drift-guard tests have concrete value.                                                                                | DRY, LSP at the platform seam                                         |
| Fewer defects through types                                           | High                  | Agents write confident code, and type errors are the cheapest check. Three brush booleans that can contradict each other invite the next session to set two.                        | Illegal States, Fail Fast (especially at money and safety boundaries) |
| Testable and diagnosable failures                                     | High                  | This holds for the engine and server storage (97 test files mock whole modules) and for capture tooling, whose runs must be trustworthy.                                            | DIP where logic is intricate, Fail Fast                               |
| Several people working at once                                        | High                  | One human, but concurrent agent branches collide in `engine.ts` (185 commits in 6 months) and `ActionsPanel.svelte` (143).                                                          | SRP, Cohesion                                                         |
| Less to carry                                                         | High                  | Cheap generation weakens YAGNI's "don't waste time writing it" argument but strengthens "every line is a liability". The tooling is cheap to write and expensive to own.            | KISS, YAGNI                                                           |
| Keep first input and drawing responsive                               | High, selective       | A generic abstraction can add startup or hot-path work, and measured responsiveness wins. This works as a veto on refactors, not as a reason for them.                              | Constrains all of them in the engine                                  |
| Prepare for likely change                                             | High when evidenced   | Brushes are the concept the product keeps adding. For the AI provider, ADR-0047 deliberately chose a thin seam over a framework.                                                    | OCP and Encapsulate What Varies, for brushes only                     |
| Help contributors follow conventions                                  | High when enforceable | ADR-0031 ratified lint rules empirically, and prose-only conventions drift.                                                                                                         | Any principle with a mechanical check                                 |
| Reuse and swapping parts                                              | Low                   | No one is replacing Netlify Blobs, and there are no outside consumers.                                                                                                              | ISP and OCP in their library-author sense                             |
| Onboarding humans                                                     | Low                   | There is one human. Agent onboarding covers the same need through generated instructions and skills.                                                                                | —                                                                     |
| Conceptual purity, a better grade, small functions for their own sake | Low                   | A rule needs a concrete correctness, change-cost, drift, or performance benefit. Agents read long files fine; hidden coupling is what trips them up.                                | —                                                                     |

**The shared filter.** The two reviews reached the same test in different words. First identify the
failure or repeated cost, then choose the smallest rule or boundary that prevents it (Codex). For
tooling, the concrete version is to ask whether a session used the tool last month (Claude).

### The one real disagreement: the engine singleton

The Claude review proposed moving `engine.ts` module state behind a `createDrawingEngine()` factory
and splitting its responsibilities. The Codex review warned that replacing the singleton just to
improve its coupling grade conflicts with its documented lifecycle and responsiveness requirements.

Checked against the ADRs, each review is partly right.

* ADR-0004 needs one instance for the module's lifetime, whose drawing state survives component
  unmount. ADR-0072 needs initialization at module evaluation, before hydration (`earlyBoot.ts`).
  These ADRs rule out a component-owned engine, not a factory: a factory whose single instance is
  created at module scope would satisfy both. Neither ADR is the obstacle the Codex review
  suggested.
* The costs the Claude review cited don't need the factory first: hidden init order, 14 test files
  that mock the engine wholesale, and merge collisions. ADR-0004 already endorses delegating focused
  mechanics to sibling modules behind the `engine.ts` facade. A `BrushType`-based brush state
  removes the most error-prone hidden state without touching the lifecycle.

**Reconciled position:** do the brush-state union and the sibling extractions as ordinary work.
Treat the factory conversion as an amendment to ADR-0004. That amendment must name the cost it
removes and show no startup or hot-path regression (`npm run perf:mount` and the drawing perf
suites) before any code changes.

### What this means for the grades

* **Worth acting on:** Illegal States (the brush union, `StrokeOp`, and `Button`'s link/button
  props), Tell Don't Ask (the Pencil bug), DIP and Explicit in server storage (Blobs), and Fail Fast
  at the money and safety boundaries and in capture tooling, where a bad flag produces
  plausible-looking wrong numbers.
* **Needs a decision, not a refactor:** KISS and YAGNI in `tools/`, and the engine factory. Some of
  that tooling is what lets one person run a fleet of agents safely.
* **Fine as is:** OCP, ISP, LSP, and Encapsulate What Varies outside the brush and `SettingsState`
  spots named above, plus Composition and Demeter. Raising them further would add indirection
  without serving any motivation this project has.

## 9. Candidate follow-ups (not filed)

These are ordered by value. Each would become a GitHub issue per `docs/ISSUE-WORKFLOW.md` before
work starts.

| #  | Follow-up                                                                                                                                                                 | Source     |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1  | Fix the Apple Pencil double-tap Eraser bug by gating on `settingsState.actionControlShown('eraserEnabled')`, and add the drawer-off regression test.                      | Claude     |
| 2  | Replace the engine's three brush booleans and the `StrokeOp` flags with `BrushType` and a discriminated op kind.                                                          | Both       |
| 3  | Extract focused mechanics from `engine.ts` into sibling modules behind the facade. Propose the `createDrawingEngine()` factory only as an ADR-0004 amendment (section 8). | Reconciled |
| 4  | Introduce a Blobs-store abstraction for the six server modules.                                                                                                           | Claude     |
| 5  | Parse capture flags strictly (reject `4junk`), and decide whether an unknown flag should be fatal when `entry` is set.                                                    | Codex      |
| 6  | Move `isPhysicalAppleUdid` into a small shared module that both `run-on-device.mjs` and the capture module import.                                                        | Codex      |
| 7  | Apply `max-lines` to `tools/`, starting with `gen-performance-matrix.mjs`.                                                                                                | Both       |
| 8  | Decide whether to delete `tools/asset-gen/ideas-exploration` and `run-person-session.mjs`.                                                                                | Claude     |
| 9  | Rename the side-effecting queries (`hasVerifiedCachedFile`, `getUsage`) and align `takeJobInput`/`takeJobImage`.                                                          | Claude     |
| 10 | Validate required env vars at startup, and reject an empty MIME type in generate-image.                                                                                   | Claude     |
| 11 | Split `Button`'s props into link and button variants so `href` cannot combine with `disabled`/`busy`.                                                                     | Codex      |
| 12 | Move `INSTALLATION_ID_PATTERN` into `$lib/freeGenerations`, and dedupe `COARSE_POINTER_QUERY`.                                                                            | Claude     |
