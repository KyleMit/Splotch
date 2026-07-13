# asset-gen — Splotch asset-generation pipeline

The AI (`@google/genai`) and image-processing (`sharp`) tooling that **produces** Splotch's
committed art: AI style covers, the light/dark coloring-page fills, picker thumbnails, and
format/line-art utilities. It lives in its own folder so you can iterate on it in a small footprint
— the app never runs any of this at build time; it just reads the committed outputs from
`web/static/`.

Architecture and the "why a folder, not a workspace/repo" decision:
**[`architecture.md`](architecture.md)**.

Layout: the runnable entry points live in `bin/`, shared helpers in `lib/`, the committed regression
fixtures (`golden-scores.json`, `asset-manifest.sha256`) in `golden/`, and every doc — this runbook,
`pipeline.md`, `contact-sheet.md`, `ISSUES.md`, `IDEAS.md`, and the decision records — in `docs/`
(paths in prose below are relative to the `tools/asset-gen/` folder root).

## Where it sits in the repo

This is a self-contained project, **not** an npm workspace and **not** separately installed. Its
dependencies (`sharp`, `@google/genai`) live in the **repo-root** `package.json` so the root
`node_modules` stays flat for `cap sync` + `patch-package` (ADR-0029). Node resolves those binaries
by walking up from here into the root `node_modules`, so there is nothing to install in this folder
— **do not run `npm install` here.**

Path/tree resolution is centralized in `lib/paths.mjs` (`REPO_ROOT`, `COLORING_DIR`, `STYLES_DIR`,
`FILL_SRC_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`) so the scripts never hardcode `../../..` walks or
reach back into the repo-root `scripts/lib/`.

### Raw fills vs shipped fills

`fill-src/{book}/{page}-{orient}.{light,night}.raw.webp` (committed, in this folder, never shipped)
holds the colored fills **with their outlines intact** — the raw model output. The shipped
`web/static/coloring/**/*.{light,night}.webp` are the fills-only **punch** of those raws:
`bin/punch-fill-outlines.mjs` masks each raw's own outline pixels out using the page's line art,
because the app's overlay `<img>` already draws the line art on top and revealing the fill's copy
would double every line (ADR-0043 "reveal fills only"). The punch is deterministic, offline `sharp`
— no key, no network — so the shipped fills are always a pure, reproducible derivation of the raws.
Edit or regenerate a raw, then re-punch; never hand-edit a shipped fill.

### The one coupling to the app

The AI generators reuse the app's single source of truth rather than duplicating
prompts/safety/catalog. This is the **entire** sanctioned import surface from `web/src` — keep it to
these four modules (ADR-0047 keeps `geminiSafety.ts` dependency-free precisely so this stays clean):

| Import                                  | Used by                |
| --------------------------------------- | ---------------------- |
| `web/src/lib/ai/styles.ts`              | `gen-style-covers`     |
| `web/src/lib/ai/prompt.ts`              | `gen-style-covers`     |
| `web/src/lib/server/ai/geminiSafety.ts` | every Gemini generator |
| `web/src/lib/state/books.ts`            | `gen-contact-sheet`    |

## Running

From the **repo root** (the discoverable entry points — ADR-0019):

```bash
npm run gen:style-covers        # AI style thumbnails  -> web/static/styles/
npm run gen:coloring-chalk      # chalk outlines (dark-mode line art) -> web/static/coloring/**/*.chalk.webp
npm run gen:coloring-outlines:fresh # brand-new pen outline from a text scene (same subject, new drawing)
npm run gen:coloring-fills      # light colored fills  -> web/static/coloring/**/*.light.webp
npm run gen:coloring-fills:audit # drift-check the raw fills in fill-src/ (no key/network)
npm run gen:coloring-fills:audit:shapes # invented colored shapes on the open background of the raws (no key/network)
npm run gen:coloring-fills:audit:halo # rank shipped night fills by residual dark halo after the punch (no key/network)
npm run gen:coloring-punch      # re-punch the shipped fills from fill-src/ raws (no key/network)
npm run gen:coloring-thumbs     # picker thumbnails (pen + chalk) -> web/static/coloring/**/*.{thumb,chalk.thumb}.webp
npm run gen:coloring-golden:diff # re-score the catalog vs the frozen golden/golden-scores.json (no key/network, ~1 min)
npm run gen:coloring-golden:freeze # adopt the current catalog scores as the new golden baseline
npm run gen:assets:manifest     # re-hash the committed art -> golden/asset-manifest.sha256 (CI drift guard)
npm run gen:contact-sheet -- nature # HTML contact sheet of ONE category (gitignored) — publish as an Artifact
```

**Whenever you touch an asset — generate, retouch, regenerate, or ship a fill — rebuild the contact
sheet for the affected page/category and publish it with the Artifact tool** so the change is
visible in the session (see "Viewing a review sheet" below).

### The per-page notes registry

Known per-page levers (`--notes` text, temperature, gate overrides) live in
`fill-src/<cat>/notes.json` and **auto-load** in the night, chalk, and normalize generators
(`lib/page-notes.mjs` documents the schema): registry `flags` fill in whatever the CLI left unset —
**an explicit CLI flag always wins** — and every applied value is printed with its source; `retry`
recipes, `review` expectations, and sibling-`motifs` facts are printed, never applied. `--dry-run`
on those three generators previews a page's resolved levers with no key and no API call. When a page
needs a new lever, record it in the registry in the same commit that ships the asset. Full
description: [`pipeline.md`](./pipeline.md).

### Fill outline drift & the audit

A colored fill must register on its line art pixel-for-pixel — the magic brush (ADR-0043) reveals
the fill's fills under the overlay's lines, so a drifted region shows the wrong colour outside the
lines. `gen-coloring-fills` scores every candidate two ways (`lib/outline-match.mjs`): global
outline coverage (`keep`) and the **worst grid tile** (`localKeep`). The local bar is the important
one — a large aligned subject can hold a 93% global keep while one small feature (a flower) sits at
34%, which is exactly how `nature/ant-wide` shipped drifted. `alignToSource` only corrects a single
global nudge, so a self-drifted feature can't be aligned away; a failing candidate is retried, and
if none pass, regenerate.

`gen:coloring-fills:audit` runs the same scoring over the **committed raw fills** in `fill-src/` (it
reads committed assets only — no key, no network) and prints the pages that fail, with a
ready-to-run regenerate command. It scores the raws rather than the shipped fills because the
shipped ones are punched fills-only (no outlines left to register); a clean raw guarantees a clean
punch. `--overlay` dumps a drift map per failing page (red = source outline the fill left uncovered)
to `.coloring-samples/drift/`.

### The committed regression fixtures (`golden/`)

Two fixtures freeze the current catalog's state so a change can prove it didn't degrade anything
else (both offline, no key):

* **`golden/golden-scores.json`** — every offline audit score per page (outline solidity/eye rings,
  light keep/localKeep + eyes, night drift/bgLuma/lineWhite + eyes), written by
  `gen:coloring-golden:freeze`. `gen:coloring-golden:diff` re-scores (~1 min) and exits non-zero on
  any verdict flip or bad-direction movement — run it after any pipeline or asset change, and
  re-freeze to adopt intended changes.
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
npm run coloring-fills-dark -- space --max-attempts 4   # not exposed as a root gen:* script
npm run contact-sheet -- space --source samples
npm run png-to-webp
```

The Gemini generators need `GEMINI_API_KEY` in the environment and fail fast without it. They are
**manual, on-demand** tools — never run in CI (no key, real API cost).

## Inputs & outputs

* **Inputs** (committed): `web/static/styles/source.svg`, the black-and-white
  `web/static/coloring/**/*-{tall,wide}.outline.webp` PEN outlines (the source of every derivation).
* **Shipped outputs** (committed, read by the app): `*.chalk.webp` chalk outlines (dedicated
  dark-mode line art, stored ink-on-white — see `pipeline.md`), `*.light.webp` / `*.night.webp`
  fills, `*.thumb.webp` / `*.chalk.thumb.webp` thumbnails (light / dark picker tiles),
  `web/static/styles/*.webp` covers.
* **Review scratch** (gitignored): `.coloring-samples/`, `.coloring-samples-dark/`.

Generate → review the scratch → copy the good outputs into `web/static/` → commit.

### Viewing the contact sheet

The contact sheet is the **single review surface** for the coloring fills — self-contained HTML
(images inlined as base64 data URIs), built to render anywhere. Full reference — CLI, the
side-by-side light/night layout, the three views, the outline-% badge, size constraints — lives in
[`contact-sheet.md`](./contact-sheet.md); **read it before modifying `bin/gen-contact-sheet.mjs` or
`contact-sheet-assets/`**. The essentials:

* **Rebuild the sheet every time you touch an asset**, then **publish it with the Artifact tool**
  instead of hand-rolling a headless screenshot — same steps as the pipeline's shipping runbook
  ([`pipeline.md`](./pipeline.md)). Show the URL.
* **One category per sheet** (`gen:contact-sheet -- nature`); `all` is rejected because a
  whole-catalog sheet exceeds the Artifact tool's 16 MB upload cap. For a catalog-wide review, build
  and publish one sheet per category. The default `--source shipped` reads only committed assets, so
  any session rebuilds the identical sheet in seconds with no key or network; `--source samples`
  reviews fresh, uncommitted night-fill takes from `.coloring-samples-dark/` — the human gate before
  committing.
* For a **focused** pass, target a page or cell within the category (`nature/ant`,
  `nature/ant-wide`).
* Every page shows its light and night fills **side by side**, each with an Outline / Color /
  Combined toggle (default Combined — judge there), and the light tile carries the outline-keep %
  badge scored from the `fill-src/` raw.
* If a raw PNG is genuinely needed, **don't launch Chromium directly** — the cloud env's Chromium
  revision drifts from Playwright's pin. Reuse `run-splotch`'s `chromiumExecutablePath()` fallback
  or set `PLAYWRIGHT_CHROMIUM` (`.claude/skills/run-splotch/SKILL.md`, `docs/CLOUD.md`).

## Runbooks

* **The coloring-page pipeline** (pen/chalk outlines → fills → punch, gates, per-category runbook):
  [`pipeline.md`](./pipeline.md). Decision records: the sibling `*.md` files in this `docs/` folder.
  Retired techniques + history: [`legacy/`](../legacy/).
* **Known outstanding issues** (shipped-asset defects, gate blind spots, tooling gaps):
  [`ISSUES.md`](./ISSUES.md) — check it before regenerating a page or trusting a gate on an
  unfamiliar failure class; update it when you fix or find one.
* **AI art prompts** for authoring new source drawings / icons: the repo-root `docs/PROMPTS.md`.

## Not here

Scripts that **drive the live app** (`gen:shots`, `gen:large-image` — Playwright against the running
UI) or that are **build-path codegen** (`gen:icons`, `gen:releases`) stay in the repo-root
`scripts/`. They are app-coupled, not asset producers.
