# Deferred-audit triage — decision docs

Triage pass over every finding in `docs/AUDIT-DEFERRED.md` (the backlog the scripted
`burn-down-audits` runs moved aside after failed implementation or failed adversarial review). One
decision doc per finding, written to the structure in `TEMPLATE.md`. As each finding is triaged its
entry is drained from `AUDIT-DEFERRED.md` — the decision doc becomes its home, and the full original
text stays in git history. Rolled-back draft patches stay beside this directory in
`docs/audit-deferred/*.patch`.

Verdicts: **FIX** = single clear-winner solution · **OPTIONS** = ranked options with real tradeoffs
and a stated lean · **DROP** = no work needed (already resolved / not worth it / invalid), with
rationale. All three verdict groups have since been dispatched and their doc files removed (full
texts remain in git history at the commits this index was built from): the 30 FIX docs were
re-staged as entries in `docs/AUDIT.md` (source section "Deferred-audit triage — FIX verdicts")
carrying their resolution guidance; the 9 OPTIONS docs became `type:audit` + `needs-triage` GitHub
issues (linked below); the 10 DROP rationales are summarized in the Status column below.

## Status index

| #  | Decision doc                                                 | Finding                                                     | Pri | Cluster | Status                                  |
| -- | ------------------------------------------------------------ | ----------------------------------------------------------- | --- | ------- | --------------------------------------- |
| 1  | `docs/AUDIT.md`                                              | Two-blit subtractive glaze stamp duplicated                 | P2  | C01     | FIX — callback-based stamp              |
| 2  | —                                                            | `generateAiImage` bundles six concerns                      | P2  | C02     | DROP — resolved on main                 |
| 3  | [issue \#569](https://github.com/KyleMit/Splotch/issues/569) | Crayon-buffer allocate-or-resize written three times        | P3  | C01     | OPTIONS — lean: minimal helper          |
| 4  | [issue \#571](https://github.com/KyleMit/Splotch/issues/571) | Engine overlay CSS duplicates `.crayon-overlay` styles      | P3  | C01     | OPTIONS — lean: app.css single source   |
| 5  | `docs/AUDIT.md`                                              | Group crayon-overlay module variables into one struct       | P4  | C01     | FIX — rider on #4                       |
| 6  | —                                                            | Credential-header assembly hard-codes header names          | P3  | C02     | DROP — resolved on main                 |
| 7  | —                                                            | Manual query-string concatenation for generate-image        | P4  | C02     | DROP — not worth it                     |
| 8  | —                                                            | WebP-upload guard predicate in `encodeWebpUpload`           | P4  | C02     | DROP — not worth it                     |
| 9  | `docs/AUDIT.md`                                              | Duplicated 6-line mask gradient in AiConfetti               | P5  | C03     | FIX                                     |
| 10 | `docs/AUDIT.md`                                              | `AiImageResult` casts in event handlers                     | P5  | C03     | FIX                                     |
| 11 | [issue \#564](https://github.com/KyleMit/Splotch/issues/564) | Unify exported `$state` object naming                       | P1  | C04     | OPTIONS — lean: bare-noun default       |
| 12 | `docs/AUDIT.md`                                              | Shared segmented-control primitive (3 copies with drift)    | P1  | C05     | FIX — Segmented primitive               |
| 13 | `docs/AUDIT.md`                                              | `.setting + .setting` rule copied into three sections       | P3  | C05     | FIX — hoist to ParentCenter             |
| 14 | `docs/AUDIT.md`                                              | Segmented controls use inconsistent ARIA semantics          | P4  | C05     | FIX — folded into #12                   |
| 15 | `docs/AUDIT.md`                                              | White/dark ink keyline CSS triplicated                      | P1  | C04     | FIX — app.css utility pair              |
| 16 | [issue \#568](https://github.com/KyleMit/Splotch/issues/568) | Clearing the canvas is pointer-only                         | P3  | C03     | OPTIONS — lean: keyboard click path     |
| 17 | `docs/AUDIT.md`                                              | Icon glob + `splotchy` exclusion repeated three places      | P2  | C07     | FIX — patch + 2 review one-liners       |
| 18 | [issue \#570](https://github.com/KyleMit/Splotch/issues/570) | `COLOR_ICONS` hand-maintained allowlist mixes two concepts  | P3  | C07     | OPTIONS — lean: build-time gen          |
| 19 | `docs/AUDIT.md`                                              | `iconTypes.ts` imports and re-exports `IconName`            | P4  | C07     | FIX — delete dead re-export             |
| 20 | `docs/AUDIT.md`                                              | Native page hand-rolls server response type guards          | P2  | C08     | FIX — hand-port draft + real 409 string |
| 21 | —                                                            | Per-invite action groups triplicated markup                 | P2  | C08     | DROP — overtaken on main                |
| 22 | `docs/AUDIT.md`                                              | `readStore` bundles five responsibilities                   | P2  | C08     | FIX — extract confirmSeedRaceWinner     |
| 23 | —                                                            | Session cookie name/scope/max-age scattered inline          | P4  | C08     | DROP — already centralized              |
| 24 | —                                                            | Native page reimplements session-state bookkeeping          | P4  | C08     | DROP — no real enforcement gain         |
| 25 | `docs/AUDIT.md`                                              | `$effect` bare member-access dependency registration        | P2  | C09     | FIX — trimmed draft, load-bearing reads |
| 26 | `docs/AUDIT.md`                                              | `+error.svelte`/`handleError` produce unused `{ message }`  | P5  | C09     | FIX — comment-only, premise false       |
| 27 | `docs/AUDIT.md`                                              | Hexagon geometry constants scattered, coupled to a comment  | P3  | C10     | FIX — narrowed to snap radius           |
| 28 | —                                                            | `getRingColor` recomputed 2-3× per active swatch            | P3  | C10     | DROP — resolved on main                 |
| 29 | `docs/AUDIT.md`                                              | Every swatch element captured into `$state`                 | P3  | C10     | FIX — reframed as readability           |
| 30 | `docs/AUDIT.md`                                              | Unify the two error-response shapes across the API          | P1  | C11     | FIX — fail() + apiHandler()             |
| 31 | `docs/AUDIT.md`                                              | Content-type parsing into a shared `http.ts` helper         | P2  | C11     | FIX — contentTypeOf()                   |
| 32 | `docs/AUDIT.md`                                              | Oversized-body guard shared by two endpoints                | P2  | C11     | FIX — readBodyWithinLimit()             |
| 33 | [issue \#567](https://github.com/KyleMit/Splotch/issues/567) | Share request/response contract types routes ↔ clients      | P2  | C11     | OPTIONS — lean: shared module           |
| 34 | `docs/AUDIT.md`                                              | Install-prompt runtime `isNative()` branch                  | P2  | C12     | FIX — composite build-time guard        |
| 35 | `docs/AUDIT.md`                                              | Reload-side-effect pair repeated across three paths         | P4  | C12     | FIX — apply draft + deferReload()       |
| 36 | `docs/AUDIT.md`                                              | Book id re-typed on every `page()` call                     | P1  | C13     | FIX — re-implement book() on HEAD       |
| 37 | [issue \#565](https://github.com/KyleMit/Splotch/issues/565) | Spacing/font sizes raw px while colors/radii use tokens     | P2  | C14     | OPTIONS — lean: scoped swaps            |
| 38 | `docs/AUDIT.md`                                              | Hardcoded brand RGB fallback drifts from `--brand`          | P4  | C14     | FIX — derived --brand-rgb               |
| 39 | `docs/AUDIT.md`                                              | Platform/device utilities scattered across `lib/` root      | P2  | C12     | FIX — lib/platform/ move, after #40     |
| 40 | `docs/AUDIT.md`                                              | `Orientation` type redeclared in ~8 places                  | P2  | C12     | FIX — apply draft, before #39           |
| 41 | `docs/AUDIT.md`                                              | Six near-identical Gemini `generateContent` wrappers        | P1  | C15     | FIX — rebase onto HEAD gemini.mjs       |
| 42 | [issue \#566](https://github.com/KyleMit/Splotch/issues/566) | Centralize `MODEL`/`WEBP_QUALITY`/timeout constants         | P2  | C15     | OPTIONS — lean: rides on #41            |
| 43 | `docs/AUDIT.md`                                              | Background flood-fill written twice in lib (+ once in bin)  | P2  | C15     | FIX — floodFromBorder predicate core    |
| 44 | `docs/AUDIT.md`                                              | `scoreCompositeEyes` 100-line function w/ inline validator  | P3  | C15     | FIX — patch + erodeCross                |
| 45 | `docs/AUDIT.md`                                              | `fail()` lives in `paths.mjs`, unrelated to path resolution | P3  | C15     | FIX — move to cli.mjs                   |
| 46 | [issue \#572](https://github.com/KyleMit/Splotch/issues/572) | "Median" via `>>1` + luma definitions differ across modules | P5  | C15     | OPTIONS — lean: safe subset             |
| 47 | `docs/AUDIT.md`                                              | README scoreboard / "do first" list stale                   | P1  | C16     | FIX — rewrite from Status lines         |
| 48 | —                                                            | Graduated `idea-N/code` files are drifted frozen ancestors  | P1  | C16     | DROP — resolved on main                 |
| 49 | —                                                            | Inconsistent script naming across idea dirs                 | P3  | C16     | DROP — frozen archive                   |

## Clusters

Related findings are triaged together so coupled decisions stay coherent:

* **C01 crayon/engine rendering:** 1, 3, 4, 5 — strokeOps/engine buffer + overlay lifecycle.
* **C02 aiImage client:** 2, 6, 7, 8 — all inside `generateAiImage`'s flow; extraction choices
  interact.
* **C03 small UI/a11y:** 9, 10, 16.
* **C04 P1 sweeps:** 11, 15 — independent, both mechanical repo-wide CSS/naming unifications.
* **C05 segmented control:** 12, 13, 14 — the primitive decides the ARIA question.
* **C07 icon pipeline:** 17, 18, 19 — one shared source-of-truth design decides all three.
* **C08 admin/tokens:** 20, 21, 22, 23, 24 — admin console + token store.
* **C09 svelte patterns:** 25, 26 — reviewed-and-rejected patches on framework idioms.
* **C10 color picker:** 27, 28, 29 — same component.
* **C11 API surface:** 30, 31, 32, 33 — error shape decision constrains the helper extractions.
* **C12 platform:** 34, 35, 39, 40 — folder/grouping decision affects where the type + helpers land.
* **C13 books:** 36.
* **C14 design tokens:** 37, 38.
* **C15 asset-gen code:** 41-46 — `tools/asset-gen` lib/bin refactors.
* **C16 asset-gen history:** 47, 48, 49 — idea-dir hygiene; one "are idea dirs frozen archives?"
  decision.
