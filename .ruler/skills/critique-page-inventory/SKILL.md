---
name: critique-page-inventory
description: Review the recorded light/night screenshots in Splotch's responsive page inventory through fresh image-only reviewers, checkpoint each review ID, and finalize a complete hash-bound design critique. Use when asked to critique, assess, finish, resume, or regenerate page-inventory feedback.
---

# Critique page inventory

Produce exactly one current assessment for every capture in
`scrapbook/page-inventory/capture-manifest.json`. The manifest is the coverage authority; never
infer completion from counts in a critique file.

## Preconditions

1. Read the `design` skill for Splotch's visual criteria.
2. Use the recorded `scrapbook/page-inventory/capture-manifest.json` and its matching images. The
   SvelteKit capture and report-attachment commands retired; this skill reviews existing evidence
   and does not generate a fresh React Native inventory. Restore missing recorded files from their
   matching snapshot or report the missing evidence before proceeding.
3. Verify each image's actual SHA-256 against its manifest record before spending review calls:

   ```sh
   node --input-type=module <<'NODE'
   import { dirname, join } from 'node:path';
   import { readCaptureManifest, sha256File } from './tools/page-inventory/lib/page-inventory-data.mjs';
   const file = 'scrapbook/page-inventory/capture-manifest.json';
   for (const capture of readCaptureManifest(file).captures) {
     if (sha256File(join(dirname(file), capture.image)) !== capture.sha256)
       throw new Error(`Capture bytes changed: ${capture.review_id}`);
   }
   NODE
   ```

4. Run `npm run finalize:page-inventory-critique -- --status`. `next_review` is the first missing or
   stale manifest record and includes the stable `review_id`, image, current digest, and exact
   standalone description. Checkpoints live in the gitignored
   `.scrapbook-scratch/page-inventory-critique/reviews/` directory. Treat the recorded descriptions
   and capture dates as the review scope, rather than claiming the images show the current app.

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

`tools/page-inventory/lib/page-inventory-design-notes.mjs` preserves general, group, and surface
intent used when creating review descriptions. A reviewer receives the manifest's stored
`review_description`, including any recorded `surface_intent`; it does not load that source file.
Keep these descriptions self-contained: name what is visible and state settled decisions without
requiring repository context. Change a rubric only when the task requests that evidence revision,
not to suppress a finding you disagree with.

A checkpoint binds the exact description stored in the manifest. Editing a note source does not
change an existing manifest or the prompt a resumed review receives. Keep the recorded wording when
reviewing preserved evidence. If the task explicitly changes the rubric, treat the manifest and its
description hashes as an evidence revision, preserve its provenance, and re-review every affected
entry afterward. General notes can affect the whole inventory; never retag an old checkpoint as a
review of revised wording.

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
  "schema_version": 4,
  "review_contract": "isolated-image-description-v1",
  "reviewer": { "runner": "codex", "model": "<actual reviewer model>" },
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
document's `review_description_sha256` — so a changed image invalidates that review, and a changed
manifest description invalidates its matching checkpoint. A checkpoint without the description
digest is stale by definition. Let the review runner write checkpoints from the actual reviewer
output.

The review command is resumable: current checkpoints are skipped and missing/stale ones are run. Use
`-- --limit N` for a bounded segment or `-- --review-id ID` for a canary. A complete requested run
continues until status reports `next_review: null`.

Explicit invocation of this skill or a request for a full critique authorizes the isolated provider
review calls for the manifest images. If the host requests execution/network approval, request one
campaign-scoped approval for `npm run review:page-inventory`; do not prompt per image.

## Finalize

After every requested review is current:

```bash
npm run finalize:page-inventory-critique
npm run scrapbook:check
```

Finalization refuses missing, duplicate, unknown, or stale reviews and derives coverage and severity
totals from the manifest-bound entries. It also lists every set of entries sharing a digest and a
theme under `pixel_identical_groups`, flagging the ones whose severities diverge. The sharing is
reported, never reconciled, so read a `divergent: true` group as two expectations of one shell
rather than as a defect to fix. Never publish an `--allow-partial` result; that flag requires an
explicit scratch `--out` and exists only for work-in-progress inspection.

Finalization updates `scrapbook/page-inventory/design-critique.json`; it leaves the preserved HTML
gallery unchanged. Report the JSON result and its coverage explicitly. The retired attachment
workflow is not a prerequisite or an available publishing step.
