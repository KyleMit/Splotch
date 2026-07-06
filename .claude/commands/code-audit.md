# Code Audit

Do a comprehensive pass of the repository and produce a prioritized list of improvements in `docs/AUDIT.md`.

## How to audit

Read the codebase thoroughly — source files, config, tests, and build scripts. Evaluate each area against these lenses:

- **Performance** — unnecessary work, blocking operations, missed caching, wasteful renders/recomputations
- **Readability** — inconsistent naming, opaque logic, dead code, misleading abstractions
- **Maintainability** — duplicated logic, overly coupled modules, missing or wrong types, fragile assumptions
- **Architecture** — components doing too much, wrong layer of abstraction, missing seams for testing

Skip anything already tracked in an open issue or obviously intentional (e.g. a deliberate tradeoff with a comment explaining it).

## Output

Write findings to `docs/AUDIT.md` under a `## Source: Code audit` section, using the
canonical item format. Order items by impact: highest-value or lowest-risk changes
first. Group related items together when the order doesn't matter. Aim for 5–15 items;
skip trivial style nits unless they appear broadly.

After writing, print a one-paragraph summary of the top themes you found.

## Shared audit conventions

This is an audit skill. Follow the shared conventions in
[`.claude/audit-conventions.md`](../audit-conventions.md):

- **Merge into `docs/AUDIT.md`, don't overwrite** (§1) — the item format and the file
  header live there; enrich existing items, add new ones, drop fixed ones.
- **Log the run** (§2) — add a row to `docs/AUDIT-LOG.md`.
- **Self-heal** (§3) — if this run surfaced a durable method learning, fold it into
  this file.
