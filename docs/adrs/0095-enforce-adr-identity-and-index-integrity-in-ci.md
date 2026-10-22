# ADR-0095: Enforce ADR Identity and Index Integrity in a Standalone CI Gate

**Status:** Active **Date:** 2026-08

## Context

ADR numbers are permanent identifiers, but Git sees two records with the same number as unrelated
paths. A branch adding `0078-new-decision.md` therefore merges cleanly even when another `0078-*.md`
record already exists. The pull request diff shows only the new file, and every bare `ADR-0078`
reference becomes ambiguous without a textual merge conflict.

That failure happened twice: `0077` and `0078` were each issued to two records. Issue #676 repaired
the collisions by moving the records with fewer inbound references to 0081 and 0082, including their
headings, index entries, and references. The ambiguity had already reached merged ADR prose and
immutable commit messages.

The collisions had two independent causes. The `create-adr` skill counted record files even though
0053–0056 are permanently unspent in this directory, so its proposed number lagged the highest
number in use; issue #677 owns that generator repair. Independently, two branches can correctly
choose the same free number and both go green before either lands. The second branch then has a
stale successful check after the first spends the number.

The index adds another identity seam. A row such as
`[0078](0082-resident-snapshot-tier-byte-budget.md)` gives one record two visible numbers, while an
unindexed or twice-indexed record breaks the index's claim to be the complete curated presentation
of the append-only history. Those are mechanical cross-file agreements, not matters for reviewer
memory. Section choice and numeric ordering within a section, by contrast, encode editorial
structure and remain review-owned.

Folding the checks into `.github/workflows/test.yml`, using path filters, gating an unconditional
workflow at the step level, applying a bot-managed do-not-merge label, relying on review or a
pre-commit hook, and using only a Vitest drift guard were considered. A `quality` step would be less
self-diagnosing; a path-filtered required workflow can remain Pending when skipped; a label is a
fail-open signal; and a local-only test cannot compare a branch with a freshly fetched base. A merge
queue or an up-to-date-branch requirement remains the stronger answer to stale successful checks,
but that is repository policy rather than a replacement for semantic validation.

## Decision

`.github/workflows/adr-integrity.yml` is a standalone, unconditional workflow on pull requests,
merge groups, and manual dispatches. It has no path filter, so its job always reports and is safe to
make required. It sparse-checks out `docs/adrs/`, `tools/adrs/`, and `tools/lib/`, fetches the
current base branch, and invokes `tools/adrs/check-adr-integrity.mjs` directly with the runner's
installed Node. There is no dependency install or `setup-pnpm`; consequently the checker and its
library may use only APIs available in the runner image's default Node rather than assuming the
contributor version from `package.json`.

The checker validates the resulting tree unconditionally, including manual audits of branches that
did not change an ADR. Pure logic in `tools/adrs/lib/adr-integrity.mjs`, covered by
`tools/adrs/tests/adr-integrity.test.mjs`, reports a filename starting with four digits but not
matching lower-kebab-case as a warning and omits it from the remaining checks rather than failing.
The checker then enforces these invariants:

* every number identifies exactly one record in the tree;
* a genuinely added record does not take a number the live base already assigns to another record;
* every record H1 names the same number as its filename;
* every record appears exactly once in `docs/adrs/README.md`; and
* every local ADR link's text number matches its target filename, and the target exists.

The base comparison uses rename-aware Git additions so retitling a record without changing its
number does not resemble a collision. An unreadable base emits a warning and narrows validation to
the working tree rather than silently claiming the stronger comparison.

Index parsing is deliberately targeted rather than a general Markdown parser. Canonical entries are
the leading link in a Start here bullet or the leading link in a section table row; links in status
text and prose are cross-references and do not count toward exact-once coverage, but their labels
and targets are still validated. Fenced examples are ignored, while a leading `./` and a fragment on
a local target are normalized because they do not change the linked record. This is sufficient to
test coverage and link-text agreement while leaving section placement and order to review. Failures
emit plain diagnostics locally and dependency-free GitHub workflow annotations in CI.

## Consequences

* \+ A duplicate number, stale-base collision, heading mismatch, missing or duplicate index entry,
  mismatched index label, and nonexistent index target all fail with the offending paths and lines.
* \+ The standalone job is self-diagnosing, always reports, and can be made a required check without
  path-filter skip semantics.
* \+ The pure parser tests make index coverage enforceable without introducing a Markdown-parser or
  GitHub Actions dependency.
* − The workflow runs on pull requests that do not touch ADRs; the directory scan is cheaper than
  determining whether it can be skipped, but checkout and job startup still consume one runner.
* − The targeted parser depends on the index retaining its two canonical entry shapes. A different
  presentation must update the parser and tests together.
* − Repository ruleset configuration remains external to the codebase. Without a required,
  up-to-date check or merge queue, a previously green branch can still merge after another branch
  spends the same number.
* − Omitting `setup-pnpm` constrains the checker to the Actions runner's default Node API surface.
