# Code Map — lines of code by domain

<!-- code-map:generated:start snapshot -->

> **Snapshot of 9afa78cf0da1 (2026-09-25).** Every table in this map is generated from that commit
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
  instruction source counts in the area it describes.
* **Binary media / archives:** images, audio, fonts, JARs, and gzip/zip archives.
* **Vector art assets / traced samples:** coloring-page outlines under `web/static/coloring/`, and
  the traced SVG corpora of `model-eval`, `centerline-tracing`, and the `vectorize` pilot.
  Hand-authored icons in `web/src` stay measured.
* **Generated measurement data:** JSON, JSONL, TSV, CSV, and `.out` files under the evidence roots
  (`perf-profiles/`, `scrapbook/`, `docs/scratchpad/`, `docs/investigations/`, `tools/asset-gen/`,
  and the `centerline-tracing` benchmark), plus captured logs and ranking text there.
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
| Measured and categorized       | 2,528 |
| Explicitly excluded            | 4,742 |
| **All tracked files**          | 7,270 |
| Unassigned or multiply counted |     0 |

| Exclusion class                                  | Files |
| ------------------------------------------------ | ----: |
| Binary media / archives                          | 3,189 |
| Generated measurement data                       |   857 |
| Vector art assets / traced samples               |   291 |
| Generated / provider agent delivery trees        |   202 |
| Generated audit / ranking text and captured logs |   125 |
| Archived payloads / hashes                       |    50 |
| Generated report / proof-sheet HTML              |    23 |
| Repository metadata outside LOC scope            |     2 |
| Code map output                                  |     1 |
| Dependency lockfile                              |     1 |
| Publishing marker                                |     1 |
| **Total explicitly excluded**                    | 4,742 |

<!-- code-map:generated:end coverage -->

<!-- code-map:generated:start totals -->

## Grand total: **414,725 LOC across 2,528 measured files**

| Area                                               |     LOC | Files |
| -------------------------------------------------- | ------: | ----: |
| **tools (excluding asset-gen)** — repo automation  | 156,803 |   684 |
| **web/src** — the app                              | 106,270 |   850 |
| **docs** — ADRs & guides                           |  66,890 |   381 |
| **tools/asset-gen** — art pipeline                 |  29,946 |   207 |
| **web/tests** — E2E + integration                  |  25,572 |   125 |
| **.ruler** — agent-instruction sources             |  11,861 |    85 |
| android + ios + fastlane + Maestro — native shells |   3,857 |    69 |
| scrapbook — run-artifact prose                     |   3,568 |     7 |
| .github — CI and issue config                      |   2,428 |    25 |
| root config / README / shared assets               |   2,371 |    20 |
| web/\* — build/test config and static text         |   2,121 |    29 |
| .claude / .codex — agent runtime config            |   1,868 |    23 |
| store-assets — listing text                        |     410 |     3 |
| perf-profiles — committed profiling evidence       |     357 |     6 |
| releases — release notes                           |     258 |     9 |
| netlify — edge functions and config                |     145 |     5 |

<!-- code-map:generated:end totals -->

<!-- code-map:generated:start splits -->

## Splits for every measured area over 3,000 LOC

### tools excluding asset-gen (156,803) — by subtree

| Sub-bucket         |    LOC | Files |
| ------------------ | -----: | ----: |
| perf               | 67,937 |   204 |
| tests              | 10,662 |    67 |
| centerline-tracing |  7,484 |    43 |
| store-drawings     |  6,875 |    21 |
| rival-agent        |  6,219 |    57 |
| model-eval         |  6,110 |    15 |
| scrapbook          |  5,978 |    13 |
| audit-burndown     |  5,053 |    22 |
| page-inventory     |  4,719 |    12 |
| vectorize          |  4,704 |    18 |
| (root)             |  4,219 |    25 |
| release            |  4,214 |    25 |
| mobile             |  3,633 |    34 |
| git-housekeeping   |  2,803 |    18 |
| flaky-digest       |  1,974 |     9 |
| api-smoke          |  1,846 |     9 |
| e2e-tuning         |  1,637 |     4 |
| marketing-assets   |  1,303 |    10 |
| elevenlabs         |  1,239 |     5 |
| ruler              |  1,160 |    10 |
| code-map           |  1,150 |     8 |
| icons              |    951 |     9 |
| adrs               |    835 |     4 |
| redteam            |    775 |     7 |
| page-load          |    671 |     4 |
| tokens             |    649 |     4 |
| app-driver         |    565 |     4 |
| lib                |    500 |    10 |
| sounds             |    476 |     4 |
| ci-mirror          |    293 |     8 |
| instruction source |    169 |     1 |

### web/src (106,270) — functional domains

| Domain                                 |    LOC | Files |
| -------------------------------------- | -----: | ----: |
| Drawing / canvas engine                | 18,554 |   122 |
| AI image generation                    | 15,859 |   102 |
| Routes / app shell / dev surfaces      | 11,170 |    81 |
| Design system, styleguide + icons      |  9,708 |   153 |
| Settings surface                       |  8,179 |    47 |
| Core UI controls                       |  5,468 |    42 |
| Gestures / Svelte actions              |  5,231 |    36 |
| Coloring books + pack delivery         |  5,025 |    34 |
| PWA / installation                     |  3,697 |    21 |
| Platform / device integration          |  3,665 |    38 |
| Admin console + token backend          |  3,421 |    24 |
| Storage / persistence                  |  3,146 |    21 |
| App state (runes)                      |  2,897 |    29 |
| Server / API backend                   |  2,862 |    25 |
| Color palette & picker                 |  2,127 |    13 |
| Audio                                  |  1,628 |     6 |
| Beta onboarding                        |  1,422 |    16 |
| Focused utilities / generated app data |  1,321 |    34 |
| Feedback / reporting                   |    890 |     6 |

#### Drawing / canvas engine (18,554) — defined subdomains

The drawing domain contains `lib/drawing/**` except the AI-generation and polaroid modules, plus
`DrawingCanvas.svelte`, `LiveSurface.svelte`, `state/canvas.svelte.ts`, and `routes/dev/engine/**`.

| Subdomain                                 |    LOC | Files |
| ----------------------------------------- | -----: | ----: |
| Stroke model & brush rendering            |  6,433 |    35 |
| Engine orchestration & canvas integration |  4,207 |    26 |
| Tiled renderer, retained history & undo   |  3,680 |    30 |
| Export, saving & screenshot pipeline      |  3,435 |    25 |
| Paper view & coloring integration         |    799 |     6 |
| **Drawing / canvas engine total**         | 18,554 |   122 |

#### AI image generation (15,859) — defined subdomains

This vertical includes generation-specific client code, state, components, server modules, and the
four public generation/reporting API routes. General-purpose server infrastructure and the admin
token surface remain in their own domains.

| Subdomain                                       |    LOC | Files |
| ----------------------------------------------- | -----: | ----: |
| Server authorization, jobs, storage & endpoints |  7,731 |    42 |
| Client pipeline, state & shared contracts       |  5,286 |    44 |
| Generation, result & reporting UI               |  2,842 |    16 |
| **AI image generation total**                   | 15,859 |   102 |

### docs (66,890) — by subtree

| Sub-bucket     |    LOC | Files |
| -------------- | -----: | ----: |
| scratchpad     | 27,114 |   163 |
| adrs           | 24,519 |   172 |
| (root docs)    | 11,037 |    23 |
| MOBILE         |  1,569 |     4 |
| investigations |    765 |     3 |
| handoff        |    677 |     6 |
| audit-deferred |    637 |     7 |
| CLOUD          |    562 |     2 |
| assets         |     10 |     1 |

### tools/asset-gen (29,946) — by subtree

| Sub-bucket                       |    LOC | Files |
| -------------------------------- | -----: | ----: |
| ideas-exploration (R&D scratch)  | 12,049 |    88 |
| tests                            |  4,396 |    33 |
| lib (pipeline core)              |  4,182 |    35 |
| coloring (pipeline CLIs)         |  3,129 |    17 |
| docs (pipeline records)          |  1,719 |    13 |
| style-covers                     |  1,650 |     3 |
| crayon-reference                 |  1,213 |     7 |
| legacy                           |    540 |     3 |
| coloring-book-proof-sheet-assets |    472 |     2 |
| (root)                           |    450 |     5 |
| instruction source               |    146 |     1 |

### web/tests (25,572) — by subtree

| Sub-bucket               |    LOC | Files |
| ------------------------ | -----: | ----: |
| (root) E2E / integration | 25,492 |   123 |
| artifacts                |     54 |     1 |
| instruction source       |     26 |     1 |

### .ruler (11,861) — by subtree

| Sub-bucket                |   LOC | Files |
| ------------------------- | ----: | ----: |
| skill sources             | 9,194 |    60 |
| skill notes               | 2,188 |    18 |
| root instruction / config |   479 |     7 |

### native shells (3,857) — by subtree

| Sub-bucket |   LOC | Files |
| ---------- | ----: | ----: |
| android    | 2,109 |    36 |
| ios        | 1,579 |    23 |
| fastlane   |   137 |     9 |
| .maestro   |    32 |     1 |

### scrapbook (3,568) — by subtree

| Sub-bucket   |   LOC | Files |
| ------------ | ----: | ----: |
| sound-design | 1,965 |     1 |
| performance  | 1,456 |     5 |
| (root)       |   147 |     1 |

<!-- code-map:generated:end splits -->

## Notes worth carrying forward

The notes compare this snapshot with the previous one, taken at d3dad50b5404 (2026-08-19). The
generator reproduces that commit's area and exclusion counts exactly, apart from two deliberate
Method changes: this map no longer counts itself, and JSON under a `fixtures/` directory counts as
measurement data.

* **The repository nearly doubled in five weeks** — about 227k to 415k measured LOC. The growth is
  concentrated in repository automation and working notes rather than in the shipped app.
* **Performance tooling is now the largest single subsystem.** `tools/perf` grew from 15.8k to
  roughly 68k LOC, and about 29k of that is its own test suite. `tools` excluding asset-gen now
  outweighs `web/src`.
* **`web/src` grew by about half**, to 106k LOC across 850 files. Drawing (18.6k) and AI generation
  (15.9k) remain the two largest verticals. Routes, app shell, and dev surfaces doubled to 11.2k,
  mostly the `/dev` harnesses (store frames, notch simulator, engine probe) and `lib/boot`.
* **`docs/scratchpad` went from 1.8k to 27.1k LOC** and is now larger than the ADRs. That count is
  the authored part only: the hundreds of captured JSON, log, and gzip files in its evidence
  packages are excluded as measurement data.
* **ADRs grew from 125 to 172 files** (17.2k to 24.5k LOC). They are still the bulk of the
  maintained knowledge outside the scratchpad.
* **New since the last snapshot:** the `perf-profiles/` evidence tree (651 of its 657 files are
  excluded data), `docs/investigations`, and the `centerline-tracing`, `rival-agent`,
  `git-housekeeping`, `flaky-digest`, `elevenlabs`, `page-load`, `sounds`, and `ci-mirror` tool
  subtrees. Coloring-page outlines now ship as SVG under `web/static/coloring/`, so vector art
  became its own exclusion class.
* **The art pipeline is flat** at about 30k LOC, and its frozen `ideas-exploration` archive is still
  12k of that.
* **Tests remain distributed:** `web/tests` grew to 25.6k LOC of E2E and integration specs, while
  co-located unit tests count with the app or tool domain they exercise.
