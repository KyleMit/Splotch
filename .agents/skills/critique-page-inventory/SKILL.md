---
name: critique-page-inventory
description: Review every screenshot in Splotch's responsive page inventory in deterministic surface-by-orientation batches, checkpoint the findings, and finalize a complete hash-bound design critique. Use when asked to critique, assess, finish, resume, or regenerate page-inventory feedback across portrait and landscape captures.
---

# Critique page inventory

Produce exactly one current assessment for every capture in
`scrapbook/page-inventory/capture-manifest.json`. The manifest is the coverage authority; never
infer completion from counts in a critique file.

## Preconditions

1. Read the `design` skill for Splotch's visual criteria.
2. Run `npm run gen:page-inventory` when the manifest or any expected image is absent. A complete
   capture contains four devices in portrait and landscape.
3. Run `npm run gen:page-inventory:critique -- --status`. Work only from its `missing_batches`
   queue. Checkpoints live in the gitignored
   `.scrapbook-scratch/page-inventory-critique/checkpoints/` directory.

## Review one batch

Each batch is one surface in one orientation and must contain the four canonical device captures.

1. Select the first missing batch. Query its four records from the manifest; copy image paths and
   SHA-256 values exactly.
2. Open all four WebPs with `view_image`. Review them together for responsive behavior: hierarchy,
   space use, text fit, clipping or overlap, touch-target reachability, modal scrolling, visual
   consistency, and orientation-specific failures. Treat blank harness or content captures as a
   capture failure, not a design finding; rerun capture after fixing the ready condition. When a
   capture's SHA-256 exactly matches an already-checkpointed capture, reuse that capture's
   assessment instead of reviewing identical pixels again. Identical digests must carry the same
   severity; finalization rejects a disagreement.
3. Write `<batch_key>.json` in the checkpoint directory with this shape:

   ```json
   {
     "schema_version": 1,
     "batch_key": "routes--privacy--landscape",
     "entries": [
       {
         "image": "assets/routes/privacy--iphone-13-mini-landscape.webp",
         "sha256": "<manifest digest>",
         "severity": "pass",
         "critique": "A concrete assessment of this capture.",
         "recommendation": null,
         "tags": []
       }
     ]
   }
   ```

4. Use only `pass`, `low`, `medium`, or `high`. A pass has `recommendation: null`; every non-pass
   has a specific, non-empty recommendation. Describe visible evidence rather than guessing at
   implementation.
5. Rerun the status command. A post-recapture hash mismatch appears under `stale_batches`; rereview
   and replace that checkpoint. Fix any malformed checkpoint error immediately; do not advance past
   it.

Continue until `missing_batches` is empty. A changed image hash invalidates only the checkpoint that
contains it; rereview that batch instead of discarding valid work.

## Finalize and attach

Run, in order:

```bash
npm run gen:page-inventory:critique
npm run gen:page-inventory:feedback
npm run scrapbook:check
```

Finalization refuses missing, duplicate, unknown, or stale entries and derives coverage and severity
totals from the manifest-bound entries. Never publish an `--allow-partial` result; that flag
requires an explicit scratch `--out` and exists only for work-in-progress inspection.
