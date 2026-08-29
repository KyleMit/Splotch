# Page-inventory tooling

This capability captures Splotch's responsive UI, runs one isolated image review per capture,
finalizes the manifest-bound checkpoints, and attaches the resulting critique to the scrapbook
report. The capture manifest is the coverage authority; critique totals never substitute for it.

## Entry points

| Entry point                   | Public command                             | Purpose                                          |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `capture-page-inventory.mjs`  | `npm run capture:page-inventory`           | Capture the complete inventory or a slice        |
| `run-inventory-critiques.mjs` | `npm run review:page-inventory`            | Run isolated image-only Codex reviews            |
| `finalize-page-critique.mjs`  | `npm run finalize:page-inventory-critique` | Validate and merge review checkpoints            |
| `attach-page-feedback.mjs`    | `npm run attach:page-inventory-feedback`   | Rebuild the report with current feedback         |
| `verify-design-snapshots.mjs` | `npm run verify:design-snapshots`          | Prove each design snapshot matches its capture   |
| `port-design-edits.mjs`       | `npm run port:design-edits`                | Turn an edited snapshot back into source changes |

The verb-first command names intentionally spread this workflow across `capture:`, `review:`,
`finalize:`, and `attach:` namespaces so each command states the action it performs. Run them in the
order shown above.

## Capture

The capture command needs installed project dependencies and Playwright Chromium. It builds the
production app, starts a local preview on port 4319 by default, and captures every declared surface
at the canonical light/night viewport matrix. It does not call an external service.

```sh
npm run capture:page-inventory
```

A full run atomically replaces `scrapbook/page-inventory/` only after every capture passes its
dimensions, visible-content, theme-difference, and duplicate-review guards. It writes the WebP
assets, `capture-manifest.json`, and `index.html`. An existing `design-critique.json` is copied into
the new output, but stale feedback remains detached from the report.

Use repeatable filters for a bounded spot check:

```sh
npm run capture:page-inventory -- --surface controls/brush-menu --viewport iphone-13-mini --theme dark
```

Any `--surface`, `--viewport`, or `--theme` filter switches to spot-check mode. That mode writes
under `.scrapbook-scratch/page-inventory-spot-check/`, records `spot-check-captures.json`, and never
rewrites the keeper manifest or report. `--out` is deliberately restricted to the capability-owned
full or spot-check tree because the selected output directory is replaced wholesale. Use `--port`
when the default host port is occupied; `--critique FILE` applies only to a full capture.

## Design snapshots

Every capture also serializes the live page into a standalone HTML snapshot under
`.scrapbook-scratch/design-snapshots/`, for Claude Design to edit directly instead of rebuilding a
screen from scratch. This is why capture runs against `vite dev` rather than the production preview:
Svelte attaches `__svelte_meta` source locations only under `dev`, and each snapshot stamps every
element with the file and line that rendered it. `web/buildManifests.test.ts` holds the dev server
to serving the same generated manifests the build emits, so the two render the same app.

Snapshots are written only for the viewports in `DESIGN_SNAPSHOT_VIEWPORT_IDS`, not the full review
matrix. The bundle is regenerated wholesale on every run and never committed. The workflow around it
— generating, pushing to a design-system project, and porting edits back — is the
`sync-design-snapshots` skill.

`npm run verify:design-snapshots` re-renders each snapshot and reports the share of pixels it
differs from the WebP it came from. Treat a failure as a serialization bug rather than a tolerance
to raise: each one found so far was a screen that rendered wrong (asset URLs rewritten relative to
the document instead of the stylesheet, canvas pixels read back blank).

Expected bands: 0.1-1% for a non-modal surface, 5-11% for one showing a modal, and the two themes
should agree. A theme-asymmetric result is the signal that something translucent is being composited
wrong — that is exactly how the rebuilt-`::backdrop` defect showed itself, at 4% in dark and 68% in
light.

Rebuild the bundle with `npm run gen:design-snapshots` rather than a full capture: the full run
rewrites the WebP images, and each stored review is bound to the digest of the image it saw.

## Review and finalize

The review command requires a current capture manifest, network access, and an authenticated
`claude` or `codex` installation on `PATH` — `lib/reviewer-runner.mjs` owns that seam and picks
whichever is present, or takes `--runner`. Both get the same isolated-image contract; only delivery
differs, since codex takes `--image` while Claude Code reads a per-review copy staged into the
otherwise empty reviewer root. It starts one fresh image-only process per capture and writes
resumable checkpoints under `.scrapbook-scratch/page-inventory-critique/reviews/`. Existing
checkpoints whose image and review description hashes still match are skipped.

```sh
npm run review:page-inventory -- --limit 4
npm run finalize:page-inventory-critique -- --status
npm run finalize:page-inventory-critique
```

Use `--review-id`, `--concurrency`, `--model`, and `--effort` to bound or tune review work. Reviewer
logs remain under the adjacent `logs/` directory. The finalizer rejects missing, duplicate, unknown,
malformed, or stale checkpoints and writes `scrapbook/page-inventory/design-critique.json`.
`--allow-partial` is limited to an explicit scratch `--out`; a partial critique cannot become the
published keeper.

## Attach feedback

Attach feedback without recapturing images:

```sh
npm run attach:page-inventory-feedback
npm run scrapbook:check
```

The attach command verifies that the manifest covers the current surface inventory, every image is
present, every SHA-256 still matches, and the critique is complete before rewriting only
`scrapbook/page-inventory/index.html`. Pass `--critique FILE` to use a non-default complete
critique.

## Failure behavior and maintenance

Invalid flags, unavailable prerequisites, capture failures, reviewer failures, and stale or
incomplete review data produce diagnostics and a nonzero exit. Capture output is staged beside its
destination and swapped only on success, so a failed capture keeps the previous inventory intact.
Review failures keep completed checkpoints and logs so the same command can resume them.

`lib/reviewer-runner.mjs` owns the reviewer runner seam, `lib/design-snapshot.mjs` owns snapshot
serialization and the design bundle, `lib/design-port-back.mjs` owns the stylesheet diff and
scope-to-source resolution, `lib/page-inventory-capture.mjs` owns image validation,
`lib/page-inventory-data.mjs` owns manifest/checkpoint contracts,
`lib/page-inventory-design-notes.mjs` owns reviewer-visible design intent, and
`lib/page-inventory-report.mjs` owns viewport metadata and HTML rendering. Keep public flags, output
paths, review IDs, hashes, and checkpoint schemas stable when maintaining the entry points.

Run focused verification with:

```sh
npm run test:tools -- tools/page-inventory/tests/page-inventory.test.mjs tools/page-inventory/tests/design-snapshot.test.mjs tools/perf/tests/xcuitest-actions.test.mjs
```
