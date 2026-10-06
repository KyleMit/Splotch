# Code Map — lines of code by domain

<!-- code-map:generated:start snapshot -->

> **Snapshot of a190af1f5d62 (2026-10-06).** Every table in this map is generated from that commit
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
  instruction source counts in the area it describes. The isolated native candidate has its own
  measured area; it is separate from the shipped web app and native shells.
* **Binary media / archives:** images, audio, fonts, JARs, and gzip/zip archives.
* **Vector art assets / traced samples:** coloring-page outlines under `web/static/coloring/`, and
  the traced SVG corpora of `model-eval`, `centerline-tracing`, and the `vectorize` pilot.
  Hand-authored icons in `web/src` stay measured.
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
`web/src` domains are an ordered first-match rule list whose directory-wide fallbacks place a new
file somewhere plausible until a reconcile pass gives it a precise rule, so a few functional
boundaries are judgment calls even though every total is exact.

### Coverage check

<!-- code-map:generated:start coverage -->

| Disposition                    | Files |
| ------------------------------ | ----: |
| Measured and categorized       | 2,873 |
| Explicitly excluded            | 5,095 |
| **All tracked files**          | 7,968 |
| Unassigned or multiply counted |     0 |

| Exclusion class                                  | Files |
| ------------------------------------------------ | ----: |
| Binary media / archives                          | 3,208 |
| Generated measurement data                       | 1,054 |
| Vector art assets / traced samples               |   291 |
| Generated audit / ranking text and captured logs |   235 |
| Generated / provider agent delivery trees        |   228 |
| Archived payloads / hashes                       |    51 |
| Generated report / proof-sheet HTML              |    23 |
| Repository metadata outside LOC scope            |     2 |
| Code map output                                  |     1 |
| Dependency lockfile                              |     1 |
| Publishing marker                                |     1 |
| **Total explicitly excluded**                    | 5,095 |

<!-- code-map:generated:end coverage -->

<!-- code-map:generated:start totals -->

## Grand total: **470,810 LOC across 2,873 measured files**

| Area                                                            |     LOC | Files |
| --------------------------------------------------------------- | ------: | ----: |
| **tools (excluding asset-gen)** — repo automation               | 183,180 |   830 |
| **web/src** — the app                                           | 121,613 |   973 |
| **docs** — ADRs & guides                                        |  74,042 |   416 |
| **tools/asset-gen** — art pipeline                              |  30,553 |   210 |
| **web/tests** — E2E + integration                               |  28,628 |   138 |
| **.ruler** — agent-instruction sources                          |  14,321 |    96 |
| android + ios + fastlane + Maestro — native shells              |   3,945 |    71 |
| scrapbook — run-artifact prose                                  |   3,556 |     7 |
| .github — CI and issue config                                   |   2,629 |    26 |
| root config / README / shared assets                            |   2,628 |    20 |
| .claude / .codex — agent runtime config                         |   2,164 |    25 |
| web/\* — build/test config and static text                      |   2,138 |    28 |
| perf-profiles — committed profiling evidence                    |     442 |     7 |
| store-assets — listing text                                     |     410 |     3 |
| releases — release notes                                        |     259 |     9 |
| netlify — edge functions and config                             |     178 |     5 |
| **experiments/native-architecture** — isolated native candidate |     124 |     9 |

<!-- code-map:generated:end totals -->

<!-- code-map:generated:start splits -->

## Splits for every measured area over 3,000 LOC

### tools excluding asset-gen (183,180) — by subtree

| Sub-bucket         |    LOC | Files |
| ------------------ | -----: | ----: |
| perf               | 74,718 |   253 |
| tests              | 15,548 |    92 |
| centerline-tracing |  7,464 |    43 |
| rival-agent        |  7,016 |    60 |
| store-drawings     |  6,875 |    21 |
| audit-burndown     |  6,670 |    29 |
| model-eval         |  6,448 |    16 |
| scrapbook          |  6,162 |    14 |
| (root)             |  5,508 |    30 |
| release            |  5,358 |    28 |
| vectorize          |  4,701 |    18 |
| page-inventory     |  4,693 |    12 |
| mobile             |  4,490 |    38 |
| git-housekeeping   |  3,783 |    18 |
| migration          |  3,746 |    21 |
| api-smoke          |  2,137 |    11 |
| flaky-digest       |  1,974 |     9 |
| marketing-assets   |  1,771 |    15 |
| e2e-tuning         |  1,647 |     4 |
| ruler              |  1,485 |    15 |
| elevenlabs         |  1,245 |     5 |
| code-map           |  1,170 |     8 |
| adrs               |  1,161 |     5 |
| redteam            |  1,088 |    10 |
| page-load          |  1,014 |     4 |
| icons              |    951 |     9 |
| ci-mirror          |    920 |     9 |
| lib                |    767 |    13 |
| app-driver         |    754 |     5 |
| tokens             |    655 |     4 |
| github             |    580 |     6 |
| sounds             |    478 |     4 |
| instruction source |    203 |     1 |

### web/src (121,613) — functional domains

| Domain                                 |    LOC | Files |
| -------------------------------------- | -----: | ----: |
| Drawing / canvas engine                | 21,232 |   139 |
| AI image generation                    | 18,296 |   110 |
| Routes / app shell / dev surfaces      | 13,688 |   114 |
| Design system, styleguide + icons      | 10,700 |   165 |
| Settings surface                       |  9,533 |    60 |
| Core UI controls                       |  6,217 |    50 |
| Gestures / Svelte actions              |  5,553 |    37 |
| Coloring books + pack delivery         |  5,410 |    35 |
| Platform / device integration          |  4,202 |    37 |
| Storage / persistence                  |  3,945 |    24 |
| PWA / installation                     |  3,751 |    22 |
| Admin console + token backend          |  3,656 |    24 |
| Server / API backend                   |  3,395 |    27 |
| App state (runes)                      |  2,991 |    29 |
| Focused utilities / generated app data |  2,258 |    53 |
| Color palette & picker                 |  2,244 |    14 |
| Audio                                  |  1,698 |     7 |
| Beta onboarding                        |  1,440 |    16 |
| Feedback / reporting                   |  1,404 |    10 |

#### Drawing / canvas engine (21,232) — defined subdomains

The drawing domain contains `lib/drawing/**` except the AI-generation and polaroid modules, plus
`DrawingCanvas.svelte`, `LiveSurface.svelte`, `state/canvas.svelte.ts`, and `routes/dev/engine/**`.

| Subdomain                                 |    LOC | Files |
| ----------------------------------------- | -----: | ----: |
| Stroke model & brush rendering            |  7,465 |    42 |
| Engine orchestration & canvas integration |  5,270 |    35 |
| Export, saving & screenshot pipeline      |  4,002 |    26 |
| Tiled renderer, retained history & undo   |  3,613 |    30 |
| Paper view & coloring integration         |    882 |     6 |
| **Drawing / canvas engine total**         | 21,232 |   139 |

#### AI image generation (18,296) — defined subdomains

This vertical includes generation-specific client code, state, components, server modules, and the
four public generation/reporting API routes. General-purpose server infrastructure and the admin
token surface remain in their own domains.

| Subdomain                                       |    LOC | Files |
| ----------------------------------------------- | -----: | ----: |
| Server authorization, jobs, storage & endpoints |  9,427 |    45 |
| Client pipeline, state & shared contracts       |  5,527 |    45 |
| Generation, result & reporting UI               |  3,342 |    20 |
| **AI image generation total**                   | 18,296 |   110 |

### docs (74,042) — by subtree

| Sub-bucket     |    LOC | Files |
| -------------- | -----: | ----: |
| scratchpad     | 29,134 |   176 |
| adrs           | 25,205 |   174 |
| (root docs)    | 12,621 |    24 |
| migration      |  1,963 |    12 |
| MOBILE         |  1,628 |     4 |
| investigations |  1,318 |     8 |
| CLOUD          |    738 |     2 |
| handoff        |    677 |     6 |
| audit-deferred |    637 |     7 |
| evidence       |     59 |     1 |
| implementation |     52 |     1 |
| assets         |     10 |     1 |

### tools/asset-gen (30,553) — by subtree

| Sub-bucket                       |    LOC | Files |
| -------------------------------- | -----: | ----: |
| ideas-exploration (R&D scratch)  | 12,049 |    88 |
| tests                            |  5,051 |    37 |
| lib (pipeline core)              |  4,044 |    34 |
| coloring (pipeline CLIs)         |  3,156 |    17 |
| docs (pipeline records)          |  1,733 |    13 |
| style-covers                     |  1,634 |     3 |
| crayon-reference                 |  1,213 |     7 |
| legacy                           |    540 |     3 |
| coloring-book-proof-sheet-assets |    527 |     2 |
| (root)                           |    456 |     5 |
| instruction source               |    150 |     1 |

### web/tests (28,628) — by subtree

| Sub-bucket               |    LOC | Files |
| ------------------------ | -----: | ----: |
| (root) E2E / integration | 28,548 |   136 |
| artifacts                |     54 |     1 |
| instruction source       |     26 |     1 |

### .ruler (14,321) — by subtree

| Sub-bucket                |    LOC | Files |
| ------------------------- | -----: | ----: |
| skill sources             | 10,896 |    68 |
| skill notes               |  2,881 |    21 |
| root instruction / config |    544 |     7 |

### native shells (3,945) — by subtree

| Sub-bucket |   LOC | Files |
| ---------- | ----: | ----: |
| android    | 2,178 |    38 |
| ios        | 1,598 |    23 |
| fastlane   |   137 |     9 |
| .maestro   |    32 |     1 |

### scrapbook (3,556) — by subtree

| Sub-bucket   |   LOC | Files |
| ------------ | ----: | ----: |
| sound-design | 1,964 |     1 |
| performance  | 1,445 |     5 |
| (root)       |   147 |     1 |

<!-- code-map:generated:end splits -->

## Notes worth carrying forward

These notes compare the tables with the published snapshot of 9afa78cf0da1 (2026-09-25). The
comparison includes the Method change that excludes captured migration data while counting its
authored prose and the isolated candidate's source.

* Measured LOC increased from about 415k to 471k. Repository automation and `web/src` account for
  most of the difference; co-located tests count with their owning domain.
* `tools/perf` remains the largest tools subtree. The Magic observation unit is counted with its app
  and performance-tool owners; its presence does not demonstrate native performance.
* The private native candidate has its own measured area. Its entry and configuration are structural
  preparation; native builds, mounts, upgrades and architecture selection remain separate acceptance
  gates.
* Migration evidence follows the existing data exclusion rules. Authored records and scripts remain
  measured, so an evidence package cannot hide implementation or prose growth.
