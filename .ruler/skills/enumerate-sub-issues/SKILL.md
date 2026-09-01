---
name: enumerate-sub-issues
description: Enumerate an epic's children from the GitHub sub-issues API — never from the epic's prose — classify each (done, dropped, in flight, done-but-open, actionable, blocked, needs triage), read every child's comment thread for retractions and scope changes, and recommend a working order with every bucket reconciled against the API counts. Use when asked what remains on an epic or tracking issue, to inventory or plan a multi-issue campaign, or before implementing any issue that belongs to an epic.
---

# Enumerate an issue's sub-issues

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

Record the count per parent. Epics nest: check each open child for sub-issues of its own before
calling it a leaf, and inventory a nested parent the same way. The reconciliation unit is the parent
— each parent's buckets sum to that parent's own API count — and the epic-wide total is the count of
**unique** issues across all levels (a child can be re-parented mid-campaign; count it once). An
inventory reporting fewer children than the API returned for any parent is wrong by construction.

## 2. Read before classifying

For each child, read the issue body **and its full comment thread** — comments retract figures,
change scope, and record partial work, and this repo has been bitten by implementing an issue whose
premise its own comments had withdrawn (the root instructions' "read issue comments before
implementing" rule). Then classify each child into exactly one bucket:

* **done** — closed as completed, with the closing evidence;
* **dropped** — closed as not planned: it is off the epic's remaining scope, and its reason is worth
  one line since it can prune siblings too;
* **in flight** — open and claimed: an `in-progress` label, an open PR, or an assignee actively on
  it. Do not recommend claiming it again;
* **done but still open** — evidence in hand (a merged PR, a commit, a comment) with the issue not
  closed: flag it for closing rather than redoing it;
* **actionable now** — open, unclaimed, clear, unblocked, correctly labeled;
* **blocked** — open, naming the blocker: another child, a human decision, hardware, an external
  event;
* **needs triage** — open with an unclear or stale premise: state the question that would unblock
  it.

## 3. Recommend an order

Dependency edges first (a child blocked on another child), then the repo's `priority:*` labels, then
cheap-and-unblocked before risky — the same ordering `create-stacked-prs` gives a stack. State the
order as a recommendation with one line of why per item; acting on it is the user's call or the next
skill's job (`burn-down-backlog` claims one issue, `create-stacked-prs` ships several).

## Completion condition

Every child in exactly one bucket, each parent's buckets summing to that parent's API count (and the
epic-wide total to the unique-issue union), and each classification carrying its evidence — a
comment, a PR, a label, never a memory of the epic's prose.
