# Code Map — lines of code by domain

> **Snapshot as of 2026-07-23.** These are point-in-time counts of committed source and will drift
> as the code changes. Re-run the pass (see [Method](#method)) to refresh. This is a sibling to
> `docs/DEPENDENCIES.md`: a "state of the codebase" inventory, not a maintained-in-lockstep truth.

## Method

Counts are `git ls-files` line counts over the committed tree, with these filters applied so the
numbers reflect **hand-written code and config**, not assets or generated duplicates:

* **Excluded:** binary assets (PNG/WebP/JPG/MP3/fonts), large data dumps (`package-lock.json`,
  asset-gen / scrapbook data JSON, `.patch` / `.enc` / `.sha256`, `.txt` notes, generated
  report/proof-sheet HTML).
* **Kept:** source code plus important config files (`package.json`, `tsconfig`, `dprint.json`,
  `capacitor.config.json`, `.claude/settings.json`, `netlify.toml`, svelte/vite/playwright configs,
  …).
* **Ruler dedup:** dropped every generated `CLAUDE.md` / `AGENTS.md`, `.claude/skills/**`, and the
  entire `.agents/**` tree (all produced by `npm run ruler:apply`). Kept `.ruler/**` sources; a
  `.md` file is counted only if it's a `.ruler` source or independently authored (docs, ADRs,
  release notes, README).

Grouping is one file → one area; a few cross-cutting files sit in a single bucket by convention (for
example `books.ts` counts under Coloring books, not App state), so individual buckets are ±a few
hundred lines at the boundaries while totals are exact.

## Grand total: **89,323 LOC across 721 files**

| #  | Area                                      |    LOC | Files |
| -- | ----------------------------------------- | -----: | ----: |
| 1  | **web/src** — the app                     | 30,562 |   257 |
| 4  | **tools/asset-gen** — art pipeline        | 22,052 |   163 |
| 9  | **docs** — ADRs & guides (authored md)    |  9,573 |    83 |
| 5  | **scripts** — build/dev drivers           |  8,837 |    58 |
| 7  | **.ruler** — agent-instruction sources    |  5,597 |    43 |
| 2  | **web/tests** — E2E + integration         |  5,465 |    21 |
| 3  | web/\* — build/test config                |  2,331 |    15 |
| 6  | android + ios + fastlane — native shells  |  1,220 |    28 |
| 11 | .github — CI workflows                    |    852 |    13 |
| 10 | scrapbook — run-artifact code             |    899 |     9 |
| 14 | root config (package.json, dprint, …)     |    828 |    11 |
| 8  | .claude / .codex — hooks/rules/cmds/cloud |    694 |    11 |
| 13 | store-assets — listing text               |    260 |     3 |
| 12 | releases — release notes                  |    153 |     6 |

## Splits for every area over 3k LOC

### 1. web/src (30,562) — functional domains

| Domain                        |   LOC | Files |
| ----------------------------- | ----: | ----: |
| Drawing / canvas engine †     | 7,154 |    25 |
| AI image generation †         | 4,857 |    38 |
| App state (runes) †           | 3,307 |    25 |
| Parent Center / settings      | 2,770 |    12 |
| Core UI controls              | 2,146 |     7 |
| Design system + icons         | 1,395 |    72 |
| Admin console + token backend | 1,335 |     6 |
| Routes / app shell / dev      | 1,318 |    13 |
| Gestures / Svelte actions     | 1,213 |    10 |
| Color palette & picker        | 1,169 |     6 |
| Storage / persistence         |   865 |     6 |
| PWA / service worker          |   848 |     2 |
| Server / API backend          |   739 |    10 |
| Coloring books                |   374 |     1 |
| Misc lib utilities            |   361 |    10 |
| Audio                         |   104 |     1 |

### 4. tools/asset-gen (22,052) — by subtree

| Sub-bucket                        |    LOC | Files |
| --------------------------------- | -----: | ----: |
| ideas-exploration (R&D scratch) † | 11,912 |    88 |
| bin (pipeline CLIs) †             |  3,222 |    18 |
| lib (pipeline core)               |  2,124 |    16 |
| docs (pipeline records)           |  1,566 |    12 |
| tests                             |  1,367 |    15 |
| crayon-brush-samples              |    811 |     7 |
| legacy                            |    541 |     3 |
| coloring-book-proof-sheet-assets  |    476 |     2 |
| (root)                            |     33 |     2 |

### 9. docs (9,573) — by subtree

| Sub-bucket  |   LOC | Files |
| ----------- | ----: | ----: |
| adrs †      | 7,634 |    74 |
| (root docs) | 1,610 |     7 |
| CLOUD       |   329 |     2 |

### 5. scripts (8,837) — by subtree

| Sub-bucket       |   LOC | Files |
| ---------------- | ----: | ----: |
| (root scripts) † | 3,968 |    32 |
| perf †           | 3,188 |    14 |
| lib              | 1,681 |    12 |

### 7. .ruler (5,597) — by subtree

| Sub-bucket           |   LOC | Files |
| -------------------- | ----: | ----: |
| skills sources †     | 5,388 |    37 |
| root instruction .md |   209 |     6 |

### 2. web/tests (5,465) — by subtree

| Sub-bucket            |   LOC | Files |
| --------------------- | ----: | ----: |
| (root) E2E/unit specs | 5,269 |    19 |
| model-eval            |   106 |     1 |
| redteam               |    90 |     1 |

† = sub-bucket is itself over 3k LOC; left un-split here (one level of splitting only). The two
largest web/src domains (Drawing and AI) break down further file-by-file — `drawing/engine.ts` alone
is ~1,450 lines.

## Notes worth carrying forward

* **The drawing engine is the heart of the app** — ~7.2k LOC (nearly a quarter of `web/src`) and the
  most test-covered production code (see ADR-0004, ADR-0066).
* **AI image generation is a full vertical, not a feature** — ~4.9k LOC spanning client, server, and
  admin/token plumbing.
* **`tools/asset-gen` is nearly as large as the app** (22k vs 30.5k), but **more than half of it
  (11.9k) is `ideas-exploration`** — committed R&D scratch, not the live pipeline. The production
  pipeline is `bin` + `lib` ≈ 5.3k.
* **ADRs are 7.6k LOC of markdown** (74 files) — the decision record is a substantial, real part of
  the repo.
* **The backend surface is small** (~2.8k across AI-server + admin + API) because native ships fully
  static and calls the hosted API (ADR-0001).
