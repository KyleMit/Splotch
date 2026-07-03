# Fix Next TODO (Manual)

Interactive mode — one item per invocation; the user reviews the diff and commits. For the
autonomous branch-and-PR variant that works through the whole file, use `/fix-next-todo-auto`.

Read `docs/TODO.md` and implement the **first listed item** in full. Then:

1. Remove that item from `docs/TODO.md` (delete the bullet and its body — leave the header and instructions block intact).
2. Run any relevant type checks or tests that touch the changed files.
3. At the end of your response, print a short suggested commit message

**Do not run `git add` or `git commit` yourself.** The user will review the diff and commit manually.
