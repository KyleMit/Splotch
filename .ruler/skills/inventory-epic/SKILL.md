---
name: inventory-epic
description: Enumerate an epic's children from the GitHub sub-issues API — never from the epic's prose — classify each as actionable now, blocked, already done, or needing triage, read every child's comment thread for retractions and scope changes, and recommend a working order with the count reconciled against the API. Use when asked what remains on an epic or tracking issue, to inventory or plan a multi-issue campaign, or before implementing any issue that belongs to an epic.
---

# Inventory an epic

An epic's prose is a stale cache of its children. This repo tracks the parent/child relation as
GitHub **sub-issues** (`docs/ISSUE-WORKFLOW.md`, "Tracking issues"), and the API is the only
enumeration that survives children being added later, closed from PRs, or renumbered in a rewrite.
The measured failure this skill exists for: a 2026-08 session hand-scraped an epic's prose into a
14-issue worklist, and the sub-issues API — consulted 88 seconds later — returned **27 children**.
The scrape had missed 13, including five of the six issues that campaign went on to ship.

## 1. Enumerate from the API

Use the native GitHub tooling's sub-issue listing where it exists; the CLI fallback is:

```sh
gh api repos/{owner}/{repo}/issues/<epic-number>/sub_issues --paginate \
  --jq '.[] | "\(.number)\t\(.state)\t\(.title)"'
```

Record the count. Every later claim about the epic reconciles against it — "N children: A done, B in
flight, C actionable, D blocked" must sum to N, and an inventory reporting fewer children than the
API returned is wrong by construction. Epics nest: check each open child for sub-issues of its own
before calling it a leaf, and fold nested children into the same accounting.

## 2. Read before classifying

For each open child, read the issue body **and its full comment thread** — comments retract figures,
change scope, and record partial work, and this repo has been bitten by implementing an issue whose
premise its own comments had withdrawn (the root instructions' "read issue comments before
implementing" rule). Then classify each child into exactly one bucket:

* **actionable now** — clear, unblocked, correctly labeled;
* **blocked** — naming the blocker: another child, a human decision, hardware, an external event;
* **already done** — evidence in hand (a merged PR, a commit, a comment) with the issue still open:
  flag it for closing rather than redoing it;
* **needs triage** — unclear or stale premise: state the question that would unblock it.

## 3. Recommend an order

Dependency edges first (a child blocked on another child), then the repo's `priority:*` labels, then
cheap-and-unblocked before risky — the same ordering `create-stacked-prs` gives a stack. State the
order as a recommendation with one line of why per item; acting on it is the user's call or the next
skill's job (`burn-down-backlog` claims one issue, `create-stacked-prs` ships several).

## Completion condition

Every child in exactly one bucket, the buckets summing to the API count, and each classification
carrying its evidence — a comment, a PR, a label, never a memory of the epic's prose.
