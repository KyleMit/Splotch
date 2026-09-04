---
name: reconcile-with-main
description: Merge the latest main into a long-running branch and check the incoming commits for semantic conflicts — the ones that merge cleanly and still break the branch — not just git conflicts. Use when refreshing, syncing, catching up, or updating a branch that has been open a while against a main that has moved.
---

# Reconcile with main

`git merge` reports a conflict only where both sides edited overlapping lines. Everything else it
treats as agreement. But a branch that has been open a while and a `main` that has moved conflict
mostly in ways git cannot see: a renamed export the branch still calls, a changed default the branch
assumes, a convention the branch predates, work that landed upstream while the branch was solving
the same problem. Git merges all of that cleanly and hands back something that no longer holds
together.

**A clean merge is this skill's starting condition, not its success criterion.** "No conflicts" is
never the finding — it means step 3 has not run yet.

**Scope:** merge the current branch up to date and make it coherent again. This skill does not
rebase (see Notes), does not push, and does not open a PR.

## Step 1 — Survey before merging

Run the helper **first**. Once `origin/main` is an ancestor of `HEAD`, `<merge-base>..origin/main`
is empty and the incoming commits are no longer separable from the branch's own history — the facts
this whole skill reasons over are only cheap to collect on this side of the merge.

```
node .claude/skills/reconcile-with-main/survey.mjs
```

It fetches `origin/main`, then prints the incoming commits, the upstream renames and deletions, the
files **both** sides changed, and the files only upstream changed. `--json` for machine-readable
output, `--no-fetch` to skip the network on a re-run. The base is fixed at `origin/main` — see
Notes.

A file renamed on one side and edited on the other is still one file, so it is listed under both
sides as `new/path  (renamed from old/path)`. Read it at its **new** path; that is where the merge
put both sets of edits.

Commit or stash any working-tree changes before continuing — the survey warns when the tree is
dirty. If it reports zero incoming commits, the branch is already current and there is nothing to
reconcile; say so and stop.

## Step 2 — Merge, and resolve the textual conflicts

```
git merge origin/main
```

Resolve each conflict by keeping **both** intents rather than picking a side — a conflict means two
changes were made for two reasons, and choosing one silently drops the other. When you genuinely
cannot keep both, say which you dropped and why in the Step 6 report.

Two kinds of file are never hand-resolved — resolve their source and regenerate:

| Conflicted file                                                | Resolve instead                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm-lock.yaml`                                               | resolve `package.json`, then re-run `pnpm install`            |
| `CLAUDE.md`, `AGENTS.md`, `.claude/skills/`, `.agents/skills/` | resolve the `.ruler/` sources, then run `npm run ruler:apply` |

A hand-merged lockfile or a hand-merged concatenation of generated instructions produces a file the
generator would never emit; it passes review and fails the drift gate.

## Step 3 — The semantic pass

This is the point of the skill. For every incoming commit from the survey, ask: **does anything on
this branch call, extend, duplicate, or assume what this commit changed?** Two sweeps cover it.

**Sweep A — files both sides changed.** Read each one *as merged*, whole, not as a diff. Git spliced
two independent edits together; the question is whether the result is coherent, and a diff cannot
show you that. A renamed entry is the same file under two names — read it at the new path, and take
the old name into Sweep B as a string to grep for.

**Sweep B — upstream-only changes the branch depends on.** Take the renames and deletions from the
survey and grep this branch's own changed files for the old names. A call site added on this branch
after the merge base never appeared in any conflict, because upstream never touched a line that did
not exist yet.

What you are looking for in both sweeps:

| Class                    | What upstream did                                       | Why the merge stayed quiet                                           |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
| **Stranded call site**   | renamed, moved, or deleted an export                    | the branch's call sites are new lines upstream never touched         |
| **Changed contract**     | same name, new signature, return shape, or default      | the call still type-checks and is now wrong at runtime               |
| **New convention**       | added a lint rule, shared constant, token, or primitive | the branch predates it, so its code quietly violates it              |
| **Overlapping refactor** | restructured a file the branch also edited              | both hunks applied; the branch's code is now in the file's old idiom |
| **Duplicated work**      | already solved what the branch is solving               | the merge kept both solutions                                        |
| **Contradicting tests**  | changed a test or fixture the branch also changed       | each side passes alone and they assert opposite things               |
| **Split constant**       | changed one side of a deliberately duplicated value     | the other copy still holds the old value across a bundle boundary    |

Fix what you find. A finding you decide not to fix still goes in the report.

## Step 4 — Repo-specific traps

These merge clean every time and are worth checking by name:

* **ADR number collision** — both sides adding a record claims the same four-digit prefix. `npm run
  check:adrs`.
* **Generated-instruction drift** — either side touching `.ruler/`, skill forks, or a direct
  provider package. `npm run ruler:check`.
* **Dependency placement** — a package that moved between `dependencies` and `devDependencies`
  upstream, or one this branch added on the wrong side. The split is inverted here: `dependencies`
  is what the Netlify build needs (ADR-0070). CI installs everything and stays green; the deploy
  breaks.
* **Split constants** — a value duplicated across a bundle boundary, where the two copies cannot
  import each other and a drift-guard test enforces agreement
  (`web/src/lib/state/saveFolder.svelte.ts` and `web/src/app.html` are the standing examples). If
  one side moved, the guard test is what tells you.
* **Backlog overlap** — the issue this branch closes may already be closed on `main`, or its
  approach superseded by an ADR that landed since the merge base: `git log
  <merge-base>..origin/main -- docs/adrs/`.
* **Skill registry** — a skill added, renamed, or removed on either side must still be registered
  exactly once in the `skills-guide` skill.

## Step 5 — Verify

```
npm run check && npm test
npm run format:check && npm run ruler:check && npm run check:adrs
```

`npm test` is the full suite CI runs — unit, asset-pipeline, repo-script, and E2E — and the
repo-script tier is where most of Step 4 is actually enforced. Run it, don't infer from a green
type-check.

## Step 6 — Report

Three buckets, and **name any bucket that is empty rather than omitting it** — an unmentioned bucket
reads as "not checked", which is exactly the ambiguity this skill exists to remove:

1. **Merged clean** — how many commits came in, and what areas they touched.
2. **Textual conflicts** — each one, and how it was resolved.
3. **Semantic conflicts** — each one: the incoming commit, what it broke, and the fix. Include the
   ones found and deliberately left alone, with the reason.

Close with the verification results. If the branch was far enough behind that Step 3 could only be
sampled rather than covered, say so plainly and say what was sampled — a partial pass reported as a
full one is worse than not running the skill.

## Notes

* **The base is `origin/main` everywhere, deliberately.** Step 2 merges it, Step 4 reads its ADR
  log, and the report describes it, so a survey-only base flag would analyze one incoming range and
  then merge and review a different one — a report that reads as authoritative and describes the
  wrong branch. Reconciling against some other base is a different job than this skill; do it by
  hand rather than by pointing this one somewhere new.
* **Merge, don't rebase**, unless the user asks. A long-running branch is usually pushed and
  possibly reviewed; rebasing rewrites the history a reviewer has already read and forces every
  other checkout of it to recover. The merge commit is also what makes the incoming set legible
  afterwards.
* **Never push without being asked.** Reconciling is local work; the user decides when it lands.
* If the merge is a genuine mess — many commits behind, wide overlap, unclear intent on both sides —
  stop and report that before spending an hour producing a plausible-looking resolution. An honest
  "this needs a decision from you, here is the shape of it" is a valid outcome.
