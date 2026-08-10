# ADR-0106: Hash-Bound Eight-View Page Inventory Critiques

**Status:** Active **Date:** 2026-08

> **Path note ([ADR-0108](0108-unified-tools-tree.md)):** the `scripts/…` paths below moved under
> `tools/`, folded by capability. The decision itself is unchanged.

## Context

The committed page inventory is both a responsive UI record and the evidence behind its design
critique. A critique keyed only by image path can silently survive a recapture even when the pixels
changed, while a reported screenshot count can claim completion without proving that every current
surface was reviewed. The original four portrait captures also missed the compact landscape shells
and height-constrained modal states that ship on phones and tablets.

Alternatives considered:

* **Keep critique entries keyed only by stable image paths.** Rejected because recapturing an image
  in place would attach stale feedback to new pixels.
* **Review one portrait per device class.** Rejected because width alone does not exercise the
  landscape-height breakpoints used by Settings and several overlays.
* **Produce one monolithic critique file in a single run.** Rejected because an interrupted review
  loses progress and makes it difficult to invalidate only the surfaces whose captures changed.
* **Permit partial feedback in the committed report.** Rejected because absence is ambiguous: a
  missing entry could mean a pass, an overlooked capture, or interrupted work.

## Decision

`scripts/gen-page-inventory.mjs` captures every discovered surface at four canonical Apple devices
in both portrait and landscape. It validates the WebP format and dimensions, rejects captures with
no visible ready content or suspiciously blank pixels, and writes
`scrapbook/page-inventory/capture-manifest.json`. Each manifest record includes its surface,
viewport, orientation, image path, and SHA-256 digest.

Critique work is split into one checkpoint per surface and orientation under the gitignored
`.scrapbook-scratch/page-inventory-critique/checkpoints/`. Each checkpoint contains all four device
assessments for that batch and copies the manifest digest for every image. The
`critique-page-inventory` skill defines the review loop so interrupted sessions resume from the
strictly derived missing- and stale-batch queues. An assessment may be reused when another capture
has the same digest, and finalization rejects different severities for pixel-identical captures.

`scripts/finalize-page-inventory-critique.mjs` is the only path for producing the committed
`design-critique.json`. It rejects unknown, duplicate, missing, or stale entries and derives
coverage and severity totals from the validated records. Complete finalization is the default;
partial output requires both `--allow-partial` and an explicit scratch destination. The feedback
attachment step rehashes every WebP and refuses to attach critique unless the manifest, current
inventory, files, and complete critique agree exactly.

## Consequences

* \+ Every committed assessment is traceable to the exact pixels reviewed.
* \+ The inventory exercises 46 surfaces across four devices in both orientations, including
  height-constrained landscape behavior.
* \+ Checkpoints make long reviews resumable and invalidate only the affected surface-orientation
  batch after a recapture.
* \+ Coverage and severity totals cannot drift from the validated entry set.
* − A full capture contains twice as many WebPs and a complete review requires twice as many
  assessments as the portrait-only inventory.
* − Intentional nondeterminism in a screenshot changes its digest and requires that batch to be
  reviewed again, even when the visual difference is harmless.
* − The strict attachment path refuses useful-but-incomplete feedback; work in progress must remain
  in scratch output until all current batches are complete.
