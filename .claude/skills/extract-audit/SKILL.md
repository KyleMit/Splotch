---
name: extract-audit
description: Scan the codebase for inline code blocks worth extracting into standalone, named, testable functions, and file them as findings in docs/AUDIT.md. Use when asked to find extraction/refactor-into-function candidates or to improve readability by naming inline logic.
---

# Extract Audit

Scan the codebase for inline code blocks that are strong candidates for extraction into standalone,
named functions.

## What to look for

A good extraction candidate is an inline block that:

* Has a single, describable purpose that can fit in a function name
* Takes identifiable inputs and produces a clear output or side effect
* Would be independently unit-testable once extracted
* Is not already a function call with a descriptive name

Extraction doesn't require the function to be reused elsewhere — clarity and testability alone
justify it. Prioritize blocks where a name would communicate intent better than reading the code.

Common patterns worth flagging:

* Multi-step data transformations buried in event handlers or lifecycle hooks
* Conditional logic with more than two branches that could be named (e.g. `getErrorMessage`,
  `isValidDrop`)
* DOM operations or canvas work that forms a coherent sub-operation
* Repeated structurally-similar blocks that differ only in inputs

Before flagging an extraction inside browser-automation code, check whether the containing function
is passed to `page.evaluate` or an equivalent serializer. Ordinary outer/module helpers are not
carried into the browser with a serialized callback; only propose a boundary that remains
self-contained, is explicitly injected, or moves the whole browser-side operation together.

## Output

Write findings to `docs/AUDIT.md` under a `## Source: Extract audit` section, using the canonical
finding format from the shared conventions — `### [Extract] proposedFunctionName` with
`#### Problem` / `#### Proposed solution` / `#### Verification` inside. Extract-specific: name the
proposed function in the title, and put its **signature** and **target location** (same file, nearby
util, etc.) in `#### Proposed solution`, e.g.
`function suggestedFunctionName(param: Type): ReturnType`.

Order by value: prefer extractions that most improve readability at the call site. Aim for 5–15
items; skip trivial one-liners unless the name would genuinely clarify intent.

After writing, print a one-paragraph summary of the patterns you found most often.

## Shared audit conventions

This is an audit skill. Follow the shared conventions in
[`.claude/audit-conventions.md`](../../audit-conventions.md):

* **Merge into `docs/AUDIT.md`, don't overwrite** (§1) — the file header lives there; enrich
  existing items, add new ones, drop fixed ones.
* **Log the run** (§2) — add a row to `docs/AUDIT-LOG.md`.
* **Self-heal** (§3) — if this run surfaced a durable method learning, fold it into this file.
