# Code Map — lines of code by domain

> **Snapshot as of 2026-07-28 at 43bc7716, plus this document.** These are point-in-time counts of
> tracked source and will drift as the code changes. Re-run the pass (see [Method](#method)) to
> refresh. This is a sibling to `docs/DEPENDENCIES.md`: a "state of the codebase" inventory, not a
> maintained-in-lockstep truth.

## Method

Counts are newline counts over the `git ls-files` inventory. The pass assigns every tracked file to
exactly one measured area or one explicit exclusion class:

* **Measured:** source code, authored Markdown, SVG/XML/project files, shell/config files, store
  listing text, and authoritative `.ruler/**` sources — including nested `.ruler` instruction
  sources.
* **Binary media / archives:** PNG, WebP, JPG/JPEG, MP3, ICO, and JAR.
* **Generated or bulky data:** `pnpm-lock.yaml`, asset-gen and scrapbook measurement JSON, generated
  report/proof-sheet HTML, generated ranking/audit text, patch/encrypted/hash payloads, and the
  scrapbook publishing marker.
* **Agent dedup:** generated `CLAUDE.md` / `AGENTS.md`, `.claude/skills/**`,
  `.claude/skill-notes/**`, and `.agents/**`. This also leaves the direct-maintained
  `burn-down-audits` provider packages out of the LOC total, preserving the provider-tree exclusion.
* **Repository metadata outside LOC scope:** `LICENSE` and `.git-blame-ignore-revs`.

Grouping is one file → one area and, where shown, one sub-bucket. Cross-cutting files sit in a
single bucket by convention; co-located tests follow the subject they test. Totals are exact even
though a few functional boundaries are judgment calls.

### Coverage check

| Disposition                    | Files |
| ------------------------------ | ----: |
| Measured and categorized       |   939 |
| Explicitly excluded            | 2,093 |
| **All tracked files**          | 3,032 |
| Unassigned or multiply counted |     0 |

| Exclusion class                           | Files |
| ----------------------------------------- | ----: |
| Binary media / archives                   | 1,829 |
| Generated / provider agent delivery trees |    96 |
| Generated measurement data                |    82 |
| Archived payloads / hashes                |    54 |
| Generated report / proof-sheet HTML       |    19 |
| Generated audit / ranking text            |     9 |
| Repository metadata outside LOC scope     |     2 |
| Dependency lockfile                       |     1 |
| Publishing marker                         |     1 |
| **Total explicitly excluded**             | 2,093 |

## Grand total: **106,836 LOC across 939 measured files**

| Area                                     |    LOC | Files |
| ---------------------------------------- | -----: | ----: |
| **web/src** — the app                    | 34,591 |   316 |
| **tools/asset-gen** — art pipeline       | 23,255 |   176 |
| **scripts** — build/dev drivers          | 16,392 |   129 |
| **docs** — ADRs & guides                 | 11,617 |    89 |
| **.ruler** — agent-instruction sources   |  6,007 |    46 |
| **web/tests** — E2E + integration        |  5,923 |    44 |
| web/\* — build/test config               |  2,705 |    24 |
| android + ios + fastlane — native shells |  2,012 |    53 |
| root config / README                     |  1,032 |    12 |
| .claude / .codex — agent runtime config  |    997 |    14 |
| .github — CI and issue config            |    957 |    17 |
| scrapbook — run-artifact prose           |    903 |     9 |
| store-assets — listing text              |    260 |     3 |
| releases — release notes                 |    185 |     7 |

## Splits for every measured area over 3k LOC

### web/src (34,591) — functional domains

| Domain                          |   LOC | Files |
| ------------------------------- | ----: | ----: |
| Drawing / canvas engine         | 7,239 |    27 |
| AI image generation             | 3,774 |    36 |
| Settings / settings             | 3,112 |    15 |
| App state (runes)               | 2,923 |    25 |
| Admin console + token backend   | 2,669 |    17 |
| Routes / app shell / dev        | 2,376 |    31 |
| Design system + icons           | 1,959 |    78 |
| Core UI controls                | 1,788 |     9 |
| Gestures / Svelte actions       | 1,765 |    14 |
| Color palette & picker          | 1,240 |     7 |
| Storage / persistence           | 1,224 |     8 |
| PWA / service worker            | 1,194 |     3 |
| Server / API backend            | 1,178 |    17 |
| Coloring books                  |   989 |     5 |
| Platform / device integration   |   739 |    16 |
| Audio                           |   247 |     2 |
| Miscellaneous focused utilities |   175 |     6 |

#### Drawing / canvas engine (7,239) — defined subdomains

The drawing domain contains `lib/drawing/**` except the four `aiImage*` files, plus
`DrawingCanvas.svelte`, `state/canvas.svelte.ts`, and `routes/dev/engine/**`. Every one of those 27
files lands in exactly one subdomain below.

| Subdomain                                 | Scope                                                                                           |   LOC | Files |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ----: | ----: |
| Engine orchestration & canvas integration | `engine`, early boot/perf/empty scan, `DrawingCanvas`, canvas state, and the engine dev harness | 2,554 |     9 |
| Stroke model & brush rendering            | `strokeOps`, `crayonBrush`, `magicBrush`, and their co-located tests                            | 1,982 |     6 |
| Undo & snapshot history                   | `undoHistory` implementation and tests                                                          | 1,432 |     2 |
| Export, saving & clear-time persistence   | `exportDrawing`, `folderSave`, `screenshot`, and `saveOnDelete`                                 |   752 |     5 |
| Paper view & coloring overlay             | `paperView`, its tests, and `overlay`                                                           |   263 |     3 |
| Pointer / gesture math                    | `strokeMath` implementation and tests                                                           |   256 |     2 |
| **Drawing / canvas engine total**         |                                                                                                 | 7,239 |    27 |

### tools/asset-gen (23,255) — by subtree

| Sub-bucket                       |    LOC | Files |
| -------------------------------- | -----: | ----: |
| ideas-exploration (R&D scratch)  | 11,981 |    88 |
| bin (pipeline CLIs)              |  3,090 |    18 |
| lib (pipeline core)              |  2,483 |    23 |
| tests                            |  2,171 |    20 |
| docs (pipeline records)          |  1,569 |    12 |
| crayon-brush-samples             |    787 |     7 |
| legacy                           |    542 |     3 |
| coloring-book-proof-sheet-assets |    468 |     2 |
| instruction source               |    131 |     1 |
| (root)                           |     33 |     2 |

### scripts (16,392) — by subtree

| Sub-bucket         |   LOC | Files |
| ------------------ | ----: | ----: |
| (root scripts)     | 4,728 |    43 |
| perf               | 3,362 |    21 |
| tests              | 2,888 |    25 |
| lib                | 2,781 |    25 |
| audit-burndown     | 2,570 |    14 |
| instruction source |    63 |     1 |

### docs (11,617) — by subtree

| Sub-bucket     |   LOC | Files |
| -------------- | ----: | ----: |
| adrs           | 7,868 |    75 |
| (root docs)    | 2,906 |     8 |
| CLOUD          |   331 |     2 |
| handoff        |   270 |     2 |
| audit-deferred |   242 |     2 |

### .ruler (6,007) — by subtree

| Sub-bucket                |   LOC | Files |
| ------------------------- | ----: | ----: |
| skill sources             | 5,650 |    38 |
| root instruction / config |   301 |     7 |
| skill notes               |    56 |     1 |

### web/tests (5,923) — by subtree

| Sub-bucket               |   LOC | Files |
| ------------------------ | ----: | ----: |
| (root) E2E / integration | 5,709 |    41 |
| model-eval               |   106 |     1 |
| redteam                  |    90 |     1 |
| instruction source       |    18 |     1 |

## Notes worth carrying forward

* **The drawing engine remains the heart of the app** — 7.2k LOC (21% of `web/src`). Its largest
  pieces are orchestration/integration (2.6k), rendering/brushes (2.0k), and undo/snapshots (1.4k);
  the new split makes those different responsibilities visible (see ADR-0004, ADR-0066).
* **AI image generation is still a full vertical, not a single feature** — 3.8k LOC spanning client,
  server, and generation-specific state. Admin/token infrastructure remains separate so the buckets
  do not double-count it.
* **`tools/asset-gen` is two-thirds the size of the app** (23.3k vs 34.6k), and just over half of it
  (12.0k) is `ideas-exploration` — committed R&D scratch, not the live pipeline. The production
  pipeline core is `bin` + `lib` ≈ 5.6k.
* **Automation is now a major code surface:** `scripts` is 16.4k LOC, including 2.9k of script tests
  and 2.6k for the audit-burndown tooling.
* **ADRs are 7.9k LOC of Markdown** (75 files) — the decision record is a substantial part of the
  repository.
