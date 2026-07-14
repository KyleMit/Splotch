<!-- Source: .ruler/AGENTS.md -->

# tools/asset-gen/ — asset-generation pipeline

> This directory's `CLAUDE.md` and `AGENTS.md` are generated from the `.ruler/AGENTS.md` beside them
> — edit that source, then run `npm run ruler:apply` at the repo root (ADR-0058).

The AI/`sharp` tooling that produces Splotch's committed art. Layout: runnable entry points in
`bin/`, shared helpers in `lib/`, committed regression fixtures in `golden/`, all documentation in
`docs/`.

## The docs (`docs/`)

Runbooks and living lists:

| File               | What it is                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`        | The runbook — where the folder sits in the repo, every `gen:*` command, the drift audit, and the review workflow. Start here.                                                                                                                                                                                             |
| `pipeline.md`      | The END-TO-END picture — outline normalization, the punch, day/night fills, every quality gate and the shipped regression that motivated it, iteration methods, and where future categories will likely break. Its illustrations are frozen copies in `docs/pipeline-assets/`; keep both updated as the pipeline evolves. |
| `contact-sheet.md` | The contact sheet's CLI contract, layer/compositing model, and size constraints — read before modifying `bin/gen-contact-sheet.mjs` or anything under `contact-sheet-assets/`.                                                                                                                                            |
| `ISSUES.md`        | Living list of known defects, gate blind spots, and tooling gaps.                                                                                                                                                                                                                                                         |
| `IDEAS.md`         | Image-quality backlog from the 2026-07 migration — mostly burned down empirically in `ideas-exploration/`.                                                                                                                                                                                                                |

Decision records (un-numbered, live here instead of `docs/adrs/` — see the repo CLAUDE.md
carve-out):

| File                      | Decision                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture.md`         | Why the pipeline is an in-repo folder, not a workspace or separate repo (ex ADR-0053).                                                                                        |
| `asset-naming.md`         | Uniform dot-separated variant suffixes — `{name}.{variant}.webp` (ex ADR-0054).                                                                                               |
| `fill-vocabulary.md`      | The magic-brush reveal assets are "fills", not "twins" (ex ADR-0055).                                                                                                         |
| `pen-chalk-fork.md`       | Fork the line art per theme — pen outline (light) + Gemini-authored chalk (dark) (ex ADR-0056).                                                                               |
| `chalk-edge-crisping.md`  | Crisp the chalk's edges at render time, not in the punch or the app compositor.                                                                                               |
| `inpainted-fill-punch.md` | Punch by inpainting — shipped fills stay opaque, outline pixels replaced by bled fill color.                                                                                  |
| `fresh-outline-regen.md`  | Redraw a problem pen outline from scratch instead of editing it.                                                                                                              |
| `gemini-3.1-migration.md` | Run record of the 2026-07 full-catalog regeneration on `gemini-3.1-flash-image`.                                                                                              |
| `gate-redundancy.md`      | The fixtures×gates load-bearing matrix — which quality gates are independent, the one overlap, and the classes no gate catches. Enforced by `tests/gate-redundancy.test.mjs`. |

## Key rules when working in this folder

* **Not a workspace, not separately installed.** Deps (`sharp`, `@google/genai`) live in the
  repo-root `package.json` so the root `node_modules` stays flat for `cap sync` + `patch-package`
  (ADR-0029). Never add a `dependencies` block here or `npm install` in this folder — binaries
  resolve upward from the root tree.
* **Paths go through `lib/paths.mjs`.** Use its exported constants (`REPO_ROOT`, `COLORING_DIR`,
  `STYLES_DIR`, `FILL_SRC_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`) — don't hardcode `../../..` walks
  or import from the repo-root `scripts/lib/`.
* **Raw fills are the source of truth; shipped fills are derived.** The lined colored fills live in
  `fill-src/` (committed, never shipped); the shipped `web/static/coloring/**/*.{light,night}.webp`
  are their fills-only punch (`bin/punch-fill-outlines.mjs`, root: `npm run gen:coloring-punch` —
  offline, deterministic). Never hand-edit a shipped fill, and after changing any raw, re-punch it.
  The drift audit scores the raws.
* **Line work is forked per theme (the pen/chalk split — see `docs/pipeline.md`).** The PEN outline
  (`{page}.outline.webp`, black ink on white) drives light mode and every derivation; the CHALK
  outline (`{page}.chalk.webp`, `bin/gen-coloring-chalk.mjs`) is the dedicated dark-mode line art
  with deliberate solid whites (eye sclera, catchlights), **stored ink-on-white** — negate it before
  showing it to Gemini or a human as "dark mode art". Night fills condition on the chalk and punch
  against it; after changing a chalk, regenerate the page's night fill and re-punch.
* **The only sanctioned imports from `web/src`** are the four modules listed in `docs/README.md`
  (styles, prompt, geminiSafety, books) — the app's single source of truth for
  prompts/safety/catalog. Don't reach into anything else under `web/src`.
* **Cross-platform (ADR-0017):** plain Node `.mjs`, no bash-isms, forward-slash glob patterns with a
  resolved `cwd` (not `join`-built patterns).
* **Ad-hoc analysis scripts go inside this folder, not the session scratchpad.** A throwaway `.mjs`
  that imports `sharp` or `lib/*.mjs` cannot run from `/tmp/...`: Node's ESM loader resolves
  `node_modules` upward from the **script file's** directory — cwd doesn't matter, and `NODE_PATH`
  is ignored by `import` (same root cause the `run-splotch` skill documents for Playwright scripts).
  Drop it in the gitignored `tools/asset-gen/.coloring-samples/` (in the tree, so bare `sharp` and
  relative `../lib/*.mjs` imports resolve; ignored, so it doesn't dirty the tree) and delete it when
  done. Escape hatch when moving the file isn't worth it: import by absolute path —
  `import sharp from '<repo>/node_modules/sharp/dist/index.cjs'` — and likewise absolute paths for
  each `lib/*.mjs`.
* **sharp alpha gotcha:** never `joinChannel` an alpha plane and encode — sharp tags the 4th band as
  a generic extra channel, not alpha, so the webp/png encoder *silently* flattens it (output decodes
  `channels: 3, hasAlpha: false`, no error). Interleave an explicit RGBA buffer and construct
  `sharp(rgba, { raw: { width,
  height, channels: 4 } })` instead, and verify outputs with
  `sharp(out).metadata()` → `hasAlpha: true`. (No current asset ships alpha — the punch inpaints
  instead of cutting holes, `docs/inpainted-fill-punch.md` — this trap applies to any future
  alpha-carrying asset.)
* **Outputs are committed artifacts**, reviewed by a human before shipping. The generators write
  shipped art into `web/static/` and review scratch into the gitignored `.coloring-samples*/`. Never
  commit the scratch dirs.
* **`golden/` holds the committed regression fixtures — keep them in sync with the assets.** After
  any pipeline or asset change, run `npm run gen:coloring-golden:diff` (offline, ~1 min; exit 1 = a
  page regressed) and, when the change is intentional, adopt it with
  `npm run gen:coloring-golden:freeze` + `npm run gen:assets:manifest` in the same commit — CI's
  `check:assets:manifest` fails on any asset byte that drifted from `golden/asset-manifest.sha256`.
  The pair is deliberate: the golden scores catch quality drift, the sha256 manifest catches byte
  swaps between score-identical renders (and enforces that a night-only pass never touches
  light-side bytes).
* **Per-page generator levers live in the `fill-src/<cat>/notes.json` registry** (schema in
  `lib/page-notes.mjs`): the night, chalk, and normalize generators auto-apply a page's registry
  `flags` (an explicit CLI flag always wins) and print `retry`/`review`/`why`/`motifs`; `--dry-run`
  previews the resolution offline. When you discover a lever a page needs — a `--notes` string, a
  temperature, a gate override, a review expectation — record it in the registry **in the same
  commit that ships the asset**, with a `why` naming the provenance so it can be pruned later.
* **`docs/ISSUES.md` is the living list of known defects, gate blind spots, and tooling gaps.** Read
  it before regenerating a page or overriding a gate (several failure classes are gate-blind and
  only caught by composite review); when you fix or discover an issue, update it in the same task.
* **Manual/on-demand only** — the Gemini generators need `GEMINI_API_KEY` and are never run in CI
  (real API cost). The app never runs any of this at build time.
* **The contact sheet is the single fill-review surface — read `docs/contact-sheet.md` before
  modifying `bin/gen-contact-sheet.mjs` or anything under `contact-sheet-assets/`.** It holds the
  CLI contract, the layer/compositing model, and the size constraints.
* **Always rebuild the contact sheet when you touch an asset.** Any time you generate, retouch,
  regenerate, or ship a coloring fill, re-run `bin/gen-contact-sheet.mjs` (root:
  `npm run gen:contact-sheet -- <category>`) for the affected category — **one category per sheet**
  (`all` is rejected: the Artifact tool caps uploads at 16 MB and a whole-catalog sheet exceeds it).
  The default `--source shipped` rebuilds from committed assets only (no key/network, ~3s). Then
  **publish the resulting HTML with the Artifact tool** so the change is visible in the session —
  the sheet is self-contained (images inlined as base64), so it renders in the sandbox; do NOT
  hand-composite a PNG. Judge on the **Combined** view.
* **Retired techniques and failed approaches live in `legacy/`** (the canonical-eye era's
  `night-fills.md` runbook and `retouch-line-art.mjs`, plus the history chronicle in
  `legacy/README.md`). Nothing in there is part of the current pipeline — `docs/pipeline.md` is the
  live runbook; borrow from legacy, don't follow it.
* **`ideas-exploration/` is the frozen 2026-07 empirical burn-down of `docs/IDEAS.md`** — one
  report, evidence set, and (mostly) re-appliable patch per idea, plus a self-contained review
  dashboard (`ideas-review.html`). Read its README before working any IDEAS.md item: 24 of 25 ideas
  were validated there, and several carry finished patches/assets waiting to be promoted. Like
  `legacy/`, nothing in it is live pipeline code.
