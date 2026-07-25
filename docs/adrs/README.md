# Architectural Decision Records

This directory records significant architectural decisions made in the Splotch project. Each ADR
documents the context, the decision, and the consequences so future contributors understand *why*
things are the way they are.

ADR numbers and filenames are **immutable** — records are never renumbered, deleted, or rewritten
once superseded. This index is the curated presentation layer on top of that append-only history:
start with the load-bearing decisions, then browse your area. Superseded, rejected, and moved
records live in the [Historical](#historical) section at the bottom. When adding an ADR, slot its
row into the matching section (see the `create-adr` skill).

## Start here

The decisions that shape everything else, in rough order of importance. All are Active.

* **[0001 — SvelteKit Dual-Adapter Strategy (Web + Native)](0001-sveltekit-dual-adapter-strategy.md)**
  — one SvelteKit codebase ships both the Netlify web app (SSR + `/api/*`) and the fully static
  Capacitor native apps; `CAPACITOR=true` at build time is the single web-vs-native signal.
* **[0004 — Imperative Canvas Engine with Callback Interface](0004-imperative-canvas-engine.md)** —
  drawing is driven by an imperative engine outside Svelte reactivity; components talk to it through
  callbacks (amended by [0066](0066-snapshot-undo-reinstated.md),
  [0072](0072-early-engine-boot-adopt-contract.md)).
* **[0066 — Snapshot Undo Reinstated](0066-snapshot-undo-reinstated.md)** — undo is a snapshot stack
  again (paper raster + tiered pre-stroke snapshots), ending the command-replay era (amended by
  [0068](0068-crayon-raster-pass-commit.md), [0069](0069-dirty-rect-patch-snapshots.md)).
* **[0002 — Svelte 5 Runes Over Legacy Stores](0002-svelte-5-runes.md)** — runes everywhere; no
  `writable`/`readable`/`derived` from `svelte/store`.
* **[0024 — Web App in web/ Subdirectory](0024-web-app-subdirectory-for-netlify-watcher.md)** — the
  SvelteKit app lives in `web/` so netlify-cli's file watcher never crawls the large native trees.
* **[0008 — Three-Tier Testing Strategy](0008-three-tier-testing-strategy.md)** — Vitest unit +
  Playwright E2E + Maestro native smoke; the first two are what `npm test` and CI run.
* **[0070 — Netlify Build-Minute Reduction](0070-netlify-build-minute-reduction.md)** — the
  `dependencies`/`devDependencies` split is inverted: `dependencies` = what the Netlify web build
  needs, `devDependencies` = local/CI-only tooling; a misfiled package breaks the deploy while CI
  stays green.
* **[0071 — Design Tokens from One Generated Source](0071-design-token-single-source.md)** — all
  component styling draws from the generated token vocabulary; no raw one-off values.
* **[0058 — Agent Instruction Files Generated from `.ruler/`](0058-ruler-generated-agent-files.md)**
  — every `CLAUDE.md`, `AGENTS.md`, and skill tree is generated; edit `.ruler/**` sources and run
  `npm run ruler:apply`.

## Canvas & drawing

| #                                                          | Title                                                                                   | Status                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0015](0015-capped-dpr-canvas-rendering.md)                | Capped-DPR Canvas Rendering (min(devicePixelRatio, 2))                                  | Active (amended by [0066](0066-snapshot-undo-reinstated.md))                                                                                          |
| [0034](0034-drop-virtual-canvas-rebuild-on-resize.md)      | Drop the Virtual Canvas — Rebuild on Resize from the Baseline + Log                     | Active (amended by [0066](0066-snapshot-undo-reinstated.md))                                                                                          |
| [0038](0038-scribble-guard-cancel-stylus-touch-streams.md) | Cancel Stylus Touch Streams to Stop iPadOS Scribble Swallowing Quick Pen Strokes        | Active                                                                                                                                                |
| [0043](0043-magic-brush-color-sheet-reveal.md)             | Magic Brush Reveals the Coloring Page's Colored Fill via Pattern-Fill Ops               | Active (amended by [0066](0066-snapshot-undo-reinstated.md), [0067](0067-brush-menu-single-brush-axis.md))                                            |
| [0050](0050-locked-paper-view-on-rotation.md)              | Lock the "Paper" on Rotation and Present It Upright Through a Contain-Fit View          | Active (amended by [0066](0066-snapshot-undo-reinstated.md))                                                                                          |
| [0065](0065-crayon-brush-textured-wax.md)                  | Crayon Brush — Textured Wax via Phase-Shifted Paper-Tooth Pattern Ops                   | Active (amended by [0066](0066-snapshot-undo-reinstated.md), [0067](0067-brush-menu-single-brush-axis.md), [0068](0068-crayon-raster-pass-commit.md)) |
| [0067](0067-brush-menu-single-brush-axis.md)               | Brush Types as One Selectable Axis Behind a Brush Menu                                  | Active                                                                                                                                                |
| [0068](0068-crayon-raster-pass-commit.md)                  | Crayon Passes Commit as Live-Captured Rasters — the Fold Blits, It No Longer Re-Renders | Active                                                                                                                                                |
| [0069](0069-dirty-rect-patch-snapshots.md)                 | Undo Snapshots Shrink to Dirty-Rect Patches of the Fold Region                          | Active (amended by [0074](0074-undo-hotpath-patch-capture-optimizations.md))                                                                          |
| [0072](0072-early-engine-boot-adopt-contract.md)           | Early Engine Boot at Module Evaluation — Components Adopt the Running Engine            | Active (amends [0004](0004-imperative-canvas-engine.md))                                                                                              |
| [0074](0074-undo-hotpath-patch-capture-optimizations.md)   | Undo Hot-Path Optimizations — Clustered Patches, Clear Paper Swap, Rect-Limited Repaint | Active (amends [0069](0069-dirty-rect-patch-snapshots.md))                                                                                            |

## UI & theming

| #                                                       | Title                                                                                                             | Status |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| [0026](0026-notch-band-via-safe-area-css.md)            | Notch Band via a Safe-Area CSS Strip, Not Per-Platform Native Status Bars                                         | Active |
| [0039](0039-pwa-install-prompt-ux.md)                   | Friendly PWA Install Prompt — Capture `beforeinstallprompt`, Fall Back to Guided Hints                            | Active |
| [0045](0045-coloring-picker-thumbnails-and-prefetch.md) | Coloring-Picker Thumbnails + Prefetch (Two Resolutions per Page)                                                  | Active |
| [0048](0048-hex-picker-trims-shades-before-hues.md)     | Hex Color Picker Trims Shades Before Hues, Transposing in Landscape                                               | Active |
| [0049](0049-idle-mount-boot-hidden-overlays.md)         | Idle-Mount the Boot-Hidden Overlays (Parent Center on First Open)                                                 | Active |
| [0052](0052-dark-mode-theme-tokens.md)                  | Dark Mode via `data-theme` + CSS Custom-Property Tokens; Dark Paper, White "Chalk" Line Art, Night Coloring Fills | Active |
| [0061](0061-parent-center-section-drill-in.md)          | Parent Center: One Section List, Two Responsive Shells (Drill-In / Sidebar)                                       | Active |
| [0075](0075-no-web-font-preload-on-drawing-route.md)    | Don't Preload the Web Font — the Drawing Route Paints No Text                                                     | Active |
| [0076](0076-scope-toddler-zoom-lock-element-level.md)   | Scope the Toddler Zoom-Lock to Element Level (Drop `user-scalable=no`), Add Scoped Parent-Center Pinch-to-Enlarge | Active |

## Native (Capacitor / Android / iOS)

| #                                                         | Title                                                                                | Status                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [0012](0012-android-build-toolchain.md)                   | Android Build Toolchain Requirements (Node 22 + JDK 21 Temurin)                      | Active (amended by [0062](0062-drop-windows-dev-support.md)) |
| [0013](0013-platform-detection-without-capacitor-core.md) | Platform Detection Without Importing @capacitor/core                                 | Active                                                       |
| [0020](0020-ios-build-toolchain.md)                       | iOS Build Toolchain (Swift Package Manager, xcodebuild Scripts, Automatic Signing)   | Active                                                       |
| [0027](0027-device-lock-detection-plugin.md)              | A Custom `DeviceLock` Capacitor Plugin to Detect Guided Access / App Pinning         | Active                                                       |
| [0028](0028-apple-pencil-eraser-plugin.md)                | A Custom `PencilEraser` Capacitor Plugin for the Apple Pencil Double-Tap             | Active                                                       |
| [0037](0037-photo-save-targets-per-platform.md)           | Photo Save Targets per Platform (Native Gallery, Web Folder Save, Download Fallback) | Active                                                       |

## API & server

| #                                                          | Title                                                                               | Status                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [0006](0006-server-side-ai-generation.md)                  | Server-Side AI Image Generation via Netlify Serverless Function                     | Active                                                                         |
| [0007](0007-cors-csrf-for-native-api-calls.md)             | CORS and CSRF Strategy for Native-to-Web API Calls                                  | Active (amended by [0064](0064-generate-image-raw-body-header-credentials.md)) |
| [0014](0014-in-memory-rate-limiting.md)                    | In-Memory Rate Limiting (Per-Instance Sliding Window)                               | Active                                                                         |
| [0016](0016-admin-console-bearer-api-for-native.md)        | Admin Console via Shared Server Core + Bearer-Session API for Native                | Active                                                                         |
| [0025](0025-netlify-blobs-server-storage.md)               | Netlify Blobs for Server-Side Storage (Eventual Consistency, Env-Seeded Fallback)   | Active                                                                         |
| [0047](0047-provider-agnostic-ai-adapter.md)               | Provider-Agnostic AI Image Adapter (`AiImageProvider` Seam)                         | Active                                                                         |
| [0060](0060-user-feedback-github-issue-endpoint.md)        | In-App Feedback via a Server-Proxied GitHub Issue Endpoint                          | Active                                                                         |
| [0063](0063-netlify-function-timeout-budget.md)            | Size AI Request Deadlines to Netlify's Measured 26s Function Ceiling                | Active                                                                         |
| [0064](0064-generate-image-raw-body-header-credentials.md) | generate-image Takes a Raw Image Body; Credentials in Headers, Not the Query String | Active                                                                         |
| [0073](0073-enforcing-csp-first-party-reporting.md)        | Enforcing CSP with a First-Party Violation Receiver                                 | Active                                                                         |

## Web platform & PWA

| #                                                   | Title                                                                                           | Status                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [0005](0005-dual-layer-storage.md)                  | Dual-Layer Storage (localStorage + Capacitor Preferences)                                       | Active                                                    |
| [0022](0022-pwa-service-worker-strategy.md)         | PWA Service Worker Strategy — vite-plugin-pwa as Manifest Injector with Custom Update Lifecycle | Active (amended: deferred manual registration, issue 462) |
| [0040](0040-per-route-render-modes-and-ssg-home.md) | Per-Route Render Modes — the Home Route Stays Prerendered (SSG), Not Per-Request SSR            | Active                                                    |
| [0042](0042-static-media-cache-invalidation.md)     | Cache Invalidation for Stable-Filename Static Media                                             | Active                                                    |

## Testing & quality

| #                                                       | Title                                                                                                     | Status                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [0009](0009-happy-dom-over-jsdom.md)                    | happy-dom Over jsdom for Vitest Unit Tests                                                                | Active                                                       |
| [0023](0023-redteam-ai-safety-integration-test.md)      | Red-Team Integration Test for AI Image Safety (Manual, Token-Gated, Encrypted Fixtures, Excluded from CI) | Active                                                       |
| [0031](0031-linting-formatting-and-ci-quality-gates.md) | Linting, Formatting, and CI Quality Gates (ESLint + Prettier, critical-only audit)                        | Active                                                       |
| [0032](0032-performance-profiling-harness.md)           | Automated Performance Profiling Harness (build-flag marks + CDP/WebKit capture, web + Android + iOS)      | Active (amended by [0066](0066-snapshot-undo-reinstated.md)) |

## Build & tooling

| #                                                  | Title                                                              | Status                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| [0003](0003-typescript-migration.md)               | Full TypeScript Adoption                                           | Active                                                       |
| [0010](0010-compile-time-build-constants.md)       | Compile-Time Build Constants via Vite Define                       | Active                                                       |
| [0017](0017-cross-platform-node-scripts.md)        | Cross-Platform Node Scripts with Shared Helpers in scripts/lib/    | Active (amended by [0062](0062-drop-windows-dev-support.md)) |
| [0019](0019-npm-script-naming-and-scripts-info.md) | npm Script Naming Conventions + scripts-info Self-Documentation    | Active                                                       |
| [0029](0029-npm-as-package-manager.md)             | npm as the Package Manager                                         | Active                                                       |
| [0030](0030-git-derived-web-version.md)            | Git-Derived Per-Commit Web Version (major.minor.commits-since-tag) | Active                                                       |
| [0044](0044-svg-optimization-audit.md)             | SVG Optimization as a Re-runnable Audit, Not a One-Off Pass        | Active                                                       |
| [0057](0057-dprint-markdown-formatter.md)          | dprint Formats Markdown (Prettier Can't Match House Style)         | Active                                                       |
| [0062](0062-drop-windows-dev-support.md)           | Drop Windows Dev Support (macOS + Linux Only)                      | Active                                                       |

## Agent workflow & docs

| #                                                       | Title                                                                                                         | Status |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| [0018](0018-claude-native-knowledge-tiers.md)           | Project Knowledge in Claude Code-Native Tiers (Skills, Rules, Nested CLAUDE.md)                               | Active |
| [0021](0021-cloud-session-tunneling.md)                 | Tunneling the Dev Server from Claude Code Cloud Sessions (self-hosted chisel reverse tunnel)                  | Active |
| [0046](0046-pr-screenshot-hosting-via-orphan-branch.md) | Host PR Screenshots on a `pr-assets` Orphan Branch                                                            | Active |
| [0059](0059-committed-run-artifacts-github-pages.md)    | Committed Run Artifacts in `/scrapbook`, Published Live via GitHub Pages (amended: renamed from `/artifacts`) | Active |

## Historical

Superseded, rejected, and moved records — kept for the "why we don't do X" history. Supersession
chains stay intact (e.g. the undo saga: 0033 → 0035/0036 →
[0066](0066-snapshot-undo-reinstated.md)).

| #                                                 | Title                                                                                              | Status                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [0011](0011-capacitor-cli-windows-patch.md)       | patch-package for Capacitor CLI Windows gradlew Bug                                                | Superseded by [0062](0062-drop-windows-dev-support.md)                   |
| [0033](0033-command-replay-undo.md)               | Command-Replay Undo (Single Baseline + Stroke Log, replacing the snapshot stack)                   | Superseded by [0066](0066-snapshot-undo-reinstated.md)                   |
| [0035](0035-keyframe-long-commands.md)            | Keyframe Long Commands So Undo Doesn't Replay Thousands of Ops                                     | Superseded by [0066](0066-snapshot-undo-reinstated.md)                   |
| [0036](0036-stroke-simplification-at-commit.md)   | Simplify Stroke Ops at Commit (Ramer–Douglas–Peucker) So Undo Replays Few Segments                 | Superseded by [0066](0066-snapshot-undo-reinstated.md)                   |
| [0041](0041-lock-viewport-zoom-for-toddlers.md)   | Lock Viewport Pinch-Zoom (`user-scalable=no`) for a Toddler Drawing App                            | Superseded by [0076](0076-scope-toddler-zoom-lock-element-level.md)      |
| [0051](0051-desynchronized-canvas-low-latency.md) | `desynchronized` Canvas for Lower Ink Latency — Tried and Rejected                                 | Rejected                                                                 |
| 0053                                              | Asset-Generation Pipeline in `tools/asset-gen/` (In-Repo Folder, Not a Workspace or Separate Repo) | Moved to [asset-gen docs](../../tools/asset-gen/docs/architecture.md)    |
| 0054                                              | Uniform Dot-Separated Variant Suffixes for Coloring Assets (`{name}.{variant}.webp`)               | Moved to [asset-gen docs](../../tools/asset-gen/docs/asset-naming.md)    |
| 0055                                              | The Magic-Brush Reveal Assets Are "Fills", Not "Twins"                                             | Moved to [asset-gen docs](../../tools/asset-gen/docs/fill-vocabulary.md) |
| 0056                                              | Fork the Line Art per Theme — Pen Outline (Light) + Gemini-Authored Chalk Outline (Dark)           | Moved to [asset-gen docs](../../tools/asset-gen/docs/pen-chalk-fork.md)  |
