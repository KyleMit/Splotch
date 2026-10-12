<!-- Source: .ruler/skill-notes/release-capture-session.md.template -->

# release-capture-session — design notes

Design history for the `release-capture-session` skill and its script,
`tools/perf/release-capture.mjs` (`npm run perf:release`). The skill and the code are the truth;
this records why they are shaped as they are.

## Why a script rather than prose

The judgement the release has to make — *this listener is ours, that one is not* — is the exact
judgement the concurrent-worktree rule exists to protect, and it is the one an agent working from
`lsof` output gets wrong under time pressure. `tools/lib/vite-server.mjs` records a real instance:
`freePort()` killed another worktree's preview before the build-identity assertion could say whose
it was. The preflight moved that judgement into pure functions (`lib/capture-readiness.mjs`) so it
could be tested without a device; the release does the same with `classifyProcess` and
`planRelease`.

`dev:stop` (`tools/stop-dev-servers.mjs`) was the obvious thing to extend and was rejected: it kills
every listener on a port with no ownership test at all, which is why `CLAUDE.md` bans running it in
a shared worktree. The release must be usable in exactly that setting.

## Why "ours" is wider than the preflight's rule

`perf:preflight` owns a listener only when its cwd is inside *this* checkout, because its job is to
route around everyone else. The request that produced this skill was to clear ports left by *any
current or previous session*, and previous sessions ran from other worktrees — on this machine, in
`<main>/.claude/worktrees/`, in `~/.codex/worktrees/<id>/Splotch`, and scattered across
`/private/tmp`. So ownership here is any path from `git worktree list`, plus the two runner
containers for a worktree pruned while its preview kept serving (the directory is gone from the
list; the process's cwd still names it), plus — for a pruned worktree outside every container — the
checkout a rig script on the process's own or an ancestor's command line runs from. That last rule
is what covers `/private/tmp/splotch-*`: the vite port holder's own command line names nothing of
this repo, but its parent's is `<root>/tools/run-web-tool.mjs vite preview`, and only this repo has
that script.

The first cut put the Codex container at `<main>/.codex/worktrees` by analogy with Claude's. The
rival review checked the live host and found Codex keeps them under the home directory, and that a
pruned one classified as foreign — the feature's central promise, broken for one runner. The lesson
is the general one: a path layout is a fact to look up, not to infer from a sibling's.

The boundary was checked against the one false positive that matters: `startsWith(root + '/')`
rather than `startsWith(root)`, so `Splotch-archive` is not `Splotch`. Ancestor command lines are
consulted only for the repo-script rule, so a foreign vite with an `npm run preview` parent stays
foreign.

## Why a failed adb step fails the run

The first cut exited zero whenever no process survived SIGKILL and no campaign blocked — so a run in
which every `adb` write failed still reported the rig released, and an agent reading the exit code
would have handed off a phone pinned awake. The rival review reproduced that with a fake `adb`
returning 17. Every device-side step now lands in `report.failures` and the exit code, and the
printed report gives them their own heading. The same review found the forward sweep removing rows
for *every* attached device; forwards are now scoped to the selected serial, and with several phones
attached and no `--android-serial` the device steps are refused rather than aimed at whichever was
listed first.

## Why a live campaign blocks instead of stopping

`docs/PROFILING-CAMPAIGNS.md` § "Stopping a campaign does not lose the cells it banked" is about a
campaign stopped *between* cells. A SIGTERM mid-cell loses the cell and can leave a half-written
report the resume logic then has to reason about. "Release everything from previous sessions" and
"stop the campaign someone is running right now" are different requests, and the second deserves an
explicit flag. `--stop-campaigns` is the flag; the skill tells the agent to pass it only when the
user has said the campaign is abandoned.

## Why Appium is drained before it is signalled

Same doc, § "Do not tear the devices down": killing an `iproxy` forward under a live session
stranded a WebDriverAgent process on the iPad, and the next launch failed with an error naming
neither the port nor the stale process. A `DELETE /session/:id` lets WDA exit on its own. The
session list needs `--allow-insecure=session_discovery`, which the preflight's Appium is not started
with — so on the current rig the drain will usually find zero sessions and fall through to SIGTERM,
which Appium's xcuitest driver also handles by ending its sessions. The drain is there for the
server that *does* expose the list, and costs one 2-second probe otherwise.

## Why the phone goes back to stock rather than to "what it was"

`--wake-android` sets a 30-minute timeout and never records the previous value. Restoring "what it
was" is not possible; restoring the stock 30 s is honest and documented in the constant's name.
`settings delete` was considered and rejected: the framework's fallback when the row is absent is
its own compiled default, which on this hardware is not the value a user would recognize.

The rotation pair (`accelerometer_rotation`, `user_rotation`) is included because the input and
rotation checks restore it themselves on a clean exit and not on a crash, and a phone pinned to
landscape with auto-rotate off is the kind of state nobody traces back to a perf session.

## The consequence the skill has to say out loud

The same doc records that a cleanup pass running `svc power stayon false` let the phone sleep and
lock, and the next session opened on an unusable device. The release does exactly that on purpose —
the user asked for a clean rig — so the skill's job is to make the cost explicit in the wrap-up
rather than to avoid it. `--host-only` is the middle path for someone who wants the ports back and
the phone held.

## Unvalidated

* Never run against a rig with a live Appium session that *does* expose session discovery; the drain
  path is exercised only by its timeout and error handling.
* `lsof -d cwd` on a process whose cwd was deleted: assumed to still print the path (macOS appends
  nothing for a directory that no longer exists); if it prints nothing, a pruned worktree's process
  classifies as `foreign` — the safe direction — and the command-line fallback usually catches it.
* The forward sweep keys on the devtools socket name. A rig forward to some other remote would be
  left; none exists today.
