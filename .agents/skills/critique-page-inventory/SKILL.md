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
2. Run `npm run capture:page-inventory` when the manifest or any expected image is absent. A
   complete capture contains light and night variants for four devices in portrait and landscape. A
   capture that comes back near-uniform, or at dimensions other than its viewport's, is retried and
   then fails the run by name; a surface whose light and night captures are pixel-identical fails it
   too, as do two captures sharing both their digest and their review description, which would be
   one review paid for twice. No manifest is written from a run that had a failed capture, so a
   green run means every image rendered.
3. To check one surface without a full run, filter with `--surface` (`group/id` or a bare id),
   `--viewport`, or `--theme`, all repeatable. Any filter makes it a spot check: output goes to
   `.scrapbook-scratch/page-inventory-spot-check` as `spot-check-captures.json`, and neither the
   capture manifest nor the report is rewritten — so the committed inventory still stands. Use this
   to confirm a generator or design-intent change before spending a full pass.
4. Run `npm run finalize:page-inventory-critique -- --status`. `next_review` is the first missing or
   stale manifest record and includes the stable `review_id`, image, current digest, and exact
   standalone description. Checkpoints live in the gitignored
   `.scrapbook-scratch/page-inventory-critique/reviews/` directory.

## Independent review boundary

Run `npm run review:page-inventory`. The runner creates one fresh, ephemeral reviewer process per
capture, disables inherited user and repository context, and gives that reviewer exactly two
semantic inputs: the manifest's `review_description` and its one image. Never combine captures in a
prompt, ask a reviewer to compare with another viewport/theme, or seed a review from prior findings.
Pixel-identical captures remain independent because their descriptions and review scopes may differ.
Several surfaces legitimately share pixels — the wide Settings shell opens on Appearance, and
compact phone landscape collapses every `settings-*` section into one quick-toggle shell — and the
same pixels mean different things to reviewers told to expect different surfaces. Their severities
are allowed to diverge and are never reconciled.

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

A checkpoint binds the description it was reviewed against, so editing a note is not free and is not
silent: it makes every review whose description changed stale. Regenerate the inventory first (`npm
run capture:page-inventory`) — the binding compares the manifest's stored description, so a
re-review against an un-regenerated manifest faithfully re-runs the old wording — then `-- --status`
reports the affected reviews under `stale_reviews` and the review command re-runs them. General
notes reach every capture, so editing one restages the whole inventory.

A note about deliberately quiet styling still has to leave a floor the reviewer can fail, and how
that floor is worded decides whether the note works. Write it as a state checkable in the image —
"report it only when you cannot locate its shape anywhere in this image" — never as a judgement of
degree phrased the way the finding would be phrased. The first quiet-controls note closed with
"report them if they are genuinely hard to make out", and 168 of that run's 256 non-pass reviews
came back on the chevron and the settings button, most echoing that clause as their justification.
The file's header comment carries this rule and the three before it; read them before adding a note.

The runner writes `<review_id>.json` with exactly one entry:

```json
{
  "schema_version": 3,
  "review_contract": "isolated-image-description-v1",
  "review_id": "routes--privacy--iphone-13-mini-landscape--dark",
  "review_description_sha256": "<sha256 of the manifest's review_description>",
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

The filename, document `review_id`, and entry `review_id` must agree. The finalizer also checks both
of the reviewer's inputs against the manifest — the entry's image path and digest, and the
document's `review_description_sha256` — so a recapture invalidates only that one review, and a
notes edit invalidates only the reviews whose description it changed. A checkpoint written without
the description digest is stale by definition, so hand-authoring one from this shape means computing
it from that capture's `review_description`.

The review command is resumable: current checkpoints are skipped and missing/stale ones are run. Use
`-- --limit N` for a bounded segment or `-- --review-id ID` for a canary. A complete requested run
continues until status reports `next_review: null`.

Explicit invocation of this skill or a request for a full critique authorizes the isolated OpenAI
review calls for the manifest images. If the host requests execution/network approval, request one
campaign-scoped approval for `npm run review:page-inventory`; do not prompt per image.

## Finalize and attach

Run, in order:

```bash
npm run finalize:page-inventory-critique
npm run attach:page-inventory-feedback
npm run scrapbook:check
```

Finalization refuses missing, duplicate, unknown, or stale reviews and derives coverage and severity
totals from the manifest-bound entries. It also lists every set of entries sharing a digest and a
theme under `pixel_identical_groups`, flagging the ones whose severities diverge, and the report
marks those shots — the sharing is reported, never reconciled, so read a `divergent: true` group as
two expectations of one shell rather than as a defect to fix. Never publish an `--allow-partial`
result; that flag requires an explicit scratch `--out` and exists only for work-in-progress
inspection.
