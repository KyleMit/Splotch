

<!-- Source: .ruler/AGENTS.md -->

# tools/asset-gen/ - Asset-Generation Pipeline

The AI/`sharp` tooling that produces Splotch's committed art. Layout: runnable entry points
in `bin/`, shared helpers in `lib/`, committed regression fixtures in `golden/`, all
documentation in `docs/`.

## The Docs

| File               | What it is                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`        | The runbook: folder placement, every `gen:*` command, the drift audit, and the review workflow. Start here.                                                                                                                                                                                                               |
| `pipeline.md`      | The end-to-end picture: outline normalization, the punch, day/night fills, quality gates, shipped regressions, iteration methods, and where future categories will likely break. Its illustrations are frozen copies in `docs/pipeline-assets/`; keep both updated as the pipeline evolves.                               |
| `contact-sheet.md` | The contact sheet's CLI contract, layer/compositing model, and size constraints. Read before modifying `bin/gen-contact-sheet.mjs` or anything under `contact-sheet-assets/`.                                                                                                                                             |
| `ISSUES.md`        | Living list of known defects, gate blind spots, and tooling gaps.                                                                                                                                                                                                                                                         |
| `IDEAS.md`         | Image-quality backlog from the 2026-07 migration, mostly burned down empirically in `ideas-exploration/`.                                                                                                                                                                                                                 |

Decision records live here instead of `docs/adrs/`: `architecture.md`, `asset-naming.md`,
`fill-vocabulary.md`, `pen-chalk-fork.md`, `chalk-edge-crisping.md`,
`inpainted-fill-punch.md`, `fresh-outline-regen.md`, and `gemini-3.1-migration.md`.

## Key Rules

* **Not a workspace, not separately installed.** Deps (`sharp`, `@google/genai`) live in the
  repo-root `package.json`. Never add a `dependencies` block here or `npm install` in this
  folder.
* **Paths go through `lib/paths.mjs`.** Use its exported constants; do not hardcode
  `../../..` walks or import from repo-root `scripts/lib/`.
* **Raw fills are the source of truth; shipped fills are derived.** Raw lined fills live in
  `fill-src/`; shipped `web/static/coloring/**/*.{light,night}.webp` are their fills-only
  punch. Never hand-edit a shipped fill; after changing any raw, re-punch it.
* **Line work is forked per theme.** The pen outline drives light mode and every derivation.
  The chalk outline is dedicated dark-mode line art, stored ink-on-white; negate it before
  showing it to Gemini or a human as "dark mode art". After changing a chalk, regenerate the
  page's night fill and re-punch.
* The only sanctioned imports from `web/src` are the modules listed in `docs/README.md`
  (styles, prompt, geminiSafety, books).
* Cross-platform (ADR-0017): plain Node `.mjs`, no bash-isms, forward-slash glob patterns
  with a resolved `cwd`.
* Sharp alpha gotcha: never `joinChannel` an alpha plane and encode. Interleave an explicit
  RGBA buffer and construct `sharp(rgba, { raw: { width, height, channels: 4 } })`, then
  verify `hasAlpha: true`.
* Outputs are committed artifacts, reviewed by a human before shipping. Generators write
  shipped art into `web/static/` and review scratch into gitignored `.coloring-samples*/`.
  Never commit scratch dirs.
* `golden/` holds the committed regression fixtures; keep them in sync with the assets.
  After any pipeline or asset change, run `npm run gen:coloring-golden:diff` (offline, ~1
  min; exit 1 = a page regressed) and, when the change is intentional, adopt it with
  `npm run gen:coloring-golden:freeze` + `npm run gen:assets:manifest` in the same commit.
  CI's `check:assets:manifest` fails on any asset byte that drifted from
  `golden/asset-manifest.sha256`: golden scores catch quality drift, the sha256 manifest
  catches byte swaps between score-identical renders.
* Per-page generator levers live in the `fill-src/<cat>/notes.json` registry (schema in
  `lib/page-notes.mjs`): the night, chalk, and normalize generators auto-apply a page's
  registry `flags` (an explicit CLI flag always wins) and print `retry`/`review`/`why`/
  `motifs`; `--dry-run` previews the resolution offline. When you discover a lever a page
  needs, record it in the registry in the same commit that ships the asset, with a `why`
  naming the provenance.
* Read `docs/ISSUES.md` before regenerating a page or overriding a gate; update it when you
  fix or discover an issue.
* Manual/on-demand only: Gemini generators need `GEMINI_API_KEY` and are never run in CI.
* The contact sheet is the single fill-review surface. Always rebuild it when you touch an
  asset, one category per sheet, and judge on the Combined view.
* Retired techniques and failed approaches live in `legacy/`; `docs/pipeline.md` is the live
  runbook.
* `ideas-exploration/` is the frozen 2026-07 empirical burn-down of `docs/IDEAS.md`. Read its
  README before working any `IDEAS.md` item.
