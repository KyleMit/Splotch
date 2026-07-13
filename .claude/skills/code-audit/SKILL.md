---
name: code-audit
description: Comprehensive repository pass that produces a prioritized list of performance, readability, maintainability, and architecture improvements in docs/AUDIT.md. Use when asked to audit the codebase, hunt for improvement opportunities, or do a broad code-quality sweep across the repo.
---

# Code Audit

Do a comprehensive pass of the repository and produce a prioritized list of improvements in
`docs/AUDIT.md`.

## How to audit

Read the codebase thoroughly — source files, config, tests, and build scripts. Evaluate each area
against these lenses:

* **Performance** — unnecessary work, blocking operations, missed caching, wasteful
  renders/recomputations
* **Readability** — inconsistent naming, opaque logic, dead code, misleading abstractions
* **Maintainability** — duplicated logic, overly coupled modules, missing or wrong types, fragile
  assumptions
* **Architecture** — components doing too much, wrong layer of abstraction, missing seams for
  testing

Skip anything already tracked in an open issue or obviously intentional (e.g. a deliberate tradeoff
with a comment explaining it).

## Output

Write findings to `docs/AUDIT.md` under a `## Source: Code audit` section, using the canonical
finding format. Order findings by impact: highest-value or lowest-risk changes first. Group related
items together when the order doesn't matter. Aim for 5–15 items; skip trivial style nits unless
they appear broadly.

After writing, print a one-paragraph summary of the top themes you found.

## Method notes

Learned from prior runs:

* The repo (~27k source lines) is too big for one context to read thoroughly. Fan out parallel
  subagents, one per area — drawing engine (`lib/drawing/`), toddler UI components, Parent Center +
  admin, state/storage/PWA, server + `/api` routes, scripts + build config/CI — each applying the
  four lenses to every file in its area and returning findings with line numbers and quoted
  evidence.
* Agents over-produce (expect ~40+ raw findings against the 5–15 cap). Synthesize by merging
  same-concept findings across files into one actionable item (e.g. several platform-detection
  drifts → one item) and dropping low-impact ones — don't truncate.
* Before filing, re-verify the top-ranked claims yourself against the cited lines (agents
  occasionally misread control flow); the ordering is only as good as the claims are true.
* Check open GitHub issues first so already-tracked work is excluded.

## Shared audit conventions

This is an audit skill. Follow the shared conventions in
[`audit-conventions`](../audit-conventions/SKILL.md):

* **Merge into `docs/AUDIT.md`, don't overwrite** (§1) — the item format and the file header live
  there; enrich existing items, add new ones, drop fixed ones.
* **Log the run** (§2) — add a row to `docs/AUDIT-LOG.md`.
* **Self-heal** (§3) — if this run surfaced a durable method learning, fold it into this file.
