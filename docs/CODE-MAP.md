# Code Map — lines of code by domain

> **Snapshot as of 2026-08-19 at d3dad50b, plus this document.** These are point-in-time counts of
> tracked source and will drift as the code changes. Re-run the pass (see [Method](#method)) to
> refresh. This is a sibling to `docs/DEPENDENCIES.md`: a "state of the codebase" inventory, not a
> maintained-in-lockstep truth.

## Method

Counts are newline counts over the `git ls-files` inventory. The pass assigns every tracked file to
exactly one measured area or one explicit exclusion class:

* **Measured:** source code (including tracked generated source used at runtime), authored Markdown,
  SVG/XML/project files, shell/config files, store listing text, and authoritative `.ruler/**`
  sources — including nested `.ruler` instruction sources.
* **Binary media / archives:** PNG, WebP, JPG/JPEG, MP3, ICO, and JAR.
* **Generated or bulky data:** `pnpm-lock.yaml`; asset-gen and scrapbook measurement JSON; generated
  asset-gen and scrapbook report/proof-sheet HTML; generated ranking/audit text; patch, encrypted,
  and hash payloads; and the scrapbook publishing marker.
* **Agent dedup:** generated `CLAUDE.md` / `AGENTS.md`, `.claude/skills/**`,
  `.claude/skill-notes/**`, and `.agents/**`. This also leaves direct-maintained provider packages
  out of the LOC total, preserving the provider-tree exclusion.
* **Repository metadata outside LOC scope:** `LICENSE` and `.git-blame-ignore-revs`.

Grouping is one file → one area and, where shown, one sub-bucket. Cross-cutting files sit in a
single bucket by convention; co-located tests follow the subject they test. Totals are exact even
though a few functional boundaries are judgment calls.

### Coverage check

| Disposition                    | Files |
| ------------------------------ | ----: |
| Measured and categorized       | 1,582 |
| Explicitly excluded            | 3,734 |
| **All tracked files**          | 5,316 |
| Unassigned or multiply counted |     0 |

| Exclusion class                           | Files |
| ----------------------------------------- | ----: |
| Binary media / archives                   | 3,433 |
| Generated / provider agent delivery trees |   147 |
| Generated measurement data                |    89 |
| Archived payloads / hashes                |    30 |
| Generated report / proof-sheet HTML       |    22 |
| Generated audit / ranking text            |     9 |
| Repository metadata outside LOC scope     |     2 |
| Dependency lockfile                       |     1 |
| Publishing marker                         |     1 |
| **Total explicitly excluded**             | 3,734 |

## Grand total: **227,140 LOC across 1,582 measured files**

| Area                                               |    LOC | Files |
| -------------------------------------------------- | -----: | ----: |
| **web/src** — the app                              | 72,825 |   594 |
| **tools (excluding asset-gen)** — repo automation  | 63,567 |   313 |
| **tools/asset-gen** — art pipeline                 | 29,064 |   205 |
| **docs** — ADRs & guides                           | 28,070 |   166 |
| **web/tests** — E2E + integration                  | 15,908 |    73 |
| **.ruler** — agent-instruction sources             |  6,273 |    55 |
| android + ios + fastlane + Maestro — native shells |  2,966 |    62 |
| .github — CI and issue config                      |  1,965 |    23 |
| web/\* — build/test config and static text         |  1,606 |    25 |
| root config / README / shared assets               |  1,515 |    18 |
| scrapbook — run-artifact prose                     |  1,357 |    13 |
| .claude / .codex — agent runtime config            |  1,262 |    19 |
| store-assets — listing text                        |    410 |     3 |
| releases — release notes                           |    216 |     8 |
| netlify — edge functions and config                |    136 |     5 |

## Splits for every measured area over 3k LOC

### web/src (72,825) — functional domains

| Domain                                 |    LOC | Files |
| -------------------------------------- | -----: | ----: |
| Drawing / canvas engine                | 13,236 |    80 |
| AI image generation                    | 12,432 |    84 |
| Design system, styleguide + icons      |  6,728 |   113 |
| Settings surface                       |  6,232 |    32 |
| Routes / app shell / dev surfaces      |  5,803 |    48 |
| Core UI controls                       |  3,648 |    19 |
| Gestures / Svelte actions              |  3,217 |    20 |
| Admin console + token backend          |  3,163 |    19 |
| Coloring books + pack delivery         |  2,982 |    22 |
| PWA / installation                     |  2,619 |    13 |
| Platform / device integration          |  1,939 |    26 |
| Color palette & picker                 |  1,770 |    11 |
| Server / API backend                   |  1,681 |    22 |
| Storage / persistence                  |  1,600 |    13 |
| App state (runes)                      |  1,447 |    17 |
| Beta onboarding                        |  1,374 |    15 |
| Focused utilities / generated app data |  1,152 |    30 |
| Feedback / reporting                   |  1,078 |     7 |
| Audio                                  |    724 |     3 |

#### Drawing / canvas engine (13,236) — defined subdomains

The drawing domain contains `lib/drawing/**` except the AI-generation and polaroid modules, plus
`DrawingCanvas.svelte`, `LiveSurface.svelte`, `state/canvas.svelte.ts`, and `routes/dev/engine/**`.
Every one of those 80 files lands in exactly one subdomain below.

| Subdomain                                 |    LOC | Files |
| ----------------------------------------- | -----: | ----: |
| Stroke model & brush rendering            |  3,758 |    15 |
| Engine orchestration & canvas integration |  3,307 |    19 |
| Tiled renderer, retained history & undo   |  2,856 |    22 |
| Export, saving & screenshot pipeline      |  2,704 |    18 |
| Paper view & coloring integration         |    611 |     6 |
| **Drawing / canvas engine total**         | 13,236 |    80 |

#### AI image generation (12,432) — defined subdomains

This vertical includes generation-specific client code, state, components, server modules, and the
four public generation/reporting API routes. General-purpose server infrastructure and the admin
token surface remain in their own domains.

| Subdomain                                       |    LOC | Files |
| ----------------------------------------------- | -----: | ----: |
| Server authorization, jobs, storage & endpoints |  5,760 |    36 |
| Client pipeline, state & shared contracts       |  3,782 |    33 |
| Generation, result & reporting UI               |  2,890 |    15 |
| **AI image generation total**                   | 12,432 |    84 |

### tools excluding asset-gen (63,567) — by subtree

| Sub-bucket         |    LOC | Files |
| ------------------ | -----: | ----: |
| perf               | 15,836 |    64 |
| store-drawings     |  9,848 |    21 |
| tests              |  6,540 |    48 |
| audit-burndown     |  5,053 |    22 |
| model-eval         |  4,177 |    12 |
| page-inventory     |  3,647 |    10 |
| mobile             |  3,053 |    27 |
| (root)             |  2,221 |    18 |
| release            |  1,733 |    13 |
| api-smoke          |  1,661 |     8 |
| vectorize          |  1,430 |     6 |
| e2e-tuning         |  1,268 |     4 |
| scrapbook          |  1,164 |     6 |
| icons              |    965 |     8 |
| marketing-assets   |    935 |     7 |
| ruler              |    858 |    10 |
| adrs               |    834 |     4 |
| redteam            |    775 |     7 |
| app-driver         |    555 |     4 |
| tokens             |    437 |     4 |
| lib                |    408 |     9 |
| instruction source |    169 |     1 |

### tools/asset-gen (29,064) — by subtree

| Sub-bucket                       |    LOC | Files |
| -------------------------------- | -----: | ----: |
| ideas-exploration (R&D scratch)  | 12,054 |    88 |
| tests                            |  4,116 |    31 |
| lib (pipeline core)              |  4,052 |    34 |
| coloring (pipeline CLIs)         |  3,161 |    18 |
| docs (pipeline records)          |  1,679 |    13 |
| style-covers                     |  1,650 |     3 |
| crayon-reference                 |    786 |     7 |
| legacy                           |    542 |     3 |
| coloring-book-proof-sheet-assets |    472 |     2 |
| (root)                           |    406 |     5 |
| instruction source               |    146 |     1 |

### docs (28,070) — by subtree

| Sub-bucket     |    LOC | Files |
| -------------- | -----: | ----: |
| adrs           | 17,237 |   125 |
| (root docs)    |  6,283 |    14 |
| scratchpad     |  1,816 |    10 |
| MOBILE         |  1,364 |     4 |
| audit-deferred |    620 |     7 |
| CLOUD          |    396 |     2 |
| handoff        |    344 |     3 |
| assets         |     10 |     1 |

### web/tests (15,908) — by subtree

| Sub-bucket               |    LOC | Files |
| ------------------------ | -----: | ----: |
| (root) E2E / integration | 15,827 |    71 |
| artifacts                |     54 |     1 |
| instruction source       |     27 |     1 |

### .ruler (6,273) — by subtree

| Sub-bucket                |   LOC | Files |
| ------------------------- | ----: | ----: |
| skill sources             | 5,237 |    43 |
| skill notes               |   629 |     5 |
| root instruction / config |   407 |     7 |

## Notes worth carrying forward

* **The drawing engine and AI generation are now peer-sized verticals** — 13.2k and 12.4k LOC,
  together 35% of `web/src`. Drawing's largest piece is brush rendering; AI's is its server-side
  authorization, job, storage, and endpoint layer.
* **Repository automation is nearly app-sized:** `tools` excluding asset-gen is 63.6k LOC versus
  72.8k in `web/src`. Performance tooling alone is 15.8k, while `store-drawings` is 9.8k including
  the tracked generated replay program.
* **The art pipeline remains a separate substantial system** at 29.1k LOC. Its frozen
  `ideas-exploration` archive is 12.1k; the active `coloring` + `lib` core is about 7.2k, backed by
  4.1k of tests.
* **ADRs are 17.2k LOC across 125 files** — comfortably the largest part of `docs` and a major part
  of the repository's maintained knowledge.
* **Tests are intentionally distributed:** the 15.9k `web/tests` area covers E2E/integration tests,
  while co-located unit tests are counted with the app or tool domain they exercise.
