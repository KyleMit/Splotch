# Page-inventory review tooling

This capability reviews the committed responsive UI captures, writes isolated image-review
checkpoints, and finalizes a manifest-bound critique. The manifest is the coverage authority; review
totals never substitute for it. The captures and HTML report preserve the former frontend's
inventory rather than current React Native screenshots.

The live capture and HTML feedback-attachment commands retired with SvelteKit. Existing images,
manifest records, checkpoints, and critique JSON remain usable by the review and finalization tools.

## Entry points

| Entry point                   | Public command                             | Purpose                                              |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `run-inventory-critiques.mjs` | `npm run review:page-inventory`            | Run isolated image-only reviews of recorded captures |
| `finalize-page-critique.mjs`  | `npm run finalize:page-inventory-critique` | Validate and merge review checkpoints                |

## Evidence prerequisites

The default manifest is `scrapbook/page-inventory/capture-manifest.json`. Before reviewing, verify
that each referenced image exists beside that manifest and its bytes match the recorded SHA-256. The
helpers `readCaptureManifest` and `sha256File` in `lib/page-inventory-data.mjs` support that check;
the critique's hash binding must describe the image actually reviewed.

Restore missing recorded evidence from its matching snapshot. A missing or changed capture is not
repaired by running the reviewer, and there is no retained capture command that produces a fresh
React Native inventory. Keep a replacement capture set and its provenance separate from the
preserved set.

## Review and finalize

The review command requires installed dependencies, network access, and an authenticated `claude` or
`codex` installation on `PATH`. `lib/reviewer-runner.mjs` selects the available runner or accepts
`--runner`. Each capture gets one fresh image-only process with exactly its image and standalone
manifest description. Codex receives `--image`; Claude reads a copy staged inside the isolated
reviewer root and removed afterward.

```sh
npm run finalize:page-inventory-critique -- --status
npm run review:page-inventory -- --limit 4
npm run finalize:page-inventory-critique
```

Checkpoints live under `.scrapbook-scratch/page-inventory-critique/reviews/`, with reviewer logs in
the adjacent `logs/` directory. Current checkpoints are skipped on resume. Use `--review-id`,
`--concurrency`, `--runner`, `--model`, and `--effort` to select and bound review work; `--manifest`
and `--work` select a different recorded inventory and checkpoint root.

Each checkpoint binds its image digest and review-description digest, and records the runner and
model. The finalizer rejects missing, duplicate, unknown, malformed, or stale checkpoints, and also
rejects a set mixing reviewers. It writes `scrapbook/page-inventory/design-critique.json` by
default. `--allow-partial` requires an explicit scratch `--out`; a partial result cannot replace the
keeper critique.

Finalization updates critique JSON only. The preserved HTML gallery is unchanged; there is no
retained command here for attaching refreshed feedback to it. Read the JSON for a newly finalized
assessment instead of assuming the gallery displays it.

## Maintenance

`lib/page-inventory-data.mjs` owns manifest/checkpoint validation,
`lib/page-inventory-design-notes.mjs` preserves the review intent used to describe surfaces,
`lib/page-inventory-capture.mjs` retains pure image-validation helpers, and
`lib/page-inventory-report.mjs` retains viewport metadata and capture-path helpers. These libraries
do not recreate the removed end-to-end capture or attachment workflow.

The stored `review_description` is what a reviewer receives. Editing a design-note source alone does
not update an existing manifest. Treat an approved rubric change as an explicit evidence revision,
then re-review the affected manifest descriptions; never relabel old checkpoints as if they had seen
a changed prompt.

Reviewer failures retain completed checkpoints and logs so work can resume. Invalid flags,
unavailable prerequisites, and stale or incomplete data exit nonzero. Focused checks:

```sh
npm run test:tools -- tools/page-inventory/tests
```
