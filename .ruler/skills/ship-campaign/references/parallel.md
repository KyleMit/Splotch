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
     sides' files.
   * **Hot shared files have one holder.** `docs/ARCHITECTURE.md`, `eslint.config.js`,
     `package.json` and its lockfile, and the `.ruler/` sources and their generated output collide
     even across unrelated work. Each is held by at most one unit at a time. A unit that needs one
     waits, or leaves that edit as a drafted leftover.

   A unit whose file set can't be predicted from its spec runs alone, as in the serial loop.
3. **The merge queue.** Merges happen one at a time, and the orchestrator records each as it lands,
   so it always knows what `main` contains.
4. **Broadcasts.** After every merge, it sends each still-running unit anything that changes that
   unit's assumptions: a renamed identifier, a new lint rule or guard, a moved budget pin or cap, a
   new convention. The unit applies it before its own merge gate. A unit that finds it needs a file
   outside its declared set stops that part and reports it. The orchestrator grants the file if it's
   free, or the part becomes a leftover.

## The per-unit merge gate

On top of `ship-issue` step 5. After review, the unit merges `origin/main` into its branch once and
waits for CI. If `main` moves again before it merges, the unit runs the `reconcile-with-main` survey
**before** merging, and follows its relation verdict:

| Relation    | The unit does                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unrelated` | A local trial merge (`git merge --no-commit --no-ff origin/main`), then `npm run check`, `npm run lint`, and its targeted tests. If green, abort the trial and merge the PR as it stood. |
| `adjacent`  | The same trial, plus reading the upstream diff of each imported module the survey lists. If both are clean, abort and merge; otherwise treat it as `coupled`.                            |
| `coupled`   | Run `reconcile-with-main` on the branch, commit the merge, push, and wait for CI again.                                                                                                  |

The survey's verdict is what keeps `reconcile-with-main`'s full semantic pass for merges that need
it. Genuinely unrelated units skip a pass that would only confirm they're unrelated. The post-merge
CI run on `main` is the backstop for the unrelated path. The unit records which path it took in the
PR body.

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
