# asset-gen — Splotch asset-generation pipeline

The AI (`@google/genai`) and image-processing (`sharp`) tooling that **produces** Splotch's
committed art: AI style covers, the light/dark coloring-page fills, picker cover thumbnails, and
format/line-art utilities. It lives in its own folder so you can iterate on it in a small footprint
— the app never runs any of this at build time; it just reads the committed outputs from
`web/static/`.

Architecture and the "why a folder, not a workspace/repo" decision:
**[`architecture.md`](docs/architecture.md)**.

Layout: coloring entry points live in `coloring/`, style-cover generation and its source drawing in
`style-covers/`, crayon-reference tools in `crayon-reference/`, and capability-wide conversion and
manifest entry points at the root. Shared helpers live in `lib/`, committed regression fixtures in
`golden/`, and deeper runbooks and decision records in `docs/`. Paths in prose below are relative to
the `tools/asset-gen/` folder root. The image-quality backlog and known defects/gate gaps live in
GitHub issues (label `area:asset-gen`), not in this folder.

## Where it sits in the repo

This is a self-contained project, **not** an npm workspace and **not** separately installed. Its
dependencies (`sharp`, `@google/genai`) live in the **repo-root** `package.json`, and the root
`node_modules` is kept flat for `cap sync` (ADR-0119). Node resolves those binaries by walking up
from here into the root `node_modules`, so there is nothing to install in this folder — **do not run
an install here.**

Path/tree resolution is centralized in `lib/asset-paths.mjs` (`REPO_ROOT`, `COLORING_DIR`,
`STYLES_DIR`, `FILL_SRC_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`) so the shipping pipeline's scripts
never hardcode `../../..` walks or reach back into the repo-root `tools/lib/`. `crayon-reference/`
is exempt from both — see `CLAUDE.md` for the exemption and the test it turns on.

### Raw fills vs shipped fills

`fill-src/{book}/{page}-{orient}.{light,night}.raw.webp` (committed, in this folder, never shipped)
holds the colored fills **with their outlines intact** — the raw model output. The shipped
`web/static/coloring/**/*.{light,night}.webp` are the fills-only **punch** of those raws:
`coloring/punch-fill-outlines.mjs` masks each raw's own outline pixels out using the page's line
art, because the app's overlay `<img>` already draws the line art on top and revealing the fill's
copy would double every line (ADR-0043 "reveal fills only"). The punch is deterministic, offline
`sharp` — no key, no network — so the shipped fills are always a pure, reproducible derivation of
the raws. Edit or regenerate a raw, then re-punch; never hand-edit a shipped fill.

### The one coupling to the app

The AI generators reuse the app's single source of truth rather than duplicating
prompts/safety/catalog/theme. This is the **entire** sanctioned import surface from `web/src` — keep
it to these five modules (ADR-0047 keeps `geminiSafety.ts` dependency-free precisely so this stays
clean):

| Import                                  | Used by                |
| --------------------------------------- | ---------------------- |
| `web/src/lib/ai/styles.ts`              | `gen-style-covers`     |
| `web/src/lib/ai/prompt.ts`              | `gen-style-covers`     |
| `web/src/lib/theme.ts`                  | `gen-style-covers`     |
| `web/src/lib/server/ai/geminiSafety.ts` | every Gemini generator |
| `web/src/lib/state/books.ts`            | `gen-book-proof-sheet` |

A module on this list must be importable by bare Node under `--experimental-strip-types`, which —
unlike Vite — will not resolve an extensionless specifier. So each one spells its own imports with
an explicit `.ts` (`theme.ts` → `./design/tokens.ts`, `tokens.ts` → `../fonts.ts`) or keeps them
type-only, which strips away entirely.

## Running

From the **repo root** (the discoverable entry points — ADR-0019):

```bash
npm run gen:style-covers        # AI style thumbnails, both themes -> web/static/styles/{style}.{light,dark}.webp
                                #   --theme dark / --style Crayon / --temperature 1.4 to narrow or re-roll
npm run gen:coloring-chalk      # page/cover chalk candidates -> uncommitted dark SVG trace source
npm run gen:coloring-outlines:fresh # brand-new pen candidate -> uncommitted light SVG trace source
npm run gen:coloring-outlines:normalize # normalized pen candidate -> uncommitted light SVG trace source
npm run vectorize:coloring      # plan/trace staged pen or chalk sources -> canonical SVGs
npm run vectorize:coloring:check # verify every canonical SVG against its source/output ledger
npm run vectorize:postprocess:check # verify every canonical SVG is byte-stable and dimensioned
npm run gen:coloring-fills      # light fill candidates -> .coloring-samples/ (--apply to ship)
npm run check:coloring-fill-drift # drift-check the raw fills in fill-src/ (no key/network)
npm run check:coloring-invented-shapes # invented colored shapes on the open background of the raws (no key/network)
npm run check:coloring-night-halo # audit shipped night fills against the candidate halo bar + crop-review signal (no key/network)
npm run gen:coloring-punched-fills      # re-punch the shipped fills from fill-src/ raws (no key/network)
npm run gen:coloring-thumbs     # light/dark cover thumbnails -> web/static/coloring/**/cover*.thumb.webp
npm run gen:coloring-responsive # web srcset tiers from canonical fills/cover thumbs -> web/static/coloring/max-*px/
npm run check:coloring-golden-scores # re-score the catalog vs the frozen golden/golden-scores.json (no key/network, ~1 min)
npm run update:coloring-golden-scores # adopt the current catalog scores as the new golden baseline
npm run gen:assets:manifest     # re-hash the committed art -> golden/asset-manifest.sha256 (CI drift guard)
npm run gen:coloring-book-proof-sheet -- nature # HTML proof sheet of ONE category (gitignored) — publish as an Artifact
```

**Whenever you touch an asset — generate, retouch, regenerate, or ship a fill — rebuild the contact
sheet for the affected page/category and publish it with the Artifact tool** so the change is
visible in the session (see "Viewing a review sheet" below).

### Line-art promotion is a two-stage workflow

The fresh, normalize, and chalk generators always produce a reviewed **raster candidate** first.
Their `--apply` flag stages that candidate as an uncommitted `.source.webp` under
`vectorized/coloring-overlays/` (pen) or `vectorized/coloring-dark-overlays/` (chalk); it does not
replace a canonical asset. Trace and review the staged source before any downstream regeneration:

```bash
# Pen; add --production only after the paid trace is explicitly authorized.
npm run vectorize:coloring -- --match=farm/cat-wide --batch-size=1
npm run vectorize:coloring -- --match=farm/cat-wide --batch-size=1 --production

# Chalk.
npm run vectorize:coloring -- --theme=dark --match=farm/cat-wide --batch-size=1
npm run vectorize:coloring -- --theme=dark --match=farm/cat-wide --batch-size=1 --production

npm run vectorize:coloring:analyze -- --book=farm
npm run vectorize:coloring:analyze -- --theme=dark --book=farm
npm run vectorize:coloring -- --write-ledger
npm run vectorize:coloring -- --theme=dark --write-ledger
npm run vectorize:coloring:check
npm run vectorize:postprocess:check
```

The optimized SVG under `web/static/coloring/` is the canonical line art. A pen SVG change then
invalidates its chalk, light/night fills, and punch; a chalk SVG change invalidates its night fill
and punch. Cover SVGs stop after regenerating their picker thumbnails and responsive derivative.
`npm run build` emits the incremental coloring-pack manifest from `bookPackAssetPaths()`—page pen
and chalk SVGs, including every landscape `-wide` pair, are invariant pack files; cover SVGs remain
authoring masters because packs render the raster cover thumbnails. Web and native packs carry one
400 px lossless selector per page/theme/orientation while the canonical SVG presents the canvas and
drives export. Web distribution adds a 240 px selector candidate for `srcset`; that hosted tier is
not a logical pack file (ADR-0152).

### The per-page notes registry

Known per-page levers (`--notes` text, temperature, gate overrides) live in
`fill-src/<cat>/notes.json` and **auto-load** in the light, night, chalk, and normalize generators
(`lib/page-notes.mjs` documents the schema): registry `flags` fill in whatever the CLI left unset —
**an explicit CLI flag always wins** — and every applied value is printed with its source; `retry`
recipes, `review` expectations, and sibling-`motifs` facts are printed, never applied. `--dry-run`
on those three generators previews a page's resolved levers with no key and no API call. When a page
needs a new lever, record it in the registry in the same commit that ships the asset. Full
description: [`pipeline.md`](docs/pipeline.md).

### Fill outline drift & the audit

A colored fill must register on its line art pixel-for-pixel — the magic brush (ADR-0043) reveals
the fill's fills under the overlay's lines, so a drifted region shows the wrong colour outside the
lines. `gen-light-fills` scores every candidate two ways (`lib/outline-match.mjs`): global outline
coverage (`keep`) and the **worst grid tile** (`localKeep`). It also cross-correlates overlapping
128px edge tiles within ±12px (`lib/local-warp.mjs`). The median tile vector is reported as residual
global shift and subtracted; only a confident tile's remaining displacement is local warp. A weak
split peak must sit away from the search boundary, fall off when sampled past its argmax, and
contain enough edge-direction diversity, so a straight-edge aperture ridge cannot masquerade as
movement. A strong, falling peak at the boundary is still a rejection: its magnitude is clamped to
the 12px search radius and reported as a lower bound instead of disappearing. The local bars are
important — a large aligned subject can hold a 93% global keep while one small feature (a flower)
sits at 34%, which is exactly how `nature/ant-wide` shipped drifted. `alignToSource` only corrects a
single global nudge, so a self-drifted feature can't be aligned away. Every best candidate and
registration overlay lands in `.coloring-samples/` for review. Committed raws and their punched
shipped assets change only with `--apply`, only after every requested page passes all gates;
exhausted gates exit nonzero without partially applying the batch.

`check:coloring-fill-drift` runs the same scoring over both themes' **committed raw fills** in
`fill-src/` (it reads committed assets only — no key, no network) and prints the pages that fail,
with a ready-to-run regenerate command. It scores the raws rather than the shipped fills because the
shipped ones are punched fills-only (no outlines left to register); a clean raw guarantees a clean
punch. Local warp warns at 3px and rejects above 4px by default. Six reviewed raws exceed that
default; their per-page `notes.json` entries preserve the exact measured baseline plus a 0.5px
decoder margin so ordinary regeneration remains possible but a worse candidate cannot pass. New
pages keep 4px, and an explicit `--warp-max` can tighten any run. The offline audit reports reviewed
baselines and stale loose ceilings as non-failing warnings, while an over-ceiling page exits
nonzero. `--overlay` dumps a drift map per failing light page (red = source outline the fill left
uncovered) to `.coloring-samples/drift/`.

### The committed regression fixtures (`golden/`)

Two fixtures freeze the current catalog's state so a change can prove it didn't degrade anything
else (both offline, no key):

* **`golden/golden-scores.json`** — every offline audit score per page (outline solidity/eye
  rings/page frames, chalk regional ink diff, light keep/localKeep + eyes, both themes' local warp +
  residual shift, and night drift/bgLuma/lineWhite + eyes), written by
  `update:coloring-golden-scores`. `check:coloring-golden-scores` re-scores (~1 min) and exits
  non-zero on any verdict flip or bad-direction movement beyond its calibrated noise band. Chalk
  region maxima use the generation baseline's 10% or 8 px tolerance, whichever is larger. Run it
  after any pipeline or asset change, and re-freeze to adopt intended changes.
* **`golden/asset-manifest.sha256`** — one sha256 line per committed art asset (shipped coloring
  pages, style covers, `fill-src/` raws), written by `gen:assets:manifest` and verified in CI by
  `check:assets:manifest`. It turns binary churn into a reviewable text diff and guards the
  night-pass invariant (light bytes untouched).

They close each other's blind spot: the golden set catches score drift the bytes can hide, the
manifest catches byte swaps between score-identical renders.

Or, from **inside this folder**, the local aliases (same flags, resolve the same root
`node_modules`):

```bash
npm run coloring-fills -- farm/dog-wide --samples 3
npm run coloring-night-fills -- space --max-attempts 4  # gated candidates; --rescore is offline, --apply ships
npm run coloring-book-proof-sheet -- space --source samples
npm run convert-png-to-webp
```

The Gemini generators need `GEMINI_API_KEY` in the environment and fail fast without it. They are
**manual, on-demand** tools — never run in CI (no key, real API cost).

## Inputs & outputs

* **Inputs** (committed): `tools/asset-gen/style-covers/source.svg` plus canonical page and cover
  `*.overlay.svg` / `*.dark.overlay.svg` line art.
* **Committed outputs:** canonical page SVG line art, `*.light.webp` / `*.night.webp` fills, cover
  `*.thumb.webp` / `*.chalk.thumb.webp` thumbnails, canonical cover SVG masters used only by the
  pipeline, and `web/static/styles/*.webp` covers. Web-only responsive derivatives live under
  `web/static/coloring/max-{edge}px/`; `build:cap` strips those directories so native keeps one
  canonical runtime width. Page or cover regeneration stages uncommitted `.source.webp` inputs under
  `vectorized/coloring-{,dark-}overlays/` for the paid vector workflow.
* **Review scratch** (gitignored): `.coloring-samples/`, `.coloring-samples-dark/` — at the **repo
  root** (`lib/asset-paths.mjs` `SAMPLES_DIR` / `SAMPLES_DARK_DIR`), not under `tools/asset-gen/`.
  (The gitignore pattern is unanchored, so the `tools/asset-gen/.coloring-samples/` dir used as the
  ad-hoc analysis-script drop spot is also ignored — that's a different directory; generator outputs
  land at the root.)

Generate → review scratch → stage a trace source → vectorize and review → commit the canonical SVG.

### Viewing the coloring-book proof sheet

The coloring-book proof sheet is the **single review surface** for the coloring assets — line art,
chalk, fills, and the composited page — as self-contained HTML (images inlined as base64 data URIs),
built to render anywhere. Full reference — CLI, the side-by-side light/night layout, the three
views, the outline-% badge, size constraints — lives in
[`coloring-book-proof-sheet.md`](docs/coloring-book-proof-sheet.md); **read it before modifying
`coloring/gen-book-proof-sheet.mjs` or `coloring-book-proof-sheet-assets/`**. The essentials:

* **Rebuild the sheet every time you touch an asset**, then **publish it with the Artifact tool**
  instead of hand-rolling a headless screenshot — same steps as the pipeline's shipping runbook
  ([`pipeline.md`](docs/pipeline.md)). Show the URL.
* **One category per sheet** (`gen:coloring-book-proof-sheet -- nature`); `all` is rejected because
  a whole-catalog sheet exceeds the Artifact tool's 16 MB upload cap. For a catalog-wide review,
  build and publish one sheet per category. The default `--source shipped` reads only committed
  assets, so any session rebuilds the identical sheet in seconds with no key or network;
  `--source samples` reviews fresh, uncommitted night-fill takes from `.coloring-samples-dark/` —
  the human gate before committing.
* For a **focused** pass, target a page or cell within the category (`nature/ant`,
  `nature/ant-wide`).
* Every page shows its light and night fills **side by side**, each with an Outline / Color /
  Combined toggle (default Combined — judge there), and the light tile carries the outline-keep %
  badge scored from the `fill-src/` raw.
* If a raw PNG is genuinely needed, **don't launch Chromium directly** — the cloud env's Chromium
  revision drifts from Playwright's pin. Reuse `run-splotch`'s `chromiumExecutablePath()` fallback
  or set `PLAYWRIGHT_CHROMIUM` (`.claude/skills/run-splotch/SKILL.md`, `docs/CLOUD/Claude.md`).

## Runbooks

* **The coloring-page pipeline** (pen/chalk outlines → fills → punch, gates, per-category runbook):
  [`pipeline.md`](docs/pipeline.md). Decision records live beside that runbook in `docs/`. Retired
  techniques + history: [`legacy/`](legacy/).
* **Known outstanding issues** (shipped-asset defects, gate blind spots, tooling gaps): GitHub
  issues labeled
  [`area:asset-gen`](https://github.com/kylemit/splotch/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%3Aasset-gen)
  — check them before regenerating a page or trusting a gate on an unfamiliar failure class; close
  or file one when you fix or find a defect.
* **AI art prompts** for authoring new source drawings / icons: the repo-root `docs/PROMPTS.md`.

## Not here

Scripts that **drive the live app** (`gen:store-assets`, `gen:promotional-image` — Playwright
against the running UI) or that are **build-path codegen** (`gen:icon-names`, `gen:releases`) stay
in the repo-root `tools/`. They are app-coupled, not asset producers.
