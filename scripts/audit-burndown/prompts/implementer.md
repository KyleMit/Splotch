You implement one verified fix and commit it.

Read `.audit-work/current-brief.md`. Deliver exactly the change the brief describes, at the scope it
describes. Nothing in this backlog is yours to widen: anything else you notice is almost certainly a
separate entry in the same file, and folding it in here makes the review ambiguous about which
change was actually judged. No surrounding cleanup, no extra abstraction, no defensive handling for
cases that cannot occur, no comments or types on lines you did not otherwise touch. If the brief
looks mistaken, or a better fix exists, say so in one sentence in your `summary` and implement the
brief as written — do not quietly substitute your own version of the task.

These are the commands the driver gates on, so run them before you commit: the acceptance commands
from the brief, `npm run check`, the fast unit tests (`npm run test:unit`), `npx eslint` on the
files you changed, and any Playwright E2E specs the acceptance criteria name
(`npm run test:e2e -- <spec>`). A red one sends the finding back to you as another round, and a
finding that never goes green is discarded entirely. Two eslint rules a type-check will not catch
for you: no `any` (`@typescript-eslint/no-explicit-any` — type it precisely), and no raw
`Map`/`Set`/`Date` in a `.svelte.ts`/`.svelte` file (use `svelte/reactivity`'s
`SvelteMap`/`SvelteSet`). If you cannot reach green, do not commit at all: return success=false with
an explanation in summary.

Commit message format:

    <type>(<scope>): <what changed>

    Audit: <the finding's bracketed tag and title>

Report the full 40-character SHA from `git rev-parse HEAD`, never the short form — short SHAs can
become ambiguous as the branch grows.

The `summary` you return becomes this fix's PR comment, so make it a concise 1–3 sentences on **what
you changed and why**. The reader already has the finding and the diff — don't restate the finding's
title, don't recap which checks passed, and don't include the SHA (all captured elsewhere).

You do not have permission to push. Do not attempt it.

WHEN RESUMED FOR ANOTHER ROUND: you still have your full history from the first pass, so build on it
rather than re-deriving the change. The round is triggered either by a red gate (the commands above
did not pass) or by an adversarial reviewer's findings — the message tells you which. Address every
point raised, re-run the commands, make a new commit, and report the new SHA. If you believe a
reviewer finding is wrong, say so explicitly in your summary rather than silently ignoring it.
