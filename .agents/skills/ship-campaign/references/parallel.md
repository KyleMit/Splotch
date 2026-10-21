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

When the campaign's PRs target a long-running branch instead of `main`, read every `main` in this
file as that branch, and run the survey with `--base=<branch>`.

This replaces `ship-issue` step 5's merge. **Every** catch-up with `main` goes through the
`reconcile-with-main` survey first, including the first one after review, so a coupled change
another lane landed never arrives through an ungated merge. The worker, after review:

1. Runs `git fetch origin main` and then the survey. It follows the verdict:
   * `coupled`: run `reconcile-with-main` on the branch;
   * `adjacent`: merge, and read the upstream diff of each module the survey lists, including those
     reached through a re-exporting barrel;
   * `unrelated`: merge.

   Every path, `reconcile-with-main` included, merges the exact commit the survey covered: the first
   incoming commit it lists (in full as `incoming[0].sha` under `--json`), as `git merge <sha>`.
   Another lane's fetch can move the shared `origin/main` between the survey and the merge, and
   `git merge origin/main` would then bring in commits nobody surveyed.
2. Commits the merge, pushes, and waits for CI on that head.
3. Stops at shippable and reports `ready: PR <n>, head <sha>, gated main <sha>`. It copies both SHAs
   from command output. The gated `main` is `git rev-parse HEAD^2` after a catch-up merge, or the
   branch's base (`git merge-base HEAD origin/main`) when `main` hadn't moved and there was nothing
   to merge. Never read it from `origin/main` itself: worktrees share that ref, so another lane's
   fetch can move it mid-gate.

What the survey can't see (a shared string, an event name, a storage key) still escalates the merge
to `coupled` when it turns up in the reading or in a failing check. The worker records which path it
took in the PR body.

The reverse also happens: a verdict can be `coupled` for purely mechanical reasons. The survey
treats `pnpm-lock.yaml` and `eslint.config.js` as convention sources, so once a merge changes
either, every later catch-up across it surveys `coupled`. That includes a dependency override or a
moved line cap. Such a verdict calls for the full reconcile pass, which is usually quick. It is not
a reason to leave a PR behind, and it keeps that PR out of an integration trial until the PR has
caught up past the change.

**Catch up once.** The worker runs this gate once, after review, and reports ready against the
`main` it merged, even if `main` moves again while its CI runs. Chasing each later move costs a CI
round per move; later moves are the orchestrator's to cover, with an integration trial or a resume
(below).

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
4. If `main` moved, run an integration trial (below), or resume that worker with the new `main`
   commit. A resumed worker repeats the gate against it, and the orchestrator moves on to the next
   ready PR. When the survey says `unrelated`, the worker may run a local trial merge of the
   surveyed commit (`git merge --no-commit --no-ff <sha>`, then `npm run check`, `npm run lint`, and
   its targeted tests) instead of a CI round. It then aborts the trial and reports ready against the
   new commit. A second consecutive move takes the CI round.

**When a Workflow agent performs the merge**, launch its workflow in the turn the user's explicit
merge approval started, never in one a task notification or timer started. The harness relays only
the user message behind the launch, and tells each agent that approval quoted in its computed prompt
carries no user authority. In #2650 round one was launched in reply to a request that included "make
sure to merge as you go", relayed it to all 389 of its agents, and merged 27 PRs. Round two was
launched from the turn round one's completion notification started, so none of its 28 agents heard
the user at all; after two merges the classifier refused the third "[Merge Without Review]",
although that PR had a rival review, green CI and a clean local trial. That the missing user voice
caused the refusal is likely but unproven, since two merges passed without it. A refusal pauses the
queue either way (`ship-campaign`, "Invocation and authority").

**The integration trial.** When `main` has moved under one or more ready PRs, the orchestrator can
gate them itself instead of resuming each worker:

1. Survey each PR's head against the current `origin/main`. Only PRs whose verdict is `unrelated`
   join the trial; admission already keeps their file sets and contracts disjoint from each other.
2. In a scratch worktree at that `origin/main`, merge the joining heads, then run `npm run check`,
   `npm run lint`, and `npm run test:browserless` once, plus what each PR's own gate needs beyond
   that tier: its targeted tests (Playwright specs included), and `npm run build` and
   `npm run build:cap` when it touched a startup module. A PR whose coverage the trial can't give is
   left out and resumes its worker instead.

   Reuse a trial worktree only after `git merge --abort` (when a merge is in progress) and
   `git reset --hard`. Before the gate, check that the trial's changed files
   (`git diff --cached --name-only <base>`) equal the union of the joining PRs'
   `git diff --name-only <base>...<head>`. `git checkout` silently keeps staged changes that don't
   conflict: on 2026-10-21 an unaborted trial's staged edits from another PR rode into the next
   trial's tree, and only that comparison caught it.
3. On green, merge the PRs one at a time with `--match-head-commit` at the heads the trial covered,
   re-reading each PR's live state first and verifying each merge after, as steps 2 and 3 of the
   merging list do. A PR that moved, or work that reached `main` from outside the trial, voids the
   trial for what is left.

A PR whose survey says `adjacent` or `coupled` still takes its worker's CI round. A trial failure is
diagnosed head-versus-base (`ship-campaign` step 3) before any unit is blamed: run the failing test
alone on the trial merge and on plain `main`. Record each trial in the ledger: its base, the PRs it
covered, and the commands' results.

Read `uptime` before blaming a timeout. Lanes' builds and emulators share the host with the trial,
and Vitest's 5-second default fails tests that pass alone. On 2026-10-21, at load averages from 40
to 178, 14 lint-guard tests and several RSD-tier tests timed out in trials, and every one passed
when rerun alone. Run the trial's Vitest tiers with `--maxWorkers=4`, rerun each timed-out file
alone before diagnosing it, and record both runs.

When a priority PR is nearly ready and another unit must edit the same file after it, hold the other
green PRs for a few minutes. The priority PR then merges against the `main` its CI covered, with no
extra CI round.

Because the orchestrator is a single process, nothing merges between its fetch and its merge except
work outside the campaign. The post-merge CI run on `main` is the backstop for that. Leave each
lane's worktree and local branch in place after its merge; the remote branch goes with the merge's
`--delete-branch`. The auto-mode classifier flagged both ways of removing lanes inside a campaign:
an orchestrator's end-of-campaign batch removal of its own clean lane worktrees (2026-09-30), and a
merge agent's `git worktree remove --force` plus `git branch -D` of an already-merged lane
("[Irreversible Local Destruction]", 2026-10-04). The morning report lists the lanes for
`prune-git-workspace`.

A lane's rebuildable build output is different, and goes after its merge. Lanes that build natively
leave DerivedData, Gradle output and extracted builds behind; on 2026-10-21 they grew the shared
scratchpad to 41 GB, and deleting finished lanes' rebuildable output freed 19 GB. Have each lane
build into its own named directory under one parent, so its weight is one place to measure. After
the lane's PR merges, delete that directory by relative path, keeping logs, screenshots and evidence
(`docs/PROFILING-CAMPAIGNS.md`, "Build caches fill the host disk").

**Point lanes at the base, never at another lane's PR branch.** The merge's `--delete-branch`
removes the branch, so a lane told to read a design note from an open PR loses it the moment that PR
merges. On 2026-10-21 one merge removed the branch two lanes had been told to read. Once the PR
merges, send the lane the base path to read instead (`git show origin/<base>:<path>`).

**Tests before pushing.** Each unit runs the applicable full tier that isn't host-exclusive before
it pushes: `npm run test:browserless` (the Vitest tiers plus the API smoke on the unit's own
`SMOKE_PORT`), because guard tests read files far from the ones a unit edits. The full Playwright
suite and the full `npm test` stay host-exclusive. CI runs them on every head, and when a unit
genuinely needs one locally, the orchestrator schedules it while no other lane is running tests.

## Lanes

* **Start at two or three.** Raise toward six only while the queue keeps producing disjoint units
  and lanes are mostly waiting on review and CI. From Claude Code, launch worktree-isolated lanes
  one per message; launched together, some are refused with "git metadata that could not be
  resolved".
* **A worktree-isolated lane cannot run a brokered command that invokes git in the rival's
  worktree.** The lane's isolation refuses it, and a command whose text merely contains "git" (a
  `github` path, for example) was refused too. Brief each lane to run the equivalent read-only
  command in its own worktree, at the head under review, and answer the request with that output:
  the handler line's closing `broker.mjs reply`, run on its own with the lane's exit code and output
  file.
* **Every agent shares one account usage limit**: each lane, each auditor, and each helper an agent
  spawns. Reaching it ends them all at once, so size the lanes by every agent running, and re-read
  the usage windows before each launch against the thresholds agreed at preflight (`ship-campaign`
  step 1). Late in a run, prefer finishing open PRs over opening new lanes, so an interruption can't
  eat the reserve.
* **When a Workflow script orchestrates the lanes** (the Workflow tool, #2650):
  * The harness relays to every agent the user message whose turn launched the workflow, as that
    agent's only user voice, and tells it that message wins over its own computed prompt. So say in
    each prompt that the relayed request describes the whole campaign, name the agent's one part,
    and forbid what a helper that only reads doesn't need: skills, `git`, `gh`, `npm`, file edits,
    background commands. Don't give a helper the smallest model. A haiku usage probe with neither
    guard took "burn down code smells" as its own task: it ran `burn-down-audits` in the
    orchestrator's checkout, pushed the orchestrator's branch, opened draft #2678, and started a
    canary burndown.
  * Gate only on readings from agents whose job was to take them, and validate each one: a
    percentage from 0 to 100, and a clock that never runs backwards or leaps further ahead than
    probes are ever apart. Units told to stop at once returned usage readings they never took,
    stamped a day ahead, a day behind, and a year behind. A script that kept the newest reading
    would have frozen its gates and its clock.
* **Stagger native builds across lanes.** At 07:05Z on 2026-10-21 the host's load average reached
  178 from an iOS simulator build's parallel clang jobs, a Gradle build, two emulator boots and a
  2,000-stroke emulator run, all at once. Admit one native build at a time, and count emulators
  against memory: with five emulators on a 32 GB host, one went `offline` and hung. Emulator
  mechanics (stopping a hung one, a second instance of one AVD, where AVDs survive) are in
  `tools/device-parity/README.md`.
* **Never in parallel:**
  * `profile=performance` units, the device rig, and performance captures;
  * the full Playwright suite and full `npm test`;
  * units that depend on each other. Those are a serial chain, or `create-stacked-prs` if the user
    asks for one.
* **A red `main` pauses every lane's merge** (step 4), not their work. Lanes resume merging after
  the trial-repair unit lands.
* **After an interruption,** re-derive the map from GitHub (open PRs, their heads and files, what
  merged) before resuming any lane, and restate each resumed unit's time budget. A unit resumed or
  re-admitted in a new worktree meets two leftovers of its old lane, which stays in place:
  * A branch can be checked out in only one worktree, so the new one checks out a differently named
    local branch tracking `origin/<branch>` and pushes with `git push origin HEAD:<branch>`.
  * The rival's ledger keys a review by the handler's worktree root (`ledgerKey` in
    `tools/rival-agent/ledger.mjs`), so round two would meet the code with a cold reviewer. Copy the
    round-one record to the new root's key before launching round two.

## Codex workers

A lane can also be a sandboxed Codex process the orchestrator drives itself:
`codex exec --sandbox workspace-write` rooted at the worker's own worktree, with
`-c sandbox_workspace_write.network_access=true` and `approval_policy="never"`. It suits open-ended
work such as a bug hunt, whose output is files for the orchestrator to review and commit. What that
sandbox reached on macOS, measured 2026-10-21:

* **Reaches** `adb`, including the physical devices on the host, so brief the worker to pin
  `-s <serial>` and name the devices it may touch. It also reaches servers it starts on local ports
  in the range its brief names.
* **`xcrun simctl` is refused**: CoreSimulator's XPC service is denied. Give iOS simulator work to a
  Claude lane.
* **No Playwright browser launches** (a Mach-port denial). Run
  `npx playwright run-server --port <port> --host 127.0.0.1` outside the sandbox, from a checkout on
  the same Playwright version, and brief the worker to call
  `chromium.connect('ws://127.0.0.1:<port>/')` (`firefox` and `webkit` the same way). Record the
  server's PIDs with the orchestrator's other processes, and stop them at the end.
* **`gh` is refused** under `approval_policy="never"`, which is wanted: the worker writes findings,
  and the orchestrator files them.
* **`git commit` fails**: a linked worktree's gitdir lives under the main checkout's
  `.git/worktrees/`, outside the writable root. Brief the worker to leave its changes uncommitted,
  and commit them through the usual review gate.

Keeping one running:

* **A flagged turn needs a fresh thread.** OpenAI's filter ended two QA turns with "This content was
  flagged for possible cybersecurity risk": one scripted request interception and forced IndexedDB
  quota errors, the other traced raw input events (`getevent`, `uinput`). Resuming the flagged
  thread risks flagging it again. Start a fresh `codex exec` that continues from the worker's own
  status and findings files. Frame its brief as functional QA of this app on localhost and its own
  emulators, and describe fixtures in user terms ("the device's storage is full").
* **A resume can need its retries.** `codex exec resume` on a long thread printed
  `Reconnecting... n/5 (stream disconnected before completion…)` four times, fell back from
  WebSockets to HTTPS, and then ran. Wait for the retries to run out before treating it as dead.
* **When the work needs what the sandbox refuses** throughout (`gh`, the simulator, a commit), make
  it a Claude lane instead, or run the worker as a full session through `orchestrate-sessions`,
  which relays prompts and reports through the user.

## Ledger

Add three columns: the lane, the declared file set, and the merge path taken (unrelated / adjacent /
coupled). The morning report states the lane count used and every coupled merge, with what
`reconcile-with-main` found.
