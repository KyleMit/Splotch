# asset-gen — Splotch asset-generation pipeline

The AI (`@google/genai`) and image-processing (`sharp`) tooling that **produces**
Splotch's committed art: AI style covers, the light/dark coloring-page twins,
picker thumbnails, and format/line-art utilities. It lives in its own folder so
you can iterate on it in a small footprint — the app never runs any of this at
build time; it just reads the committed outputs from `web/static/`.

Architecture and the "why a folder, not a workspace/repo" decision: **ADR-0053**.

## Where it sits in the repo

This is a self-contained project, **not** an npm workspace and **not** separately
installed. Its dependencies (`sharp`, `@google/genai`) live in the **repo-root**
`package.json` so the root `node_modules` stays flat for `cap sync` +
`patch-package` (ADR-0029). Node resolves those binaries by walking up from here
into the root `node_modules`, so there is nothing to install in this folder —
**do not run `npm install` here.**

Path/tree resolution is centralized in `lib/paths.mjs` (`REPO_ROOT`,
`COLORING_DIR`, `STYLES_DIR`, `TWIN_SRC_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`)
so the scripts never hardcode `../../..` walks or reach back into `scripts/lib/`.

### Raw twins vs shipped twins

`twin-src/{book}/{page}-{orient}.{light,night}.raw.webp` (committed, in this
folder, never shipped) holds the colored twins **with their outlines intact** —
the raw model output. The shipped `web/static/coloring/**/*.{light,night}.webp`
are the fills-only **punch** of those raws: `punch-twin-outlines.mjs` masks each
raw's own outline pixels out using the page's line art, because the app's overlay
`<img>` already draws the line art on top and revealing the twin's copy would
double every line (ADR-0043 "reveal fills only"). The punch is deterministic,
offline `sharp` — no key, no network — so the shipped twins are always a pure,
reproducible derivation of the raws. Edit or regenerate a raw, then re-punch;
never hand-edit a shipped twin.

### The one coupling to the app

The AI generators reuse the app's single source of truth rather than duplicating
prompts/safety/catalog. This is the **entire** sanctioned import surface from
`web/src` — keep it to these four modules (ADR-0047 keeps `geminiSafety.ts`
dependency-free precisely so this stays clean):

| Import | Used by |
| --- | --- |
| `web/src/lib/ai/styles.ts` | `gen-style-covers` |
| `web/src/lib/ai/prompt.ts` | `gen-style-covers` |
| `web/src/lib/server/ai/geminiSafety.ts` | every Gemini generator |
| `web/src/lib/state/books.ts` | `gen-contact-sheet` |

## Running

From the **repo root** (the discoverable entry points — ADR-0019):

```bash
npm run gen:style-covers        # AI style thumbnails  -> web/static/styles/
npm run gen:coloring-fills      # light colored twins  -> web/static/coloring/**/*.light.webp
npm run gen:coloring-fills:audit # drift-check the raw twins in twin-src/ (no key/network)
npm run gen:coloring-punch      # re-derive shipped fills-only twins from twin-src/ raws (no key/network)
npm run gen:coloring-thumbs     # picker thumbnails     -> web/static/coloring/**/*.thumb.webp
npm run gen:coloring-sheet      # light-twin review sheet (gitignored)
npm run gen:contact-sheet -- all # HTML contact sheet of every twin (gitignored) — publish as an Artifact
```

**Whenever you touch an asset — generate, retouch, regenerate, or ship a
twin — rebuild the contact sheet for the affected page/category and publish it
with the Artifact tool** so the change is visible in the session (see "Viewing a
review sheet" below).

### Twin outline drift & the audit

A colored twin must register on its line art pixel-for-pixel — the magic brush
(ADR-0043) reveals the twin's fills under the overlay's lines, so a drifted region
shows the wrong colour outside the lines. `gen-coloring-fills` scores every
candidate two ways (`lib/outline-match.mjs`): global outline coverage (`keep`) and
the **worst grid tile** (`localKeep`). The local bar is the important one — a large
aligned subject can hold a 93% global keep while one small feature (a flower) sits
at 34%, which is exactly how `nature/ant-wide` shipped drifted. `alignToSource`
only corrects a single global nudge, so a self-drifted feature can't be aligned
away; a failing candidate is retried, and if none pass, regenerate.

`gen:coloring-fills:audit` runs the same scoring over the **committed raw twins**
in `twin-src/` (it reads committed assets only — no key, no network) and prints
the pages that fail, with a ready-to-run regenerate command. It scores the raws
rather than the shipped twins because the shipped ones are punched fills-only
(no outlines left to register); a clean raw guarantees a clean punch. `--overlay`
dumps a drift map per failing page (red = source outline the twin left uncovered)
to `.coloring-samples/drift/`.

Or, from **inside this folder**, the local aliases (same flags, resolve the same
root `node_modules`):

```bash
npm run coloring-fills -- farm/dog-wide --samples 3
npm run coloring-fills-dark -- space --max-attempts 4   # not exposed as a root gen:* script
npm run contact-sheet -- space --source samples
npm run retouch-line-art -- creatures/mermaid-tall
npm run png-to-webp
```

The Gemini generators need `GEMINI_API_KEY` in the environment and fail fast
without it. They are **manual, on-demand** tools — never run in CI (no key, real
API cost).

## Inputs & outputs

- **Inputs** (committed): `web/static/styles/source.svg`, the black-and-white
  `web/static/coloring/**/*-{tall,wide}.outline.webp` line-art pages.
- **Shipped outputs** (committed, read by the app): `*.light.webp` / `*.night.webp`
  twins, `*.thumb.webp` thumbnails, `web/static/styles/*.webp` covers.
- **Review scratch** (gitignored): `.coloring-samples/`, `.coloring-samples-dark/`.

Generate → review the scratch → copy the good outputs into `web/static/` → commit.

### Viewing a review sheet

Both sheets — the light-twin `gen:coloring-sheet` output and the
`gen-contact-sheet.mjs` contact sheet — are **self-contained HTML** (images inlined
as base64 data URIs), built to render anywhere:

- **Rebuild the contact sheet every time you touch an asset**, then **publish the
  sheet with the Artifact tool** instead of hand-rolling a headless screenshot —
  same steps as the night-twins runbook
  ([`night-twins.md`](./night-twins.md#per-category-workflow)). Show the URL.
- For a **whole-catalog** pass (e.g. a cross-session review of everything
  shipped), the `all` target expands to every book —
  `gen:contact-sheet -- all --source shipped` — so you needn't enumerate the
  eight categories. It reads only committed assets, so any session rebuilds the
  identical sheet in a couple of seconds with no key or network. **But the
  Artifact tool caps uploads at 16 MB and the `all` sheet exceeds that** (~29 MB
  today, and it grows as more twins ship — the generator warns when the file is
  over the cap). To publish a catalog-wide review, build and publish it
  **per-category** (or 2–3 categories per sheet, e.g.
  `gen:contact-sheet -- nature farm creatures --source shipped`) so each Artifact
  stays under 16 MB. Use `all` only to eyeball the sheet locally.
- For a **focused** pass, `gen-contact-sheet.mjs` takes page/cell targets
  (`nature/ant`, `nature/ant-wide`) and `--theme light` to open the light-twin
  (magic-brush) view — not just a whole dark category.
- **To change how the sheet looks or behaves**, edit the real files under
  `contact-sheet/` — `contact-sheet.css` (styling) and `contact-sheet.client.js`
  (the in-browser render/interaction runtime). `gen-contact-sheet.mjs` only
  assembles the shell and injects the cell data + initial theme as a JSON global
  (`window.__CONTACT_SHEET__`), so those two files carry the design surface with
  full editor highlighting, Prettier, and ESLint.
- If a raw PNG is genuinely needed, **don't launch Chromium directly** — the cloud
  env's Chromium revision drifts from Playwright's pin. Reuse `run-splotch`'s
  `chromiumExecutablePath()` fallback or set `PLAYWRIGHT_CHROMIUM`
  (`.claude/skills/run-splotch/SKILL.md`, `docs/CLOUD.md`).

## Runbooks

- **Dark-mode night twins** (generate → review → ship → wire): [`night-twins.md`](./night-twins.md).
- **AI art prompts** for authoring new source drawings / icons: `docs/PROMPTS.md`.

## Not here

Scripts that **drive the live app** (`gen:shots`, `gen:large-image` — Playwright
against the running UI) or that are **build-path codegen** (`gen:icons`,
`gen:releases`) stay in `scripts/`. They are app-coupled, not asset producers.
