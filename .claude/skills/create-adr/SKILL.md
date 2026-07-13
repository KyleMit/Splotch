---
name: create-adr
description: Document a new architectural decision as an ADR in docs/adrs/. Use when a significant decision was just made or confirmed — one that chose an approach over real alternatives, has non-obvious consequences, or encodes a constraint a future contributor would want to understand.
---

# Create ADR

Document a new architectural decision as an ADR in `docs/adrs/`.

## When to create an ADR

An ADR is warranted when a decision:

* Chose one approach over meaningful alternatives (not just "we used the default")
* Has non-obvious consequences that a future contributor would want to understand
* Involves a tradeoff that could be revisited (so the original reasoning should be recorded)
* Fixes a non-obvious constraint (a bug workaround, a platform quirk, a security requirement)

Skip trivial implementation details, stylistic choices, and decisions that are self-evident from
reading the code.

## Asset-gen carve-out

Decisions about the **asset-generation pipeline** (line art, coloring fills, the tools under
`tools/asset-gen/`) do NOT become numbered ADRs — they live as un-numbered decision records in
`tools/asset-gen/docs/` (same Context/Decision/Consequences structure, a descriptive kebab-case
filename, no number). Everything below about numbering and the index applies only to app/infra
decisions in `docs/adrs/`.

## Process

1. **Identify the decision.** If the user named it, use that. Otherwise infer it from the current
   conversation, recent git log (`git log --oneline -20`), or the code change being made.

2. **Check for duplicates.** Read `docs/adrs/README.md` and scan existing ADR titles. If the
   decision is already covered, update the existing ADR instead of creating a new one.

3. **Verify against current code.** Before writing, confirm that the decision is actually reflected
   in the codebase — read the relevant file(s) and grep for the key patterns. Do not document a
   decision that has already been reversed.

4. **Determine the next ADR number.** Count existing files in `docs/adrs/` (excluding `README.md`)
   and use the next four-digit number (`0015`, `0016`, etc.).

5. **Write the ADR file** at `docs/adrs/NNNN-kebab-case-title.md` using the template below.

6. **Update the index.** Add one row to the table in `docs/adrs/README.md`.

## ADR template

```markdown
# ADR-NNNN: Title

**Status:** Active **Date:** YYYY-MM (approximate is fine)

## Context

What situation or constraint made this decision necessary? What alternatives were considered and why
were they inadequate? Name the alternatives explicitly — "we considered X and Y" is more useful than
a blank "we needed Z."

## Decision

What was decided, and exactly how is it implemented? Cite the key files/lines. If the decision has
gotchas or non-obvious invariants, call them out here (not in Consequences).

## Consequences

Use `\+` / `−` bullets — escape the plus (a bare `+` after the list marker parses as a nested list
and dprint restructures it, ADR-0057) and use U+2212 `−` for minus. Be honest about the downsides —
an ADR with only upsides is not credible and not useful.
```

## Status values

* **Active** — in force right now
* **Superseded by ADR-NNNN** — replaced; link to the successor
* **Deprecated** — no longer in force but not replaced by a specific decision

## Output

After creating the ADR, print a one-paragraph summary of what was documented and why it merited an
ADR rather than just a code comment.
