# Parallel mode — `parallel=<n>`

Up to `n` units in flight at once, each in its own worktree, each still shipping and merging on its
own. Units spend most of their time waiting on rival review and CI, so on a queue of independent
units, lanes multiply throughput without changing what each PR is.

The serial loop's guarantee has to survive this: a mistaken premise is caught in the PR that
introduced it, and never compounds through work built on top of it. Parallel mode keeps that
guarantee by admitting only units that can't build on each other, and by making the orchestrator the
one party that sees everything in flight.

## The orchestrator

In parallel mode this session implements nothing. It owns four things, and it keeps each one
current:

1. **The ownership map.** For every in-flight unit it records:
   * the unit's **declared file set**: the files its spec names, their colocated tests, and the doc
     rows it will touch;
   * the **exports and contracts it will change**: renamed or deleted identifiers, changed
     signatures, changed defaults, and new lint rules or conventions.

   The map lives in the ledger, one row per unit.
2. **Admission.** A unit launches only when all of these hold:
   * **Its file set is disjoint** from every in-flight unit's set.
   * **No dependency either way.** It doesn't import a module another in-flight unit changes the
     contract of, and no in-flight unit imports one it will change. Check the import lines of both
     sides' files, and follow re-exporting barrels. For example, a unit that changes
     `storageKeys.ts` is coupled to one that imports `$lib/storage`, which re-exports it.
   * **Hot shared files have one holder.** `docs/ARCHITECTURE.md`, `eslint.config.js`,
     `package.json` and its lockfile, and the `.ruler/` sources and their generated output collide
     even across unrelated work. Each is held by at most one unit at a time. A unit that needs one
     waits, or leaves that edit as a drafted leftover.
   * **Predict implicit holders.** A unit that grows or shrinks any `tools/` file listed in
     `TOOLS_GRANDFATHERED_MAX_LINES` holds `eslint.config.js`, because it moves that file's cap. A
     unit that adds an npm script holds `package.json`. Each such edit turns every other lane's
     catch-up survey `coupled`, which costs that lane a real merge and a full CI round.

   A unit whose file set can't be predicted from its spec runs alone, as in the serial loop.
3. **The merges.** The orchestrator performs every merge itself, one at a time, so no two merges can
   race. A worker takes its PR to shippable, then stops. It reports the PR, its head commit, and the
   `main` commit its gate covered (below), and the orchestrator merges it from the steps under
   "Merging".
4. **Broadcasts.** After every merge, it sends each still-running unit anything that changes that
   unit's assumptions: a renamed identifier, a new lint rule or guard, a moved budget pin or cap, a
   new convention. The unit applies it before it reports ready. A unit that finds it needs a file
   outside its declared set stops that part and reports it. The orchestrator grants the file if it's
   free, or the part becomes a leftover.

## The per-unit merge gate

This replaces `ship-issue` step 5's merge. **Every** catch-up with `main` goes through the
`reconcile-with-main` survey first, including the first one after review, so a coupled change
another lane landed never arrives through an ungated merge. The worker, after review:

1. Runs `git fetch origin main` and then the survey. It follows the verdict:
   * `coupled`: run `reconcile-with-main` on the branch;
   * `adjacent`: merge, and read the upstream diff of each module the survey lists, including those
     reached through a re-exporting barrel;
   * `unrelated`: merge.
2. Commits the merge, pushes, and waits for CI on that head.
3. Stops at shippable and reports `ready: PR <n>, head <sha>, gated main <sha>`. It copies both SHAs
   from command output.

What the survey can't see (a shared string, an event name, a storage key) still escalates the merge
to `coupled` when it turns up in the reading or in a failing check. The worker records which path it
took in the PR body.

## Merging

The orchestrator handles ready PRs one at a time:

1. Run `git fetch origin main`.
2. Re-read the PR's live state against `ship-issue` step 5's merge gate, because a review can land
   after the worker reported ready without either SHA moving. Check that:
   * the PR isn't a draft;
   * no review or thread is newer than the ready report, and no blocking thread is unresolved;
   * every applicable check on the head is finished and green.

   If any fails, resume the worker with what failed, and move on to the next ready PR.
3. If `origin/main` is still the gated commit, merge with
   `gh pr merge <n> --merge --delete-branch --match-head-commit <head>`, then verify it from live
   state (the live-state check in `ship-campaign` step 2). The `--match-head-commit` flag refuses a
   PR whose head moved after its gate.
4. If `main` moved, resume that worker with the new `main` commit. The worker repeats the gate
   against it, and the orchestrator moves on to the next ready PR. When the survey says `unrelated`,
   the worker may run a local trial merge (`git merge --no-commit --no-ff origin/main`, then
   `npm run check`, `npm run lint`, and its targeted tests) instead of a CI round. It then aborts
   the trial and reports ready against the new commit. A second consecutive move takes the CI round.

When a priority PR is nearly ready and another unit must edit the same file after it, hold the other
green PRs for a few minutes. The priority PR then merges against the `main` its CI covered, with no
extra CI round.

Because the orchestrator is a single process, nothing merges between its fetch and its merge except
work outside the campaign. The post-merge CI run on `main` is the backstop for that. After a merge,
the orchestrator resumes the worker once to detach its worktree and delete the local branch, or
leaves that to the end of the campaign.

**Tests before pushing.** Each unit runs the applicable full tier that isn't host-exclusive before
it pushes: `npm run test:browserless` (the Vitest tiers plus the API smoke on the unit's own
`SMOKE_PORT`), because guard tests read files far from the ones a unit edits. The full Playwright
suite and the full `npm test` stay host-exclusive. CI runs them on every head, and when a unit
genuinely needs one locally, the orchestrator schedules it while no other lane is running tests.

## Lanes

* **Start at two or three.** Raise toward six only while the queue keeps producing disjoint units
  and lanes are mostly waiting on review and CI.
* **Every lane is a full agent.** An account usage limit ends all lanes at once. Late in a run,
  prefer finishing open PRs over opening new lanes, so an interruption can't eat the reserve.
* **Never in parallel:**
  * `profile=performance` units, the device rig, and performance captures;
  * the full Playwright suite and full `npm test`;
  * units that depend on each other. Those are a serial chain, or `create-stacked-prs` if the user
    asks for one.
* **A red `main` pauses every lane's merge** (step 4), not their work. Lanes resume merging after
  the trial-repair unit lands.
* **After an interruption,** re-derive the map from GitHub (open PRs, their heads and files, what
  merged) before resuming any lane, and restate each resumed unit's time budget.

## Ledger

Add three columns: the lane, the declared file set, and the merge path taken (unrelated / adjacent /
coupled). The morning report states the lane count used and every coupled merge, with what
`reconcile-with-main` found.
