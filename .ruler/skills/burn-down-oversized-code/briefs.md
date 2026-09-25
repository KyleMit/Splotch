# Agent briefs

The four briefs the burn-down-oversized-code coordinator hands its parallel agents. Fill each
`<placeholder>`, append the governing rule and the active mode's section from `SKILL.md` verbatim,
and ask for the listed fields back as structured output where the runner supports it. Every agent
works at the repo root of its checkout and follows CLAUDE.md.

Measure any unit with the skill's own script, so every agent counts the way CI does:

```
node .claude/skills/burn-down-oversized-code/measure.mjs <mode> --json
```

## Propose (read-only)

> Decide what to do about `<unit>` (`<mode>` mode; measured `<lines>` counted lines against a cap of
> `<cap>`; headroom `<headroom>`). You are read-only: edit, create, and commit nothing, and run no
> git command that changes state.
>
> Read the whole file, its tests, and its callers. Then propose either **split** — the exact seams,
> fewest and highest-quality first, one future commit per `<file | function>` — or **raise**, with
> why no seam is genuinely cleaner. You do not have to reach the soft target; say if a split still
> leaves the unit inside the headroom band, since that also needs a raise. Grep `tools/`, `docs/`,
> and `.ruler/` for anything that reads the moved code by path or name.

Return: `outcome` (split | raise); `seams[]` (name, kind, what moves, destination, signature, why
cleaner); `projected_lines`; `proposed_cap` (for a raise or a still-too-close split: length +
headroom); `hot_path` (is moved code reached per pointermove/resize/frame, and allocation impact);
`references` (tests, `tools/` guards, docs, and ADRs naming the moved code); `rationale`.

## Review (read-only, adversarial)

> A proposer looked at `<unit>` and proposed: `<proposal JSON>`. Read the code yourself — do not
> trust the proposal's description of it — and attack it. Is each seam genuinely cleaner, or
> counter-driven? Is behaviour preserved exactly: ordering, `$state` reactivity, listener lifetimes,
> timers, error paths? Does it add allocations on a hot path? Did the proposer miss a better seam,
> or is a raise the honest answer? Are the projected lengths plausible? Endorse, revise, or reverse
> it; your final fields are the plan of record. Read-only as above.

Return: `verdict` (endorse | revise | reverse); `final_outcome`; `final_seams[]`;
`final_projected_lines`; `final_cap`; `hot_path`; `references`; `critique`.

## Implement (own worktree)

> Implement the planned refactor of `<unit>` in this isolated worktree.
>
> 1. `git checkout -b <runner-prefix>/burn-down-<mode>-<plan-short-sha>-<slug> <plan-sha>` (every
>    campaign run commits a new plan, so its SHA keeps the branch unique even beside an earlier
>    run's unpruned leftovers), then `pnpm install --frozen-lockfile`.
> 2. Read the unit's section of `<plan-path>` (with `git show <plan-sha>:<plan-path>`), then the
>    code, its tests, and its callers.
> 3. Re-judge every seam against the governing rule. Drop a seam that turns out counter-driven, or
>    decline the whole unit — then commit nothing and return `status: declined` with the cap you
>    want. Add no seam beyond the plan unless it is small and clearly cleaner, and say so.
> 4. Implement, preserving behaviour exactly. Move comments with their code word for word. Add a
>    focused unit test only for a new pure helper or sub-factory, and report it.
> 5. Do **not** edit `eslint.config.js` and do **not** push. Make one commit per
>    `<file | function>`: a sentence-case imperative subject, a body saying what moved and why the
>    seam is real, and the repo's co-author trailer.
> 6. Gates — all of them, judged by exit code, fixed until green: `npm run check`; `npx eslint` and
>    `npx prettier --check` on touched files; `npm run lint:css` and `npm run lint:tokens` when a
>    `.svelte` or `.css` file changed; `npm run lint:dead`; `npm run test:unit`;
>    `npm run test:tools`; and `git grep` for every moved identifier and old path, updating
>    `tools/`, `docs/`, and `.ruler/` sources (then `npm run ruler:apply`). Other sessions share the
>    machine: re-run a failing file alone before believing a failure unrelated to your change. Use
>    no fixed ports and stop no process you did not start.
> 7. Re-measure the unit and every unit in its file.

Return: `status` (committed | declined | blocked); `branch`; `worktree` (absolute path); `shas[]`
(full 40-hex from `git rev-parse`); `lines_before`; `lines_after`; `longest_in_file_after`;
`cap_wanted` (if anything in the file is still inside the headroom band: length + headroom);
`seams_done[]`; `seams_dropped[]` with why; `new_tests[]`; `allocation_impact`; `gates` (each
command and its result); `reference_updates`; `notes`.

## Check (read-only, fresh)

> Review commit `<sha>` on `<branch>`, which refactors `<unit>` (was `<lines_before>`, now
> `<lines_after>`). Read it with `git show <sha>`, and the before state with
> `git show <plan-sha>:<path>`; the plan of record is the unit's section of `<plan-path>`. The
> implementer reported: `<seams_done, seams_dropped, allocation_impact, notes>`. Change no files and
> no git state.
>
> Judge, reading the code yourself: (1) counter-driven or genuinely cleaner, per seam — including
> whether any comment was dropped or reworded beyond a reference update, and whether statements were
> joined or chained to save lines; (2) behaviour preserved, and on a hot path allocations too; (3)
> conventions. `fix-needed` is for real defects, not taste.

Return: `verdict` (keep | fix-needed | revert-to-raise); `fixes` (exact file and change);
`counter_driven`; `gaming`; `behaviour`; `allocations`; `conventions`.
