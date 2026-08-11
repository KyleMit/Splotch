# ADR-0106: Hash-Bound Eight-View Page Inventory Critiques

**Status:** Active **Date:** 2026-08

> **Amendment (2026-08-10):** every surface now has an explicit light/night capture axis, and each
> screenshot is reviewed by a fresh image-only reviewer under its own stable review ID. The original
> four-device, one-orientation batch checkpoints are superseded by the independent-review contract
> below.

> **Amendment (2026-08-10, later):** the manifest record shape changed (`schema_version` 3), the
> light-only theme-support opt-out is retired, capture failures are loud, and stated design intent
> is an input to every review. See the amendment at the end.

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

## Amendment (2026-08-10): loud captures, retired light-only, and stated design intent

Four changes, all in `tools/page-inventory/`. The manifest `schema_version` moves 2 → 3, so a
manifest from before this amendment is refused until the inventory is regenerated.

**The light-only opt-out is retired.** `theme_support`, `PAGE_INVENTORY_THEME_SUPPORT`, and the
night-mode description branch are gone, following ADR-0071's decision that no page opts out of night
mode. `validateThemeCaptureDifferences` now applies to every surface unconditionally, which converts
it from a coverage detail into the guard that *enforces* that decision: a page that stops following
the theme produces pixel-identical light and night captures and fails the run. The previous run had
exactly that — `/android-beta`, `/changelog` and `/privacy` shipped one image reviewed twice under
two rubrics, and the opt-out is what let it through.

**Capture failure is loud.** Blankness is measured as peak channel standard deviation rather than
inferred from file size, which is not a usable proxy — the quietest legitimate capture and an empty
harness page overlap in bytes. Every image is also checked against the dimensions of the viewport it
was shot at, which is what catches a viewport that never applied. Either failure retries a bounded
number of times and then fails the whole run naming the surface, viewport, theme, and failing check.
No manifest is written from a run that had a failed capture, so a green run means every image
rendered.

**Design intent is a review input.** `lib/page-inventory-design-notes.mjs` holds general notes that
reach every `review_description` and per-surface notes keyed by `group/surface_id` that become that
capture's `surface_intent`; it is the sole author of intent, replacing the per-surface `intent`
option. This exists because an isolated reviewer cannot distinguish a settled decision from a defect
— it sees one image and one description — so a decision like a deliberately low-contrast disabled
control has to be stated or it will be re-reported on every run. A note key naming no captured
surface fails the tool tests rather than silently delivering nothing.

**Spot checks.** `--surface`, `--viewport`, and `--theme` filter a run. Any filter diverts output to
scratch and writes neither the capture manifest nor the report, so a filtered run cannot leave the
committed inventory partially rewritten — the coverage authority stays all-or-nothing.

* \+ A capture that silently fails to render can no longer reach a reviewer or the report.
* \+ Intended design decisions stop being re-reported every run, and the reason is
  version-controlled next to the tool rather than re-explained per review.
* \+ A generator or notes change can be verified against a couple of surfaces before spending a full
  pass.
* − Regenerating is now all-or-nothing: one unrenderable surface fails the run rather than degrading
  it, which is the point but does make a flaky surface block the whole inventory.
* − A design note is unfalsifiable by the tool. A wrong note suppresses a real finding on every
  future run, and only a human reading the notes file will catch it.
