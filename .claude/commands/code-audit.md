# Code Audit

Do a comprehensive pass of the repository and produce a prioritized list of improvements in `docs/TODO.md`.

## How to audit

Read the codebase thoroughly — source files, config, tests, and build scripts. Evaluate each area against these lenses:

- **Performance** — unnecessary work, blocking operations, missed caching, wasteful renders/recomputations
- **Readability** — inconsistent naming, opaque logic, dead code, misleading abstractions
- **Maintainability** — duplicated logic, overly coupled modules, missing or wrong types, fragile assumptions
- **Architecture** — components doing too much, wrong layer of abstraction, missing seams for testing

Skip anything already tracked in an open issue or obviously intentional (e.g. a deliberate tradeoff with a comment explaining it).

## Output format

Write (or append) `docs/TODO.md` using this exact structure so that `/fix-next-todo-manual` and `/fix-next-todo-auto` can work through it item by item:

```markdown
# TODO

> Work through these items one at a time with `/fix-next-todo-manual`, or clear the whole list autonomously with `/fix-next-todo-auto`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

- [ ] **[Category] Short title** — File(s): `path/to/file.ts`
  What to change and why. Be specific enough that an AI can act on this without re-reading the audit.

- [ ] **[Category] Short title** — File(s): `path/to/file.ts`
  ...
```

Order items by impact: highest-value or lowest-risk changes first. Group related items together when the order doesn't matter. Aim for 5–15 items; skip trivial style nits unless they appear broadly.

After writing `docs/TODO.md`, print a one-paragraph summary of the top themes you found.
