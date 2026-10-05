<!-- Source: .ruler/skill-notes/burn-down-code-smells.md.template -->

# burn-down-code-smells — design notes

## Why the skill exists

On 2026-09-27 the user had a reconciled clean-code review of the repo (now
`docs/scratchpad/clean-code-principles-review-2026-09-27.md`). They asked for a 10-hour unattended
run to audit the codebase practice by practice and fix what it found, never harming performance,
readability or maintainability. The run was later extended by five hours. Tracking issue #2376 holds
the ledger and the morning report.

The run merged 64 PRs (#2377–#2441). Each had an independent Codex review and green CI, and each was
verified on `main` after merging. It also produced `docs/CODING-STANDARDS.md` (#2423), which the
user approved. The user then asked for the run to be repeatable as a skill; this is that skill.

## Shape, and what each piece bought

**Audit, then ship, in one sitting.** The existing audit lifecycle (`audit-code` → `vet-audits` →
`fix-audits`) stages findings in `docs/AUDIT.md` and issues. For a time-boxed unattended run, that
staging is overhead: every finding here was re-verified by the implementer anyway. The user chose
one tracking issue plus free-form PRs over one issue per finding.

**Auditors write to files and reply in 25 lines.** Fourteen auditors ran in five waves; the finding
counts per auditor were 11, 9, 15, 9, 12, 6 / 8, 10, 10 / 12, 8, 10, 8, 8. The orchestrator read a
finding's full text only when it scheduled it. Its context survived 64 merges plus the unit reports.

**The waves:**

* **Principle waves** found the shared-rule and type problems.
* **Practice waves** (conventions, components, tests) found what the principles missed. Examples:
  two release-gate tests that passed with their deciding input removed (#2414); a hand-typed 24-hour
  review promise in 9 places (#2411); right-drag clearing the canvas (#2408).
* **Area passes** found area-specific bugs. Examples: AI auto-save marking failed saves as saved
  (#2430); a stalled GitHub call with no timeout (#2425); a regen that left rejected images tracked
  (#2435).

Each wave had diminishing but still real returns.

**Parallel lanes.** Most unit time is waiting on rival review and CI, about 20–60 minutes per unit,
so five to seven disjoint lanes turned about 13 hours of wall time into 64 merges. The campaign
improvised the lanes and its trial-merge rule, and both now live in `ship-campaign`'s `parallel=<n>`
mode. Its design history, including the user's conditions for adopting it, is in the ship-campaign
skill note. This skill invokes the mode rather than restating it. Audit clusters make admission
easy, because findings arrive already grouped by the files they touch.

**The rival earned its place.** Blocking findings it caught that the implementer had missed:

* a bad-shape job left pending forever (#2383);
* a flattened guard that announced mid-shake (#2390);
* a release-only startup chunk that the instrumented build hid (#2404);
* commented-out native registrations passing a guard (#2402);
* a dynamic `import()` escaping an import guard (#2406);
* an empty implementation path skipping a privacy check (#2411);
* a backslash re-arming escaped Markdown (#2427);
* stop-cue headroom for a capture bound (#2433);
* alternate helper `return`s escaping a payload guard (#2436).

## Failures that earned rules

* **A startup chunk slipped in.** #2391 added a runtime import from a startup module into a module
  that lazy code also imports. That made a new 158 B startup chunk, and no test noticed. It was
  found only by rebuilding all 23 merges. Fixed in #2404, which added the exact modulepreload pin;
  #2418 pinned native. Step 5 of the skill leans on those pins instead of repeating the bisect.
* **API usage limit, twice.** Every running agent died at once, about 04:40–06:10 and 09:25–11:10,
  with six or seven agents running. The first time, resuming each agent via `SendMessage` with its
  budget restated worked well, because agents keep their context. The second hit landed inside the
  deadline reserve and cost three units that hadn't opened PRs. Step 6 is the result. An open
  question: whether fewer lanes late in a run would avoid the second hit.
* **Copy decisions.** The rule "anything a parent or child sees is parked" held, with two exceptions
  the orchestrator authorised and reported. Settings' iPad Share step reused the banner's ADR-0039
  wording, and the privacy "Last updated" date was corrected per git. Both were facts already
  decided elsewhere, not new product calls. That is the line the skill draws.
* **A user decision's premise can be wrong.** In the second run (#2443), the user kept iOS Keychain
  backup migration "as a feature" because switching phones "just works". The rival found that an
  iCloud Backup's keychain restores only to the same device. The unit stopped short of merging and
  handed the decision back. Re-check a decision's factual premise before shipping copy built on it.
* **Line-cap edits serialized merges.** In #2443, every `tools/` unit that moved a
  `TOOLS_GRANDFATHERED_MAX_LINES` cap edited `eslint.config.js`. That made every other lane's
  catch-up `coupled`, and with runs queued about 10 minutes it was the run's main throughput limit.
  `ship-campaign`'s parallel reference now treats such a unit as an implicit holder.

## Third run, 2026-09-29 (#2467)

* **The usage limit counts agents, not lanes.** From 05:00, about 15 agents ran at once: seven
  auditors, six unit lanes, and two helpers one auditor spawned on its own. The limit ended all of
  them at 06:04 and reset at 09:50. After the resume only unit lanes ran, six or seven at a time,
  and 68 minutes later none had hit it. The parallel reference's Lanes rule now counts every agent.
  This run's data also argues for holding an audit wave until unit lanes free up, and for an audit
  brief line forbidding helpers; neither is in the skill.
* **Launch pacing.** Of eight worktree-isolated Claude Code agents launched in one message, four
  were refused with "git metadata that could not be resolved". Launched one per message, all
  started.
* **Nothing merged.** The auto-mode classifier denied the orchestrator's first merge (see the
  ship-campaign skill note's open questions), so every unit ended as an open, shippable PR. With
  nothing merged, the standards unit could not cite enforcement by path: `check:doc-refs` fails on a
  path that exists only on an unmerged branch. Step 7's "verified by path" assumes merged units.
* **Transient SSH refusals.** `git fetch` failed with "Permission denied (publickey)" in three
  worktrees between 10:50 and 10:55, while six lanes were active. Each succeeded on a retry within a
  minute.
* The unit brief's other new traps came from this run's units: a report sent in the same round as
  its first read, which skipped a unit until it was resumed; the `gh api` log flag (#2470); and the
  web-only storage-key guard (#2477).

## Fourth run, 2026-09-29 evening (#2500)

* **Unit-brief additions**, each from a unit's report: catch up with `main` once, after review
  (#2507 paid three CI rounds chasing it); read the gated `main` from `HEAD^2`, since worktrees
  share `refs/remotes/origin/main` (#2515), or from the branch's base when nothing merged (the
  rival's catch on this note's own PR, whose head had no catch-up merge); `post-review.mjs` blocks a
  finding naming an emulator serial (#2504); `ANDROID_HOME` pointed at an empty directory keeps a
  spawned test off real devices (#2524); `scrapbook:check` runs in `check:quality` but not
  `test:browserless`, which cost #2520 a CI repair after it edited a file a scrapbook page inlines.
  The orchestrator-side changes (integration trials, the serialized WebKit gate, usage thresholds)
  are in the ship-campaign skill note.
* **Not added:** parse a source-reading guard with the TypeScript compiler API rather than a regex.
  The rival caught regex guards fooled by comments or template literals twice (#2511, #2524), but
  `docs/CODING-STANDARDS.md` records it through #2516, open at the time, and units read that doc at
  setup.

## Fifth run, 2026-10-03/04 (#2650): everything outside web/, orchestrated by the Workflow tool

The orchestrator launched no lanes itself. It ran the campaign as two Workflow-tool rounds: a
deterministic script admitted file-disjoint units into six lanes (seven in round two), had a probe
agent read the usage meter before each launch, and serialized merges behind a promise lock, so one
merge agent ran at a time. Round one's 19 area auditors and 19 clusterers turned 206 findings into
154 units: 145 lane units and 9 cross-track renames to run alone. 29 merged and none was quarantined
before a refused merge paused the queue at 09:00 EDT. The 7 shippable PRs it held merged at
close-out, where the standards update and this section's self-heal also ran; 136 units never
started.

* **What worked:**
  * Admission by declared file set, plus one holder at a time for the hot shared files
    (`package.json`, `eslint.config.js`, the knip configs, the lockfile, `docs/ARCHITECTURE.md`,
    `.ruler/`, the workflows).
  * The promise-lock merge step: about five merges an hour (27 between 01:53 and 07:29 EDT), and the
    push `Tests` run on every merge commit finished green.
  * `needs-files`: a lane that needed a file outside its fence pushed what it had and returned, and
    the script re-admitted it with the wider fence once no lane held those paths (#2655, #2676).
  * The `unrelated` local-trial merge path, which replaced a CI round for #2675 and #2680.
* **What failed,** each now a rule in `ship-campaign` or its parallel reference:
  * The harness relays the user's request to every workflow agent as its only user voice. A haiku
    usage probe with no scope guard took that request as its own task: it ran `burn-down-audits` in
    the orchestrator's checkout, committed a checkpoint, pushed the orchestrator's branch, opened
    draft #2678 (closed), and started a canary burndown that died after one iteration. Round two ran
    its probes on sonnet, with a guard against skills, git, gh, npm, file edits and background
    commands.
  * Units told to stop at once returned usage readings they never took, stamped a day ahead, a day
    behind, and a year behind. Round two gated only on probe readings and validated their clocks.
  * No session cron fired while a workflow ran: the 02:23 one-shot and the hourly watchdog stayed
    silent for about ten hours, then fired from 09:37 on, once none was running. A background Bash
    command's completion did wake the orchestrator mid-round (23:18). Round one crossed the 02:20
    reset of the 5-hour window only because lanes were still in flight: each finished unit re-ran
    the launch probe, which saw the reset.
  * In round two the classifier refused a merge agent's merge of #2681 "[Merge Without Review]",
    after two merges. Round one relayed the user's request, which included "make sure to merge as
    you go", to all 389 of its agents. Round two was launched from the turn round one's completion
    notification started, so none of its 28 agents heard the user, and the harness tells each agent
    that approval quoted in its computed prompt carries no user authority. The queue paused until
    the user's close-out approval at 21:24, after which the orchestrator merged all seven held PRs
    itself, after one integration trial, by 21:31.
  * A merge agent's removal of an already-merged lane (`git worktree remove --force`,
    `git branch -D`), which the campaign's merge brief asked for, was flagged "[Irreversible Local
    Destruction]".
* **Draining.** Round one drained through a marker file that the unit brief told fresh units to
  check: each fresh unit read the brief and returned "not started". The script kept launching
  meanwhile, so the drain cost 131 short-lived unit agents. Round two read a control file
  (`{"drain": true}`, or a lane count) through the usage probe before each launch, which stops
  launches at the source.
* **Numbers.** The first wave took the 5-hour window from 3% to 66% and weekly usage from 17% to 34%
  (22:52 to 01:12 EDT) before any unit launched; six lanes reached the 85% launch gate at 02:04.
  After the 02:20 reset six lanes alone moved the 5-hour window from 1% to 56% by 06:54, about 12
  points an hour, and weekly usage about 3 points an hour. The Workflow tool runs at most min(16,
  CPUs − 2) agents at once, 8 on this 10-core host, and probes and merge agents share those slots
  with the lanes.
* **Unit lessons.** Units reported 223 lessons. The self-heal PR folded the durable ones into the
  unit brief and the parallel reference, and its body lists every drop with its reason.

## Rejected or deferred during the run

These are the "Considered and not adopted" list in `docs/CODING-STANDARDS.md`:

* a Blobs abstraction layer;
* moving env reads into `config.ts`;
* web fallbacks for native-only plugins;
* a shared typed platform fake;
* renaming colorSheet/magicSheet;
* tree-wide `@ts-check`;
* `max-lines-per-function` for `tools/`;
* an engine factory;
* a `StrokeOp` brush discriminant, deferred because it needs a quiet-host perf run.

## Unvalidated

* A second run. The waves' yields on an already-campaigned codebase are unknown. Expect later waves
  to find less, and consider starting at the area passes that weren't covered.
* The lane count under the usage limit. The first run sustained six to seven agents for about 6.5
  hours before its first hit; the third reached the limit in 65 minutes with about 15. The fifth
  measured six unit lanes alone at about 12 points of the 5-hour window an hour; seven are
  unmeasured.
* The fifth run's round-two fixes. No usage reset fell inside round two, so its in-round sleeper
  never ran. No user message was relayed to it either, so its probes' scope guard never met the
  request that sent round one's probe off task.
* Whether the skill should also stage its rejected findings into `docs/audit-deferred/decisions/`.
  This run recorded them only in the tracking issue and the standards doc.
