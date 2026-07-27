# Deferred-audit triage — decision docs

Triage pass over every finding in `docs/AUDIT-DEFERRED.md` (the backlog the scripted
`burn-down-audits` runs moved aside after failed implementation or failed adversarial review). One
decision doc per finding, written to the structure in `TEMPLATE.md`. As each finding is triaged its
entry is drained from `AUDIT-DEFERRED.md` — the decision doc becomes its home, and the full original
text stays in git history. Rolled-back draft patches stay beside this directory in
`docs/audit-deferred/*.patch`.

Verdicts: **FIX** = single clear-winner solution · **OPTIONS** = ranked options with real tradeoffs
and a stated lean · **DROP** = no work needed (already resolved / not worth it / invalid), with
rationale.

## Status index

| #  | Decision doc                                      | Finding                                                     | Pri | Cluster | Status  |
| -- | ------------------------------------------------- | ----------------------------------------------------------- | --- | ------- | ------- |
| 1  | `p2-duplication-glaze-stamp.md`                   | Two-blit subtractive glaze stamp duplicated                 | P2  | C01     | pending |
| 2  | `p2-complexity-generate-ai-image.md`              | `generateAiImage` bundles six concerns                      | P2  | C02     | pending |
| 3  | `p3-duplication-crayon-buffer-alloc.md`           | Crayon-buffer allocate-or-resize written three times        | P3  | C01     | pending |
| 4  | `p3-maintainability-overlay-css.md`               | Engine overlay CSS duplicates `.crayon-overlay` styles      | P3  | C01     | pending |
| 5  | `p4-maintainability-overlay-struct.md`            | Group crayon-overlay module variables into one struct       | P4  | C01     | pending |
| 6  | `p3-duplication-auth-headers.md`                  | Credential-header assembly hard-codes header names          | P3  | C02     | pending |
| 7  | `p4-readability-query-string.md`                  | Manual query-string concatenation for generate-image        | P4  | C02     | pending |
| 8  | `p4-readability-webp-guard.md`                    | WebP-upload guard predicate in `encodeWebpUpload`           | P4  | C02     | pending |
| 9  | `p5-readability-confetti-mask.md`                 | Duplicated 6-line mask gradient in AiConfetti               | P5  | C03     | pending |
| 10 | `p5-type-safety-ai-image-result-cast.md`          | `AiImageResult` casts in event handlers                     | P5  | C03     | pending |
| 11 | `p1-consistency-state-naming.md`                  | Unify exported `$state` object naming                       | P1  | C04     | pending |
| 12 | `p1-duplication-segmented-control.md`             | Shared segmented-control primitive (3 copies with drift)    | P1  | C05     | pending |
| 13 | `p3-duplication-setting-spacing-rule.md`          | `.setting + .setting` rule copied into three sections       | P3  | C05     | pending |
| 14 | `p4-accessibility-segmented-aria.md`              | Segmented controls use inconsistent ARIA semantics          | P4  | C05     | pending |
| 15 | `p1-duplication-ink-keyline.md`                   | White/dark ink keyline CSS triplicated                      | P1  | C04     | pending |
| 16 | `p3-accessibility-clear-button-keyboard.md`       | Clearing the canvas is pointer-only                         | P3  | C03     | pending |
| 17 | `p2-duplication-icon-glob-exclusion.md`           | Icon glob + `splotchy` exclusion repeated three places      | P2  | C07     | pending |
| 18 | `p3-maintainability-color-icons-allowlist.md`     | `COLOR_ICONS` hand-maintained allowlist mixes two concepts  | P3  | C07     | pending |
| 19 | `p4-consistency-icon-types-reexport.md`           | `iconTypes.ts` imports and re-exports `IconName`            | P4  | C07     | pending |
| 20 | `p2-type-safety-native-admin-guards.md`           | Native page hand-rolls server response type guards          | P2  | C08     | pending |
| 21 | `p2-duplication-invite-actions.md`                | Per-invite action groups triplicated markup                 | P2  | C08     | pending |
| 22 | `p2-complexity-read-store.md`                     | `readStore` bundles five responsibilities                   | P2  | C08     | pending |
| 23 | `p4-maintainability-session-cookie-opts.md`       | Session cookie name/scope/max-age scattered inline          | P4  | C08     | pending |
| 24 | `p4-duplication-sign-out-locally.md`              | Native page reimplements session-state bookkeeping          | P4  | C08     | pending |
| 25 | `p2-complexity-effect-dependency-registration.md` | `$effect` bare member-access dependency registration        | P2  | C09     | pending |
| 26 | `p5-readability-error-message-unused.md`          | `+error.svelte`/`handleError` produce unused `{ message }`  | P5  | C09     | pending |
| 27 | `p3-maintainability-hexagon-geometry.md`          | Hexagon geometry constants scattered, coupled to a comment  | P3  | C10     | pending |
| 28 | `p3-performance-get-ring-color.md`                | `getRingColor` recomputed 2-3× per active swatch            | P3  | C10     | pending |
| 29 | `p3-performance-swatch-refs.md`                   | Every swatch element captured into `$state`                 | P3  | C10     | pending |
| 30 | `p1-consistency-api-error-shapes.md`              | Unify the two error-response shapes across the API          | P1  | C11     | pending |
| 31 | `p2-duplication-content-type-parsing.md`          | Content-type parsing into a shared `http.ts` helper         | P2  | C11     | pending |
| 32 | `p2-duplication-oversized-body-guard.md`          | Oversized-body guard shared by two endpoints                | P2  | C11     | pending |
| 33 | `p2-type-safety-api-contract-types.md`            | Share request/response contract types routes ↔ clients      | P2  | C11     | pending |
| 34 | `p2-platform-branching-install-prompt.md`         | Install-prompt runtime `isNative()` branch                  | P2  | C12     | pending |
| 35 | `p4-duplication-reload-pair.md`                   | Reload-side-effect pair repeated across three paths         | P4  | C12     | pending |
| 36 | `p1-duplication-book-page-ids.md`                 | Book id re-typed on every `page()` call                     | P1  | C13     | pending |
| 37 | `p2-design-tokens-spacing-font-px.md`             | Spacing/font sizes raw px while colors/radii use tokens     | P2  | C14     | pending |
| 38 | `p4-design-tokens-brand-rgb-fallback.md`          | Hardcoded brand RGB fallback drifts from `--brand`          | P4  | C14     | pending |
| 39 | `p2-architecture-platform-utils-folder.md`        | Platform/device utilities scattered across `lib/` root      | P2  | C12     | pending |
| 40 | `p2-duplication-orientation-type.md`              | `Orientation` type redeclared in ~8 places                  | P2  | C12     | pending |
| 41 | `p1-duplication-gemini-wrappers.md`               | Six near-identical Gemini `generateContent` wrappers        | P1  | C15     | pending |
| 42 | `p2-duplication-asset-gen-constants.md`           | Centralize `MODEL`/`WEBP_QUALITY`/timeout constants         | P2  | C15     | pending |
| 43 | `p2-duplication-flood-fill.md`                    | Background flood-fill written twice in lib (+ once in bin)  | P2  | C15     | pending |
| 44 | `p3-complexity-score-composite-eyes.md`           | `scoreCompositeEyes` 100-line function w/ inline validator  | P3  | C15     | pending |
| 45 | `p3-architecture-fail-in-paths.md`                | `fail()` lives in `paths.mjs`, unrelated to path resolution | P3  | C15     | pending |
| 46 | `p5-maintainability-median-luma.md`               | "Median" via `>>1` + luma definitions differ across modules | P5  | C15     | pending |
| 47 | `p1-discoverability-asset-gen-readme-stale.md`    | README scoreboard / "do first" list stale                   | P1  | C16     | pending |
| 48 | `p1-duplication-graduated-idea-files.md`          | Graduated `idea-N/code` files are drifted frozen ancestors  | P1  | C16     | pending |
| 49 | `p3-naming-idea-script-naming.md`                 | Inconsistent script naming across idea dirs                 | P3  | C16     | pending |

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
