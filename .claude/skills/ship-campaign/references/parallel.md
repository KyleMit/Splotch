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

   A unit whose file set can't be predicted from its spec runs alone, as in the serial loop.
3. **The merge order.** A worker can't wait on the orchestrator mid-run, so the order is enforced by
   each worker's compare-before-merge step (below): no PR merges against a `main` it hasn't gated.
   The orchestrator records each merge as it lands, and re-reads `origin/main` before every
   admission and broadcast, so it always knows what `main` contains.
4. **Broadcasts.** After every merge, it sends each still-running unit anything that changes that
   unit's assumptions: a renamed identifier, a new lint rule or guard, a moved budget pin or cap, a
   new convention. The unit applies it before its own merge gate. A unit that finds it needs a file
   outside its declared set stops that part and reports it. The orchestrator grants the file if it's
   free, or the part becomes a leftover.

## The per-unit merge gate

This comes on top of `ship-issue` step 5. **Every** catch-up with `main` goes through the
`reconcile-with-main` survey first, including the first one after review: a coupled change another
lane landed must never ride in on an ungated merge.

1. **Catch up.** After review, `git fetch origin main` and run the survey. Then:
   * If the relation is `coupled`, run `reconcile-with-main` on the branch.
   * If it is `adjacent`, merge and read the upstream diff of each module the survey lists.
   * If it is `unrelated`, merge.

   Commit the merge, push, and wait for CI on that head.
2. **Compare before merging.** Immediately before `gh pr merge`, fetch again.
   * If `origin/main` is still the commit your last green CI run already contains, merge.
   * If it moved, run the survey against the new `main`:

     | Relation    | The unit does                                                                                                                                                                                                        |
     | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
     | `unrelated` | A local trial merge (`git merge --no-commit --no-ff origin/main`), then `npm run check`, `npm run lint`, and its targeted tests. If green, abort the trial and repeat step 2.                                        |
     | `adjacent`  | The same trial, plus reading the upstream diff of each module the survey lists (including those reached through a re-exporting barrel). If both are clean, abort and repeat step 2; otherwise treat it as `coupled`. |
     | `coupled`   | Back to step 1: reconcile, commit, push, and wait for CI.                                                                                                                                                            |

   If `main` moves under step 2 twice in a row, commit the merge and take a CI round instead of
   trialling a third time.

The survey's verdict is what reserves `reconcile-with-main`'s full semantic pass for merges that
need it; genuinely unrelated units skip a pass that would only confirm they're unrelated. What the
survey can't see, such as a shared string, an event name, or a storage key, still escalates the
merge to `coupled` when it turns up in the trial or in the reading. The window between the final
fetch and the merge is seconds, and the post-merge CI run on `main` is its backstop. The unit
records which path it took in the PR body.

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
