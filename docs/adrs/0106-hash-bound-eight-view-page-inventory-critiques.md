# ADR-0106: Hash-Bound Eight-View Page Inventory Critiques

**Status:** Active **Date:** 2026-08

> **Amended by [ADR-0111](0111-verb-object-tool-names-and-capability-documentation.md):** the
> hash-bound capture contract remains in force, while its executables are now
> `tools/page-inventory/capture-page-inventory.mjs` and
> `tools/page-inventory/finalize-page-critique.mjs`.

> **Amendment (2026-08-10):** every surface now has an explicit light/night capture axis, and each
> screenshot is reviewed by a fresh image-only reviewer under its own stable review ID. The original
> four-device, one-orientation batch checkpoints are superseded by the independent-review contract
> below.

> **Amendment (2026-08-10, later):** the manifest record shape changed (`schema_version` 3), the
> light-only theme-support opt-out is retired, capture failures are loud, and stated design intent
> is an input to every review. See the amendment at the end.

> **Amendment (2026-08-11):** divergent severities across pixel-identical captures are recorded
> rather than refused, the indistinguishable-review guard moved to the capture manifest, and the
> critique `schema_version` moves 3 → 4. See the amendment at the end.

> **Amendment (2026-08-11, later):** a checkpoint binds its `review_description` as well as its
> image digest, so editing stated design intent makes the reviews taken under the old wording stale
> instead of leaving them silently current. See the amendment at the end.

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

## Amendment (2026-08-11): pixel-identical captures are reported, not reconciled

Finalization used to refuse a critique in which two captures sharing a digest and a theme carried
different severities. That guard contradicted the decision above it: a reviewer's input is the image
**plus** its `review_description`, and pixel-identical captures are separate reviews precisely
because those descriptions name different surfaces.

The first full 672-review pass settled it. Eleven groups of captures shared pixels — the wide
Settings shell opens on Appearance, so `settings-overview` and `settings-appearance` shoot
byte-identically, and on compact phone landscape all twelve `settings-*` sections collapse into the
same quick-toggle shell. Six of those groups were judged differently, and in every one the
descriptions differed. The divergence carries meaning: for `settings-overview` a quick-toggle shell
*is* the expected content, so `pass` is right, while for `settings-sound` the same pixels mean that
section never rendered its own content, so a finding is right. Flattening them to one severity
destroys information rather than protecting it.

So each entry keeps its own severity and critique, and `finalizeDesignCritique` reports the sharing
instead. `pixel_identical_groups` lists every group of two or more entries with the same digest and
theme: its digest, its theme, whether the severities diverge, and each `review_id` with the severity
it received. `summary` carries the group and divergent-group totals beside `severity_counts`. The
generated report marks each affected shot with one line inside its critique note, so two identical
shots carrying different severities read as one shared shell judged against two expectations rather
than as reviewer inconsistency. The critique `schema_version` moves 3 → 4, so an earlier file is
refused by `readDesignCritique` — a stale critique is preserved and detached rather than misread.

What was genuinely load-bearing moved to where it can be checked deterministically. Two captures
that share **both** their digest and their `review_description` are the same review twice: those
reviewers received identical inputs, so a severity difference between them is model nondeterminism,
and failing a finished review pass over a coin flip is not a repair. `validateCaptureManifest`
rejects that pair at capture time naming both review IDs, because it means two surfaces carry the
same title and description — an authoring defect, catchable before any review is paid for.
`validateCritiqueConsistency` is gone: with the conflict throw removed its body was a pass-through
to `validateCritiqueEntries`, and the `--status` path's call re-validated entries
`loadCheckpointEntries` had already validated one checkpoint at a time.

* \+ A surface that legitimately shares a shell is still judged on what that shell means for it.
* \+ The sharing is visible in the committed JSON and in the report, so a human can audit the groups
  the tool used to hide.
* \+ The indistinguishable-review defect fails at capture time rather than after the review spend.
* − The critique no longer asserts internal consistency of any kind. Two genuinely inconsistent
  reviewers now produce two entries and a `divergent: true` group that only a human reading both
  critiques can adjudicate.

## Amendment (2026-08-11, later): a checkpoint binds the description as well as the pixels

A reviewer's inputs are the image **and** the `review_description`, but a checkpoint bound only the
image. Editing `lib/page-inventory-design-notes.mjs` therefore changed what every future reviewer is
told while leaving all 672 stored reviews reading as current — a re-run reported "All selected
page-inventory reviews are current" and re-reviewed nothing. The notes were an input the tool could
not see having changed.

A checkpoint now carries `review_description_sha256` beside its entry, and a mismatch is a
`StaleCritiqueHashError` — the same class a recapture raises. That routes a notes edit into the
staleness machinery that already exists: the runner re-queues those reviews, `--status` counts them
under `stale_reviews` and offers the first as `next_review`, and finalization refuses to publish a
critique containing one. Old checkpoints have no such field, so they read as stale rather than as
malformed, and no schema version moves.

The binding is to the manifest's stored description, not to the notes module, because that is what
the reviewer was actually handed. So editing a note requires regenerating the inventory before
re-reviewing; a re-review against an un-regenerated manifest faithfully re-runs the old wording.

* \+ Changing stated design intent invalidates exactly the reviews it changes, with no human
  bookkeeping and no way to publish a critique produced under superseded notes.
* \+ It closes the more expensive half of the ADR's standing "a design note is unfalsifiable"
  consequence: a note can still be wrong, but it can no longer be silently inert.
* − Every checkpoint written before this amendment is stale, so the next campaign re-reviews the
  whole inventory.
* − A note edit costs a full recapture as well as a full re-review, since the description the
  binding compares lives in the capture manifest.
