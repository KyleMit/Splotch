# ADR-0106: Hash-Bound Eight-View Page Inventory Critiques

**Status:** Active **Date:** 2026-08

> **Amendment (2026-08-10):** every surface now has an explicit light/night capture axis, and each
> screenshot is reviewed by a fresh image-only reviewer under its own stable review ID. The original
> four-device, one-orientation batch checkpoints are superseded by the independent-review contract
> below.

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

`tools/page-inventory/gen-page-inventory.mjs` captures every discovered surface at four canonical
Apple devices in both portrait and landscape, in light and night mode. It validates the WebP format
and dimensions, rejects captures with no visible ready content or suspiciously blank pixels, and
writes `scrapbook/page-inventory/capture-manifest.json`. Each manifest record includes its surface,
viewport, orientation, theme, stable review ID, standalone review description, image path, and
SHA-256 digest. The night description scopes assessment to contrast and legibility; layout is out of
scope for night captures.

Critique work is split into one checkpoint per review ID under the gitignored
`.scrapbook-scratch/page-inventory-critique/reviews/`. The review runner creates a fresh ephemeral
process for each capture from an empty temporary directory outside the worktree, with inherited
user, repository, and execution-policy context disabled. Its only semantic inputs are that capture's
manifest description and image. Pixel-identical captures remain separate reviews because
theme-specific scopes and descriptions can differ. Checkpoint filename, review contract, document
ID, entry ID, image path, and digest must all agree.

`tools/page-inventory/finalize-page-inventory-critique.mjs` is the only path for producing the
committed `design-critique.json`. It rejects unknown, duplicate, missing, or stale entries and
derives coverage and severity totals from the validated records. Complete finalization is the
default; partial output requires both `--allow-partial` and an explicit scratch destination. The
feedback attachment step rehashes every WebP and refuses to attach critique unless the manifest,
current inventory, files, and complete critique agree exactly.

## Consequences

* \+ Every committed assessment is traceable to the exact pixels reviewed.
* \+ The inventory exercises every discovered surface across four devices, both orientations, and
  both themes, including height-constrained landscape behavior and night contrast.
* \+ Checkpoints make long reviews resumable and invalidate only the affected screenshot after a
  recapture.
* \+ Each review is context-isolated and auditable through a stable manifest ID and description.
* \+ Coverage and severity totals cannot drift from the validated entry set.
* − A full capture contains four times as many WebPs as the original portrait-only inventory.
* − Intentional nondeterminism in a screenshot changes its digest and requires that review to be run
  again, even when the visual difference is harmless.
* − The strict attachment path refuses useful-but-incomplete feedback; work in progress must remain
  in scratch output until all current reviews are complete.
