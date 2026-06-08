# Extract Audit

Scan the codebase for inline code blocks that are strong candidates for extraction into standalone, named functions.

## What to look for

A good extraction candidate is an inline block that:
- Has a single, describable purpose that can fit in a function name
- Takes identifiable inputs and produces a clear output or side effect
- Would be independently unit-testable once extracted
- Is not already a function call with a descriptive name

Extraction doesn't require the function to be reused elsewhere — clarity and testability alone justify it. Prioritize blocks where a name would communicate intent better than reading the code.

Common patterns worth flagging:
- Multi-step data transformations buried in event handlers or lifecycle hooks
- Conditional logic with more than two branches that could be named (e.g. `getErrorMessage`, `isValidDrop`)
- DOM operations or canvas work that forms a coherent sub-operation
- Repeated structurally-similar blocks that differ only in inputs

## Output format

Write (or append) to `TODO.md` using this exact structure so `/fix-next-todo` can work through it:

```markdown
# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

- [ ] **[Extract] suggestedFunctionName** — File: `path/to/file.ts`, ~line N
  What the block currently does and why extraction helps. Include the proposed signature:
  `function suggestedFunctionName(param: Type): ReturnType`
  Note where the extracted function should live (same file, nearby util, etc.).
```

Order by value: prefer extractions that most improve readability at the call site. Aim for 5–15 items; skip trivial one-liners unless the name would genuinely clarify intent.

After writing `TODO.md`, print a one-paragraph summary of the patterns you found most often.
