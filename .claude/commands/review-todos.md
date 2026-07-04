# Review TODOs

Read `docs/TODO.md` and the current codebase, then validate each item against the actual code.

## For each item, decide: keep, enrich, or remove

**Keep and enrich** if the suggestion has genuine value — it improves performance, readability, maintainability, or architecture in a way that outweighs the cost of the change. For these items:
- Confirm the problem still exists in the current code (cite file + line)
- Add a concise implementation note if the fix is non-obvious or has a gotcha
- Adjust the priority/order if you find a dependency or sequencing issue

**Remove** if the item is:
- Already fixed in the current code
- A false positive (the "problem" is intentional or harmless in context)
- Too speculative, risky, or low-value to be worth an AI acting on it
- Superseded by another item on the list

## Output

1. Edit `docs/TODO.md` in place — remove the items that don't hold up, enrich the ones that do
2. In your response, print two short lists:
   - **Kept / enriched** — one line each, noting what insight you added (if any)
   - **Removed** — one line each, with the reason

Do not implement any of the changes — this is a review pass only. Implementation happens via `/fix-next-todo-manual` or `/fix-next-todo-auto`.
