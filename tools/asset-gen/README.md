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
`COLORING_DIR`, `STYLES_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`) so the scripts
never hardcode `../../..` walks or reach back into `scripts/lib/`.

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
| `web/src/lib/state/books.ts` | `night-twins-gallery` |

## Running

From the **repo root** (the discoverable entry points — ADR-0019):

```bash
npm run gen:style-covers        # AI style thumbnails  -> web/static/styles/
npm run gen:coloring-fills      # light colored twins  -> web/static/coloring/**/*.color.webp
npm run gen:coloring-thumbs     # picker thumbnails     -> web/static/coloring/**/*-thumb.webp
npm run gen:coloring-sheet      # light-twin review sheet (gitignored)
```

Or, from **inside this folder**, the local aliases (same flags, resolve the same
root `node_modules`):

```bash
npm run coloring-fills -- farm/dog-wide --samples 3
npm run coloring-fills-dark -- space --max-attempts 4   # not exposed as a root gen:* script
npm run night-twins-gallery -- space --source samples
npm run retouch-line-art -- creatures/mermaid-tall
npm run png-to-webp
```

The Gemini generators need `GEMINI_API_KEY` in the environment and fail fast
without it. They are **manual, on-demand** tools — never run in CI (no key, real
API cost).

## Inputs & outputs

- **Inputs** (committed): `web/static/styles/source.svg`, the black-and-white
  `web/static/coloring/**/*-{tall,wide}.webp` line-art pages.
- **Shipped outputs** (committed, read by the app): `*.color.webp` / `*.night.webp`
  twins, `*-thumb.webp` thumbnails, `web/static/styles/*.webp` covers.
- **Review scratch** (gitignored): `.coloring-samples/`, `.coloring-samples-dark/`.

Generate → review the scratch → copy the good outputs into `web/static/` → commit.

## Runbooks

- **Dark-mode night twins** (generate → review → ship → wire): [`night-twins.md`](./night-twins.md).
- **AI art prompts** for authoring new source drawings / icons: `docs/PROMPTS.md`.

## Not here

Scripts that **drive the live app** (`gen:shots`, `gen:large-image` — Playwright
against the running UI) or that are **build-path codegen** (`gen:icons`,
`gen:releases`) stay in `scripts/`. They are app-coupled, not asset producers.
