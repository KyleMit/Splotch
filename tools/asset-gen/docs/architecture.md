# Asset-Generation Pipeline in `tools/asset-gen/` (In-Repo Folder, Not a Workspace or Separate Repo)

**Decision record** — in force. Originally ADR-0053 in `docs/adrs/`; moved here 2026-07 so the
asset-generation pipeline's decisions live beside the pipeline (the ADR index notes the move).
**Date:** 2026-07

## Context

The AI (`@google/genai`) + image-processing (`sharp`) scripts that **produce** Splotch's committed
art — AI style covers, light/dark coloring-page fills, picker thumbnails, line-art retouching,
format utilities — had grown large and technically distinct from serving the app. They carry bespoke
`sharp` scoring pipelines (outline registration, drift/night/line-color gates), a multi-page runbook
(`night-fills.md`), and their own retry/temperature machinery. Iterating on them meant scrolling
past them in `scripts/`, which mixes them with build-path codegen and app-driving Playwright
scripts.

The goal was **isolation of this code, a dedicated runbook, and fast local iteration** — not a
change to how assets are served. A key existing property made this tractable: **the app never runs
these scripts.** It reads committed `.webp`/`.png` files from `web/static/`; the generators are
manual, on-demand tools whose good outputs are reviewed and checked in. There is no build-time edge
from the app to the pipeline (the only `pre*build` hooks are `gen:icons` / `gen:releases`, which are
TypeScript/JSON codegen, not image generation).

Three placements were considered:

* **Separate repository.** Cleanest footprint, but the app reads the outputs from `web/static/`, so
  a split adds a publish/vendor step to land `.webp`s back in this repo, and the generators reuse
  the app's single source of truth (`ai/styles.ts`, `ai/prompt.ts`, `server/ai/geminiSafety.ts`,
  `state/books.ts`) — which would have to be published as a package or copied (drift risk on
  prompts/safety/catalog, the exact failure ADR-0047 engineered around). Heavy overhead for a
  solo-maintained project.
* **npm workspace.** The obvious "monorepo module" mechanism, but it **fights ADR-0029's
  load-bearing invariant**: `cap sync` and `patch-package` read plugin code out of a **flat**
  `node_modules`. npm workspaces add a symlinked package entry (`node_modules/@splotch/asset-gen`)
  and, on any dependency version divergence, nest deps under the member's own `node_modules` — the
  precise non-flat layout Capacitor is documented to break on. Gratuitous risk on the native path
  for zero benefit a plain folder doesn't already provide. (ADR-0029 also records that Splotch
  deliberately runs with **no workspaces**.)
* **Plain in-repo folder, dependencies staying in the root `package.json`.** Leaves `node_modules`
  byte-for-byte unchanged — so ADR-0029, ADR-0011's `postinstall`, `cap sync`, and `patch-package`
  are entirely untouched — while giving the pipeline its own directory, runbook, path helper, and
  scoped guidance.

## Decision

The pipeline lives in **`tools/asset-gen/`**, a plain folder at the repo root (outside `web/` so it
stays off the Netlify dev watcher, ADR-0024). Its dependencies (`sharp`, `@google/genai`) **remain
in the repo-root `package.json`**; Node resolves them by walking up into the flat root
`node_modules`. It is **not** an npm workspace and is **not** separately installed — `node_modules`
layout is unchanged.

What moved: `gen-style-covers`, `gen-coloring-fills`, `gen-coloring-fills-dark`, `retouch-line-art`,
`gen-coloring-thumbs`, `gen-coloring-sheet` (since retired — its review role folded into the
coloring-book proof sheet), `gen-coloring-book-proof-sheet`, `png-to-webp`, `lib/pixelate.mjs`
(since retired along with the Pixel style it served), and the `night-fills.md` runbook.

What stayed in `scripts/`: build-path codegen (`gen:icons`, `gen:releases`) and the app-driving
Playwright generators (`gen:shots`/`store-shots.mjs`, `gen:large-image`) — those drive the live app
and are effectively integration tests, not asset producers.

Structure:

* `tools/asset-gen/lib/paths.mjs` centralizes repo-root + tree resolution (`REPO_ROOT`,
  `COLORING_DIR`, `STYLES_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`), so scripts don't hardcode
  `../../..` walks or import from `scripts/lib/`.
* Entry-point scripts in `bin/`, docs (the `README.md` runbook, `pipeline.md`, the decision records)
  in `docs/`, plus `CLAUDE.md` (scoped rules) at the folder root.
* A **dependency-free** `package.json` (`@splotch/asset-gen`, `private`) whose `scripts` block gives
  local aliases (`npm run coloring-fills` from inside the folder) for fast iteration — with no
  `dependencies`, so it never implies a second install and root `npm install` ignores it (not a
  workspace).
* The root `gen:*` scripts stay the discoverable entry points (ADR-0019); they just point at
  `tools/asset-gen/…`.

**The shared-module contract.** The generators import exactly four modules from `web/src` —
`ai/styles.ts`, `ai/prompt.ts`, `server/ai/geminiSafety.ts`, `state/books.ts` — the app's single
source of truth for styles/prompts/safety/ catalog. That set is the entire sanctioned import surface
(documented in `tools/asset-gen/CLAUDE.md`); the pipeline reaches into nothing else under `web/src`.

## Consequences

* \+ Full isolation of the pipeline **code + runbook**, with a dedicated path helper and scoped
  `CLAUDE.md` — the iterate-in-a-small-footprint goal.
* \+ **`node_modules` is unchanged**, so ADR-0029's flat-tree invariant, ADR-0011's `postinstall`,
  `cap sync`, and `patch-package` keep working with zero new configuration. The app build path never
  touches the folder.
* \+ Makes explicit what was already true: the app **consumes committed assets**; the pipeline is a
  producer that writes into `web/static/`.
* \+ `git` tracked every move as a rename (history preserved).
* − Dependencies are **not physically isolated** — `sharp`/`@google/genai` sit in the root manifest,
  not a per-pipeline one. Acceptable: they install into the same flat tree regardless, and the
  isolation that mattered was code, not the dependency list.
* − The four-module coupling to `web/src` remains (by design — it's the app's source of truth). It's
  now a documented contract rather than an implicit reach.
* Escalation path if this ever becomes tight: promote to a **nested, independently installed**
  `tools/asset-gen/` (its own `package.json` + lock, still not a workspace, its `node_modules` never
  on Capacitor's resolution path), then to a **separate repo** — warranted only when the pipeline
  needs an independent release cadence, deps the app shouldn't ship, or to run without an app
  checkout.
