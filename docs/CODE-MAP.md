# Code Map — lines of code by domain

<!-- code-map:generated:start snapshot -->

> **Snapshot of 604943098c34 (2026-10-22).** Every table in this map is generated from that commit
> by `npm run gen:code-map`; the prose around them is maintained by the `reconcile-code-map` skill.
> Counts drift as the code changes — regenerate rather than hand-edit.

<!-- code-map:generated:end snapshot -->

A "state of the codebase" inventory, sibling to `docs/DEPENDENCIES.md`. It is a point-in-time
snapshot, not kept in lockstep with the code.

## Method

`npm run gen:code-map` counts newlines (`wc -l` semantics) in every blob of one commit's tree, read
straight from git, so the same commit always regenerates the same tables. The rules that place each
file live in `tools/code-map/lib/code-map-rules.mjs`, and `tools/code-map/README.md` explains how to
change them. Every tracked file lands in exactly one measured area or one explicit exclusion class;
`tools/code-map/tests/` fails if a path matches none, or more than one.

* **Measured:** source code (including tracked generated source used at runtime), authored Markdown,
  hand-authored SVG, XML and project files, shell/config files, store listing text, test fixtures,
  scripts inside evidence packages, and authoritative `.ruler/**` sources. A nested `.ruler`
  instruction source counts in the area it describes. Root `src/` is the app; `netlify/` owns hosted
  server code; root native projects and replay traces have their own area.
* **Binary media / archives:** images, audio, fonts, JARs, and gzip/zip archives.
* **Vector art assets / traced samples:** coloring-page outlines under `assets/static/coloring/`,
  and the traced SVG corpora of `model-eval`, `centerline-tracing`, and the `vectorize` pilot.
  Hand-authored icons in `src` stay measured.
* **Generated measurement data:** JSON, JSONL, TSV, CSV, and `.out` files under the evidence roots
  (`perf-profiles/`, `scrapbook/`, `docs/scratchpad/`, `docs/investigations/`,
  `docs/migration/evidence/`, `tools/asset-gen/`, and the `centerline-tracing` benchmark), plus
  captured logs and ranking text there.
* **Generated report HTML, payloads, and lockfile:** scrapbook and asset-gen report pages; patch,
  diff, encrypted, and hash payloads; `pnpm-lock.yaml`; the scrapbook publishing marker.
* **Agent dedup:** generated `CLAUDE.md` / `AGENTS.md`, `.claude/skills/**`,
  `.claude/skill-notes/**`, and `.agents/**`. This also leaves direct-maintained provider packages
  out of the LOC total, preserving the provider-tree exclusion.
* **Outside LOC scope:** `LICENSE`, `.git-blame-ignore-revs`, and this map, which would otherwise
  count itself.

Grouping is one file → one area and, where shown, one sub-bucket. Cross-cutting files sit in a
single bucket by convention; co-located tests and test harnesses follow the module they exercise.
`src` domains are an ordered first-match rule list whose directory-wide fallbacks place a new file
somewhere plausible until a reconcile pass gives it a precise rule, so a few functional boundaries
are judgment calls even though every total is exact.

### Coverage check

<!-- code-map:generated:start coverage -->

| Disposition                    | Files |
| ------------------------------ | ----: |
| Measured and categorized       | 3,602 |
| Explicitly excluded            | 6,294 |
| **All tracked files**          | 9,896 |
| Unassigned or multiply counted |     0 |

| Exclusion class                                  | Files |
| ------------------------------------------------ | ----: |
| Binary media / archives                          | 3,564 |
| Generated measurement data                       | 1,212 |
| Generated audit / ranking text and captured logs |   943 |
| Vector art assets / traced samples               |   291 |
| Generated / provider agent delivery trees        |   200 |
| Archived payloads / hashes                       |    56 |
| Generated report / proof-sheet HTML              |    23 |
| Repository metadata outside LOC scope            |     2 |
| Code map output                                  |     1 |
| Dependency lockfile                              |     1 |
| Publishing marker                                |     1 |
| **Total explicitly excluded**                    | 6,294 |

<!-- code-map:generated:end coverage -->

<!-- code-map:generated:start totals -->

## Grand total: **613,919 LOC across 3,602 measured files**

| Area                                                                 |     LOC | Files |
| -------------------------------------------------------------------- | ------: | ----: |
| **docs** — ADRs & guides                                             | 209,792 |   739 |
| **tools (excluding asset-gen)** — repo automation                    | 202,389 | 1,088 |
| **src** — the app                                                    |  92,450 |   941 |
| **tools/asset-gen** — art pipeline                                   |  30,445 |   209 |
| netlify — API, workers and server modules                            |  22,951 |   139 |
| android + ios + fastlane + Maestro + replay traces — native projects |  18,611 |    92 |
| **e2e** — RN web export E2E                                          |  12,235 |    86 |
| **.ruler** — agent-instruction sources                               |  11,947 |    85 |
| root config / README / shared assets                                 |   4,175 |   149 |
| scrapbook — run-artifact prose                                       |   3,556 |     7 |
| .github — CI and issue config                                        |   2,286 |    25 |
| .claude / .codex — agent runtime config                              |   1,979 |    23 |
| perf-profiles — committed profiling evidence                         |     442 |     7 |
| store-assets — listing text                                          |     401 |     3 |
| releases — release notes                                             |     260 |     9 |

<!-- code-map:generated:end totals -->

<!-- code-map:generated:start splits -->

## Splits for every measured area over 3,000 LOC

### docs (209,792) — by subtree

| Sub-bucket     |    LOC | Files |
| -------------- | -----: | ----: |
| migration      | 97,496 |    62 |
| scratchpad     | 73,244 |   447 |
| adrs           | 26,808 |   179 |
| (root docs)    |  7,259 |    20 |
| MOBILE         |  1,361 |     4 |
| investigations |  1,318 |     8 |
| handoff        |    856 |     7 |
| CLOUD          |    692 |     2 |
| audit-deferred |    637 |     7 |
| evidence       |     59 |     1 |
| implementation |     52 |     1 |
| assets         |     10 |     1 |

### tools excluding asset-gen (202,389) — by subtree

| Sub-bucket         |    LOC | Files |
| ------------------ | -----: | ----: |
| tests              | 71,946 |   373 |
| migration          | 35,303 |   169 |
| rival-agent        |  7,931 |    62 |
| centerline-tracing |  7,464 |    43 |
| device-parity      |  7,442 |    61 |
| audit-burndown     |  6,665 |    29 |
| model-eval         |  6,289 |    15 |
| store-drawings     |  6,268 |    21 |
| scrapbook          |  6,162 |    14 |
| release            |  5,958 |    34 |
| vectorize          |  4,703 |    18 |
| (root)             |  4,514 |    20 |
| mobile             |  4,057 |    32 |
| git-housekeeping   |  3,783 |    18 |
| api-smoke          |  2,953 |    18 |
| page-inventory     |  2,392 |    10 |
| page-load          |  2,051 |    10 |
| marketing-assets   |  2,018 |    23 |
| flaky-digest       |  1,986 |     9 |
| icons              |  1,545 |    17 |
| ruler              |  1,485 |    15 |
| lib                |  1,346 |    21 |
| elevenlabs         |  1,245 |     5 |
| redteam            |  1,175 |    11 |
| adrs               |  1,161 |     5 |
| code-map           |  1,100 |     8 |
| e2e-tuning         |  1,020 |     2 |
| ci-mirror          |    776 |     9 |
| github             |    580 |     6 |
| sounds             |    478 |     4 |
| perf               |    398 |     5 |
| instruction source |    195 |     1 |

### src (92,450) — functional domains

| Domain                                 |    LOC | Files |
| -------------------------------------- | -----: | ----: |
| Drawing / canvas engine                | 17,969 |   175 |
| Core UI controls                       | 15,547 |   175 |
| AI image generation                    | 10,387 |    81 |
| Coloring books + offline library       |  9,500 |    30 |
| Platform / device integration          |  9,060 |   193 |
| App shell / information pages          |  7,226 |    72 |
| Settings / parent center               |  6,053 |    52 |
| Design system, styleguide + icons      |  4,440 |    27 |
| PWA / installation                     |  3,451 |    22 |
| Web admin console                      |  1,961 |    14 |
| Focused utilities / generated app data |  1,482 |    34 |
| Color palette & picker                 |  1,467 |    15 |
| Feedback / reporting                   |  1,109 |    18 |
| Storage / picture export               |  1,102 |    12 |
| Audio                                  |    943 |    11 |
| Gestures                               |    753 |    10 |

#### Drawing / canvas engine (17,969) — defined subdomains

The drawing domain contains `drawing/`, `clear/`, shared `lib/drawing/` primitives and the paper,
departing-ink, clear and undo components in `rsdDrawing/`. Picture export lives in the storage
domain; server code is measured under `netlify/`.

| Subdomain                                     |    LOC | Files |
| --------------------------------------------- | -----: | ----: |
| Native / web rendering, input & history       | 13,668 |   140 |
| Bundled coloring assets & paper layout        |  2,222 |    15 |
| Shared drawing geometry & retained primitives |  1,402 |    17 |
| Clear gesture & animation                     |    677 |     3 |
| **Drawing / canvas engine total**             | 17,969 |   175 |

#### AI image generation (10,387) — defined subdomains

This domain includes the client transport, recovery and generation state in `ai/`, shared AI
contracts and the generation/result/reporting components. The hosted API and workers are measured
separately under `netlify/`.

| Subdomain                                     |    LOC | Files |
| --------------------------------------------- | -----: | ----: |
| Client transport, recovery & generation state |  6,362 |    44 |
| Generation, result & reporting UI             |  2,492 |    14 |
| Shared contracts & progress geometry          |  1,533 |    23 |
| **AI image generation total**                 | 10,387 |    81 |

### tools/asset-gen (30,445) — by subtree

| Sub-bucket                       |    LOC | Files |
| -------------------------------- | -----: | ----: |
| ideas-exploration (R&D scratch)  | 12,049 |    88 |
| tests                            |  5,089 |    37 |
| lib (pipeline core)              |  4,044 |    34 |
| coloring (pipeline CLIs)         |  3,161 |    17 |
| docs (pipeline records)          |  1,734 |    13 |
| style-covers                     |  1,634 |     3 |
| crayon-reference                 |  1,060 |     6 |
| legacy                           |    540 |     3 |
| coloring-book-proof-sheet-assets |    527 |     2 |
| (root)                           |    456 |     5 |
| instruction source               |    151 |     1 |

### netlify (22,951) — by subtree

| Sub-bucket |    LOC | Files |
| ---------- | -----: | ----: |
| server     | 22,447 |   129 |
| (root)     |    267 |     3 |
| functions  |    237 |     7 |

### native shells (18,611) — by subtree

| Sub-bucket |   LOC | Files |
| ---------- | ----: | ----: |
| perf       | 8,773 |     5 |
| ios        | 6,569 |    47 |
| android    | 3,098 |    30 |
| fastlane   |   137 |     9 |
| .maestro   |    34 |     1 |

### e2e (12,235) — by subtree

| Sub-bucket               |    LOC | Files |
| ------------------------ | -----: | ----: |
| specs                    | 10,230 |    70 |
| support                  |  1,143 |     5 |
| (root) config / fixtures |    428 |     6 |
| server                   |    380 |     4 |
| fixtures                 |     54 |     1 |

### .ruler (11,947) — by subtree

| Sub-bucket                |   LOC | Files |
| ------------------------- | ----: | ----: |
| skill sources             | 8,985 |    61 |
| skill notes               | 2,439 |    17 |
| root instruction / config |   523 |     7 |

### root (4,175) — by subtree

| Sub-bucket |   LOC | Files |
| ---------- | ----: | ----: |
| (root)     | 4,071 |    35 |
| assets     |    82 |   112 |
| .vscode    |    22 |     2 |

### scrapbook (3,556) — by subtree

| Sub-bucket   |   LOC | Files |
| ------------ | ----: | ----: |
| sound-design | 1,964 |     1 |
| performance  | 1,445 |     5 |
| (root)       |   147 |     1 |

<!-- code-map:generated:end splits -->

## Notes worth carrying forward

These notes compare the tables with the prior published snapshot of de3110af7687 (2026-10-06). The
exclusion classes are unchanged; domain placement follows the promoted RN app rather than the
removed Svelte routes and components.

* Measured LOC rose from 471,361 to 613,919. Documentation accounts for most of the increase:
  migration records are 97,496 lines and scratchpad prose/scripts are 73,244 lines. Captured data
  retains its existing exclusions; authored evidence and scripts remain visible in the totals.
* Root `src/` has 92,450 measured lines. Drawing, shared controls, AI and the offline library are
  distinct domains. The former `web/src`, `web/tests` and isolated-candidate areas no longer exist;
  RN browser specs live in `e2e/` and server code lives in `netlify/`. The app-total change includes
  deletions and ownership moves, not a claim that every moved line was removed.
* `tools/perf` shrank from 74,718 lines to 398 measured lines. Native/RSD contracts under
  `tools/tests/` and `tools/migration/` make repository automation the second largest area.
* The 22,951-line Netlify area includes the hosted API, background workers and shared server
  implementation. Those lines do not inflate the client AI domain.
* Native projects and committed replay traces are counted together, with a subtree split so replay
  packets are visible. The classification of root hooks preserves their complete filename.
* The documentation growth is explained by the migration's evidence packages. No new issue is filed;
  the snapshot exposes the cost for later maintenance decisions.
