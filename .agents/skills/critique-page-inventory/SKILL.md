---
name: critique-page-inventory
description: Review every light/night screenshot in Splotch's responsive page inventory through fresh image-only reviewers, checkpoint each review ID, and finalize a complete hash-bound design critique. Use when asked to critique, assess, finish, resume, or regenerate page-inventory feedback.
---

# Critique page inventory

Produce exactly one current assessment for every capture in
`scrapbook/page-inventory/capture-manifest.json`. The manifest is the coverage authority; never
infer completion from counts in a critique file.

## Preconditions

1. Read the `design` skill for Splotch's visual criteria.
2. Run `npm run gen:page-inventory` when the manifest or any expected image is absent. A complete
   capture contains light and night variants for four devices in portrait and landscape. A capture
   that comes back near-uniform, or at dimensions other than its viewport's, is retried and then
   fails the run by name; a surface whose light and night captures are pixel-identical fails it too.
   No manifest is written from a run that had a failed capture, so a green run means every image
   rendered.
3. To check one surface without a full run, filter with `--surface` (`group/id` or a bare id),
   `--viewport`, or `--theme`, all repeatable. Any filter makes it a spot check: output goes to
   `.scrapbook-scratch/page-inventory-spot-check` as `spot-check-captures.json`, and neither the
   capture manifest nor the report is rewritten — so the committed inventory still stands. Use this
   to confirm a generator or design-intent change before spending a full pass.
4. Run `npm run gen:page-inventory:critique -- --status`. `next_review` is the first missing or
   stale manifest record and includes the stable `review_id`, image, current digest, and exact
   standalone description. Checkpoints live in the gitignored
   `.scrapbook-scratch/page-inventory-critique/reviews/` directory.

## Independent review boundary

Run `npm run gen:page-inventory:review`. The runner creates one fresh, ephemeral Codex process per
capture, disables inherited user and repository context, and gives that reviewer exactly two
semantic inputs: the manifest's `review_description` and its one image. Never combine captures in a
prompt, ask a reviewer to compare with another viewport/theme, or seed a review from prior findings.
Pixel-identical captures remain independent because their descriptions and review scopes may differ.

The capture description owns the rubric:

* Light-mode reviews assess visible hierarchy, spacing, text fit, clipping, overlap, touch-target
  clarity, modal scrolling, and visual consistency in that image.
* Night-mode reviews assess **only contrast and legibility**. They must ignore layout and responsive
  composition.
* Both use only `pass`, `low`, `medium`, or `high`. A pass has `recommendation: null`; every
  non-pass has a specific, non-empty recommendation based on visible evidence.

## Stated design intent

`tools/page-inventory/lib/page-inventory-design-notes.mjs` is the one file a human edits to stop a
reviewer reporting a settled decision as a defect. `GENERAL_DESIGN_NOTES` reach every capture;
`SURFACE_DESIGN_NOTES` key by `group/surface_id`, reach only that surface, and become its
`surface_intent`. Both ship verbatim inside `review_description`, so a note must stand alone, name
what is visible, and read as a decision already made — a reviewer who sees one image and that
description has nothing else to reconcile it against. A key naming no captured surface fails
`tools/page-inventory/tests/page-inventory.test.mjs` rather than silently delivering nothing.

Add a note when a reviewer flags something the design intends, not to suppress a finding you
disagree with: the notes travel with every future run.

The runner writes `<review_id>.json` with exactly one entry:

```json
{
  "schema_version": 3,
  "review_contract": "isolated-image-description-v1",
  "review_id": "routes--privacy--iphone-13-mini-landscape--dark",
  "entry": {
    "review_id": "routes--privacy--iphone-13-mini-landscape--dark",
    "image": "assets/routes/privacy--iphone-13-mini-landscape--dark.webp",
    "sha256": "<manifest digest>",
    "severity": "pass",
    "critique": "A concrete assessment of this capture.",
    "recommendation": null,
    "tags": []
  }
}
```

The filename, document `review_id`, and entry `review_id` must agree. The finalizer also checks the
image path and digest against the manifest, so a recapture invalidates only that one review.

The review command is resumable: current checkpoints are skipped and missing/stale ones are run. Use
`-- --limit N` for a bounded segment or `-- --review-id ID` for a canary. A complete requested run
continues until status reports `next_review: null`.

Explicit invocation of this skill or a request for a full critique authorizes the isolated OpenAI
review calls for the manifest images. If the host requests execution/network approval, request one
campaign-scoped approval for `npm run gen:page-inventory:review`; do not prompt per image.

## Finalize and attach

Run, in order:

```bash
npm run gen:page-inventory:critique
npm run gen:page-inventory:feedback
npm run scrapbook:check
```

Finalization refuses missing, duplicate, unknown, grouped, or stale reviews and derives coverage and
severity totals from the manifest-bound entries. Never publish an `--allow-partial` result; that
flag requires an explicit scratch `--out` and exists only for work-in-progress inspection.
