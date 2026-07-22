---
name: update-adrs
description: Review recent decisions from the current conversation and git history, verify existing ADRs still reflect reality, and add or amend ADRs as needed. Use at the end of a session that touched architecture, testing, infrastructure, or build tooling, or when asked to refresh or reconcile the ADRs.
---

# Update ADRs

Review recent decisions from the current conversation and git history, verify that all existing ADRs
still reflect reality, and add or amend ADRs as needed.

## Step 1 — Find recent decisions

Look for decisions made since the ADRs were last updated. Use these sources in order:

1. **Current conversation context** — scan this session for any "we decided to…", "we chose X over
   Y", tradeoff discussions, or bug workarounds that were settled.
2. **Recent git log** — run `git log --oneline -30` and look for commits whose message implies a
   decision: `feat:`, `fix:`, `refactor:`, `chore:` entries that changed an approach rather than
   just adding code.
3. **Recently modified source files** — check what changed and whether those changes represent a new
   or reversed decision.

Do NOT go through the full git history — only look at recent context (this session + the last ~30
commits). Decisions from further back are already covered by the existing ADRs or are too stale to
recover reliably.

## Step 2 — Verify existing ADRs

Read `docs/adrs/README.md` to get the full list, then for each ADR:

1. **Check the key claim is still true.** Read or grep the file(s) cited in the ADR. If the code no
   longer matches the decision described, the ADR is stale.
2. **Decide: still active, update, or deprecate.**
   * **Still active** — no action needed.
   * **Needs update** — the decision is still in force but details changed (e.g. a version number, a
     file path, a workaround that was resolved). Edit the ADR in place.
   * **Deprecated / superseded** — the decision has been reversed. Change `**Status:** Active` to
     `**Status:** Superseded by ADR-NNNN` or `**Status:** Deprecated`, and add a short note at the
     top explaining what replaced it. Also move the ADR's row in `docs/adrs/README.md` to the
     Historical section (the index is tiered — see `/create-adr`), keeping supersession links
     intact.

Spot-check at minimum: any ADR that references a specific version number, file path, or external
tool (Capacitor, Node, JDK, Maestro) — these age fastest.

## Step 3 — Add new ADRs

For each decision found in Step 1 that is not already covered by an existing ADR:

* Confirm it meets the bar (see `/create-adr` for criteria).
* Write the new ADR file following the template from `/create-adr`.
* Use the next available four-digit number.
* Slot a row into the matching area section of the tiered index in `docs/adrs/README.md` (see
  `/create-adr` for where a new row belongs).

If a decision *amends* an existing ADR (same topic, updated approach), update the existing file
rather than creating a new one — unless the approach changed so substantially that the old reasoning
should be preserved as a historical record, in which case deprecate the old one and write a new one.

## Output

Print three short lists:

* **Verified (no change)** — ADRs checked and still accurate, one line each
* **Updated** — ADRs that were edited and what changed, one line each
* **Added** — new ADRs created, one line each with the decision they document

If nothing changed, say so explicitly rather than producing empty lists.
