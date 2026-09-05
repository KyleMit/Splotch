---
name: improve-performance-matrix
description: Drive Splotch's deployment-target performance matrix from current evidence to zero scoreable red cells through product improvements and faithful recaptures, keeping harness work subordinate to and immediately useful for a named product experiment. Ships causal product clusters as reviewed, merge-ready stacked PRs with a green tip. Use for sustained performance improvement; use capture-performance-matrix for capture-only snapshots or validation.
---

# Improve performance matrix

Run a fresh evidence-led campaign against the authoritative deployment-target matrix. The campaign
ends only when every current, scoreable cell on a **release-gate row** is green, unless the user
sends a control message that explicitly requests a merge-ready stopping point. ADR-0156 defines the
rows: the physical iPad (web and native) and the physical Android phone (web and native) are the
release gate; Mac rows are a regression tripwire; simulator and emulator rows are advisory and never
count toward completion.

This is the improvement sibling of `capture-performance-matrix`: that skill owns comparable capture
mechanics and matrix refreshes; this skill owns inventory, causal attribution, product optimization,
capture-path repair or faithful recapture, stacked delivery, review, and campaign control.

An explicit user request to run this improvement campaign authorizes its normal in-repository
branches, commits, pushes, draft PRs, stack links, and `start-capture-session` device reservation.
Merely loading the skill for planning or reference does not. Neither form authorizes merging.

## The campaign advances one reviewed PR at a time

The scheduling loop is:

```text
bounded product pass → verify → commit → open/link PR → rival round 1 → address → rival round 2 → address → green CI → next pass
```

Opening and reviewing the PR are part of completing the product pass, not end-of-campaign shipping.
Do not begin another accepted treatment, put a child PR above the current one, or accumulate more
product commits while either required rival round or CI is outstanding. This ordering lets an early
finding remain in the PR that introduced it; postponing review until several layers exist forces an
ordinary local correction into a sweep-up PR at the stack tip and lets a mistaken premise compound
through later experiments.

## Product work is the deliverable

This is not a harness-improvement campaign. Splotch's profiling harness is mature and presumed
sufficient. After one current, scoreable failure is reproduced on a calibrated physical release
gate, the next meaningful output is a product hypothesis and A/B experiment. Harness work may be
part of that experiment when it directly improves diagnosis, execution, or validation; broader
capture coverage, richer metadata, another metric, or generalized tooling is not an alternative to
the product loop.

Read the whole published matrix at the start, but do not block the first product experiment on
making every stale target current. Current coverage of the release-gate rows remains part of the
completion gate (ADR-0156); advisory rows are recaptured for breadth when the rig is free, never as
a completion requirement. Coverage is not a prerequisite for beginning product work when a
calibrated physical target already provides a reproducible failure. Stale advisory Simulator,
emulator, and desktop rows cannot delay that first experiment. Recapture a stale authoritative
target first only when its result is necessary to distinguish the selected hypothesis or establish a
calibrated failure.

Treat `tools/perf/`, matrix schemas and generators, capture transports, scorers, evidence formats,
and profiling documentation as stable supporting infrastructure while working a product cluster. A
harness change is allowed when all of these are true:

1. The live campaign ledger already names the current product failure, the product hypothesis, and
   the before/after experiment the harness change will serve.
2. The existing path was attempted or inspected closely enough to show a concrete shortcoming for
   that experiment. The change may repair invalid or incomparable evidence, add a diagnostic needed
   to distinguish the hypothesis, or make the faithful A/B materially more reliable. Convenience,
   polish, future reuse, or an isolated advisory-runtime anomaly is not enough.
3. The proposed change is the smallest useful slice, and the same cluster uses it immediately;
   generalized cleanup and adjacent improvements become issues rather than campaign commits.
4. The campaign immediately returns to the same product experiment, records its product outcome, and
   does not promote the harness change itself as a delivered causal cluster.

If harness work starts expanding beyond what the named experiment will use immediately, stop and ask
the user before expanding scope. A checkpoint with current product reds and no product outcome is an
**inventory checkpoint; campaign incomplete** — never a completed improvement, shipped cluster, or
merge-ready campaign result.

Keep the PR ledger honest about allocation. At every status update, list product commits, harness
repair commits, and capture/evidence-only commits separately, name the product experiment each
harness commit served, and say explicitly when no product optimization has landed.

## Start from current truth

Do not inherit a red-cell count, causal theory, target list, or optimization priority from an older
campaign prompt, PR body, report, or memory.

1. Preserve unrelated local work. Do not stash, delete, clean, commit, or absorb it. If the working
   tree is not clean, stop and tell the user rather than carrying their changes onto a campaign
   branch.
2. Inspect open performance PRs and stacks before creating anything. If an unfinished campaign
   already owns the matrix work, verify its branch, PR, and checkpoint state and resume it instead
   of duplicating it. Otherwise fetch the trunk, verify prior campaign PRs are merged, switch to and
   fast-forward the trunk, then create a fresh campaign branch.
3. Treat the PR stack as the campaign's working structure, not an end-of-campaign packaging step.
   Open the first draft PR as soon as its first coherent commit is pushed. For every later accepted
   cluster, branch from the current stack tip, push and open its next draft PR immediately, and link
   the expanded chain. Complete both rival rounds, address their findings, and get the current PR's
   CI green before starting another cluster. Never accumulate multiple accepted clusters on one
   campaign branch for later decomposition; rejected or inconclusive experiments stay local and are
   backed out. The campaign invocation already authorizes these draft PRs and stack links, so do not
   wait for a later request to create them.
4. Keep the current stack-tip PR body as the live campaign ledger, copying the ledger forward
   whenever the stack grows; older PR bodies remain scoped snapshots. Record the baseline inventory,
   shipped clusters, current cluster, remaining work, exact product commits, raw artifact
   provenance, correctness evidence, and matrix status.
5. Read the `profiling`, `capture-performance-matrix`, `testing`, and `create-stacked-prs` skills.
   Read `mobile` before any iOS, Android, or Capacitor work.
6. Locate the authoritative matrix inputs, source manifest, and generator from the current
   repository rather than carrying paths or output names forward from an older campaign. Discover
   generator-owned JSON, Markdown, and HTML outputs from the generator or directory instructions.
   `scrapbook/performance/` contains several matrices: identify the deployment-target matrix by its
   scope, source manifest, and generator rather than assuming the newest or first `data.json` is
   authoritative.

Resolve the authoritative deployment-target matrix first, then inventory every published cell in its
`data.json` before editing. This is a read-only classification pass, not a requirement to recapture
every stale cell before product work. Classify each cell by:

* target and deployment class;
* web or native runtime;
* orientation and theme;
* drawing brush, undo case, or discrete action;
* failed metric and raw values;
* scoreability and control validity;
* capture age and exact product commit;
* capture source, runner, input transport, and raw provenance;
* current versus preserved capture;
* comparable versus historically invalid instrumentation.

Report these categories separately:

* genuine current product failures;
* stale captures needing faithful replacement;
* preserved historical captures;
* invalid or unscoreable modes;
* incomparable captures;
* runner or capture-path blockers.

Generate counts from live data, not prose. Before treating any red cell as a current product
problem, run `npm run check:matrix-staleness -- --base=origin/main` — a red cell describes the
commit it was captured at, and the product moves underneath it (the 2026-08 campaign wrote five
candidate implementations against a gate a prior extraction had already fixed; the check needs no
device and answers in seconds). The explicit `--base` matters: the default is `HEAD`, which from a
campaign branch counts the branch's own commits as drift and reports STALE wrongly. Cells the check
marks stale go in the recapture bucket, not the product bucket.

The same check applies to numbers a campaign **prompt** calls established. A prompt is written from
the matrix and the sessions before it, so its "measured" figures carry the commit they were measured
at, not the trunk's; on 2026-09-02 a prompt's central cause (an ~86 ms `clear coloring page` raster
on every physical iPad cell) had been fixed on `main` the day before by a commit the prompt's author
never saw, and a full layer was built and A/B-tested against it before a concurrent control on
`main` showed the cell already green. Run the staleness check and one concurrent control on the
trunk before building on a prompt's figures, however authoritative their framing.

As soon as a current calibrated physical failure exists, turn the remaining genuine failures into a
compact causal-cluster inventory with a representative cell, affected blast radius, evidence
confidence, and next discriminating product experiment. Select one and start its product A/B.
Prioritize a systemic cause that plausibly explains several cells over isolated tail-chasing, but
let current evidence choose the order. Continue stale-target recapture for breadth and completion;
do not use it as a blanket reason to postpone the selected experiment.

## Non-negotiable evidence rules

Never make the matrix green by:

* relabeling a failure, weakening a gate, or changing scoreability to exclude it;
* reducing visual, input, drawing, native, or export fidelity;
* skipping actions, brushes, themes, orientations, runtimes, or difficult samples;
* publishing only a lucky retry or discarding a faithful red result;
* copying a pass from another target or calibration tier;
* treating stale, incomparable, or invalid evidence as current product approval.

Frame pacing and readiness are separate acceptance dimensions. The action scorer's `passed` verdict
covers first response and presented-frame continuity; `readyMs` records when the action-specific
observable outcome actually arrived. A cluster is not accepted from a greener frame verdict alone.
For every discrete-action A/B:

* compare readiness P50/P95 from the same action, target, runtime, transport, polling cadence, and
  ready predicate, alongside first-frame and post-action distributions;
* reject a candidate that moves required work beyond the scored activity window, weakens the ready
  predicate, or delays observable completion merely to protect animation frames;
* treat a readiness regression larger than the capture path's measured resolution/noise as a product
  tradeoff, not a performance win. Keep it only with explicit user approval and record the frame
  benefit, latency cost, and why the deferred work is non-critical;
* when an intentionally deferred action remains, apply an activation/busy state synchronously and
  keep it visible until completion. A non-idempotent activation must be single-flight; repeatable,
  idempotent choices such as selecting the current color need no artificial input lock;
* capture normal-speed before/after video or GIF for any changed temporal behavior, cropped to the
  control and affected surface, before asking for the appearance verdict.

The committed matrix reports readiness P95 but does not assign one universal gate: “ready” ranges
from a local state flip to a full-resolution download, and remote drivers add different polling
floors. That is why the comparable A/B requirement above is mandatory rather than an invitation to
ignore the number. If a capture path cannot resolve the proposed readiness difference, it cannot
approve that experiment; use a finer in-page mark or another faithful path immediately serving the
named product hypothesis.

Stale red cells require faithful fresh captures. Harness work follows the product-first gate above:
repair a demonstrated measurement defect or add a targeted diagnostic or validation capability only
when the named product experiment will use it immediately. Do not create a freestanding harness
roadmap inside the campaign. Promote representative raw captures with
`npm run perf:evidence:keep -- --corpus=<dir> --campaign=<name> --product-commit=<capture-product-sha>`
so they remain rescoreable, and trial a scorer change across that preserved corpus with
`npm run perf:rescore -- --corpus=perf-profiles/evidence/<name>` before treating it as valid.
Preserve or strengthen coverage and add a regression test for the exact measurement failure.

Preserve drawing output, undo semantics, coloring selection and clearing, settings and persistence,
rotation restoration, export fidelity, native/web parity, accessibility, and toddler-facing visual
and interaction feedback. A faster incorrect interaction is a rejected experiment.

That rule has a scheduling consequence: **when a candidate change alters what the user sees — brush
texture, deposition, color, animation — get the human appearance judgement before spending device
time on its timing campaign.** Two 2026-08 candidates produced fidelity-passing, CI-green,
independently reproduced timing wins that were then declined on appearance ("reads as a glitch
rather than as ink drying… whatever the frame numbers say", ADR-0147); the wasted captures were the
only waste class in that campaign where every measurement was correct. A screenshot or short
recording for the user costs minutes and no device occupancy; ask for the verdict early and run the
timing campaign on candidates that already look right.

## Physical-device boundary

Before the first physical capture, use `start-capture-session`, read `docs/PROFILING-CAMPAIGNS.md`
completely, and run:

```sh
npm run perf:preflight -- --wake-android --verify-android-input --verify-ios-launch
```

Then follow these invariants:

* discover and prove device endpoints and ports dynamically;
* serialize all physical-device captures and keep the host otherwise quiet;
* never kill, attach to, or reuse a foreign process merely because it owns a preferred port;
* build fresh instrumented artifacts from the exact product commit before measuring;
* bind every folded capture to its product commit, built entry, runner, transport, target, and raw
  source;
* never commit device identifiers, local capture scaffolding, credentials, transient reports, or
  machine-specific state;
* ask once with the exact action only when unlocking, Guided Access, XCTest authorization, or
  another genuinely human-only device interaction blocks progress;
* capture one known-good control cell after the preflight goes green, before the first experimental
  capture — a cell whose expected value is on record. A control that lands in band proves the whole
  path (build, serve, transport, fidelity, scoring) in one capture; a surprising first experimental
  number on an unproven path is undiagnosable.

Simulator, emulator, desktop, and uncalibrated results are advisory unless the current profiling
rules explicitly give them approval authority (ADR-0156 names the release-gate rows). Use them to
reject or narrow hypotheses; do not let their passes overrule a calibrated physical failure.

## Work one causal cluster at a time

For each cluster:

1. Reproduce the smallest representative failure on the current product and capture path.
2. Inspect raw traces, activities, input delivery, engine marks, frame intervals, layout, paint,
   raster, GPU/compositor work, and capture metadata — not only the final pass boolean.
3. Attribute the expensive frame or invalid result to a concrete product, runner, transport, or
   instrumentation cause. Separate first-action latency from post-action work and physical
   corroboration from simulator-only behavior.
4. If attribution remains ambiguous, first use existing narrowly scoped diagnostics or a supported
   user-flow A/B control. Any harness edit must pass the product-first direct-utility gate and must
   immediately return to this same cluster. Do not change the scorer to hide ambiguity.
5. Make one causally coherent product change. Back out rejected or inconclusive experiments instead
   of stacking speculation; a measured rejection is still the product outcome that closes the
   experiment loop.
6. Run focused correctness tests and the exact failing performance case, plus `npm run check`,
   `npm run lint`, and `npm run format:check` before any commit that touches code or scripts.
7. Compare raw before/after traces and generated summaries from faithful runs. Preserve the first
   valid red after a change rather than retrying it away.
8. Verify the real app visually and behaviorally, including every interaction contract the change
   can affect.
9. Broaden across all affected themes, orientations, brushes/actions, and web/native targets.
10. Recapture complete affected modes, not only the original sample.
11. Fold only faithful, comparable captures into the authoritative matrix. Mark every captured row
    the campaign did not recapture `preserved`, then regenerate with
    `npm run gen:performance-matrix -- --strict <manifest>`; that command runs the staleness check
    in-process against the manifest it resolved, and `--strict` is what turns a row left behind into
    a failure rather than a report (ADR-0159). Validate every generator-owned output and prove
    JSON/Markdown/HTML agreement where present.
12. Commit and push each causally coherent verified product improvement separately, update raw
    evidence and remaining status in the current stack-tip PR body, and proceed only from a clean
    tree. A directly useful harness change may precede it in the same cluster, but never substitutes
    for the product outcome it exists to support.

## Stack and review discipline

Deliver causally distinct product clusters as sequential PRs and link the real chain with
`gh stack`. Do not create a standalone harness-improvement cluster unless the user explicitly asks
for one; an incidental repair stays subordinate to the product cluster it unblocks. Every PR body
includes:

* root cause and causal scope;
* exact raw before/after metrics and artifact provenance;
* exact product commit used for each capture;
* capture target, runtime, runner, transport, and fidelity verdict;
* correctness, visual, parity, persistence, rotation, and export checks that apply;
* current matrix status and explicitly remaining clusters.

Obey the `create-stacked-prs` invariant: once another PR sits above a branch, never add a fix to
that lower PR. Put review fixes and newly discovered issues in the current stack-tip PR when they
remain coherent, or create a feedback/findings PR stacked from the tip. Never rewrite lower history
for an ordinary finding.

Every newly opened PR gets **two** fresh independent cross-runner review rounds before another stack
layer is started:

1. Use `run-rival-agent` with `--pr <that PR>`: serve the rival's broker requests as the native
   handler, post its findings with the poster, then validate and address every posted finding.
2. Start a second fresh `run-rival-agent` round after round one's disposition, even when round one
   found nothing. Address its findings before moving the checkout or starting the next layer. If
   round two causes a material fix, run another fresh verification round over that fix.

Two rounds means two completed rival invocations; CI, same-session self-review, a skipped automation
job, and rerunning tests do not count. Do not postpone the reviews until wrap-up. If the required
reviewer runner is unavailable, stop adding stack layers and report the blocker.

For each delivered cluster:

1. use `address-pr-review` for every inline thread, review summary, and conversation comment;
2. reproduce findings, fix or rebut them with evidence, reply, and resolve every thread;
3. complete both rival rounds and run an additional verification round after any material round-two
   fix;
4. follow `pr-screenshots` when a PR changes visible UI;
5. keep the current stack tip green, verify the live PR head matches the tested SHA, and do not
   start the next stack layer until its independent review is complete and the current tip's CI is
   green.

Do not merge unless the user separately authorizes merging. A campaign completion or wrap-up request
authorizes making the stack merge-ready, not landing it.

## Control messages

Treat these as steering inside the active campaign, not as replacements for the campaign objective.

* **status** — report the overall campaign status in commentary, including the freshly established
  baseline; product clusters and PRs already shipped or merge-ready; product, harness-repair, and
  capture/evidence-only commits as separate lists; the product experiment each harness repair
  served; the exact current in-flight cluster, phase, branch/PR, and latest evidence; remaining
  current red, stale, incomparable, unavailable, and blocked cells; current runner/device blockers;
  and the best evidence-based estimate of work left. State explicitly when no product optimization
  has landed. Re-read live matrix, git, PR, review, and CI state where it may have changed. Do not
  send a final response, stop tools, pause captures, or treat the question as turn-terminating.
  Continue the in-flight campaign after answering.
* **pause** — stop selecting new clusters, finish or safely back out the current experiment, leave
  the current branch and PR evidence coherent, push a recoverable checkpoint, and report the exact
  resume point. Do not present a paused partial cluster as merge-ready.
* **resume / continue** — verify live matrix, branch, stack, artifact, device, and CI state before
  resuming the recorded cluster. Do not assume the previous process, port, build, or capture remains
  valid.
* **wrap up** — stop selecting new clusters, but completely finish the current in-flight cluster as
  shippable work: resolve attribution, land or back out the experiment, run focused correctness and
  exact performance validation, complete affected-mode recapture when needed, fold only faithful
  evidence, regenerate authoritative outputs, commit and push, update the live campaign ledger,
  complete review and feedback, move every delivered PR out of draft, confirm the stack tip is
  green, and explain any surviving lower-PR red by naming the PR that carries its fix. Confirm every
  delivered PR is ready to merge. Put additional findings in the current stack-tip PR when coherent
  or in a new feedback/findings PR stacked from the tip. Never amend a lower PR. Then report both
  the merge-ready delivered scope and the freshly counted campaign remainder; do not claim the
  overall matrix is complete when cells remain.

A casual progress question such as “what is running?”, “where are we?”, or “how much is left?” is a
**status** message. Phrases such as “finish what is in flight,” “stop after the next complete PR,”
or “make this mergeable” are **wrap up** messages unless the user explicitly asks to continue to
zero.

## Optional Goal mode

The workflow must not depend on provider-specific goal tracking. The matrix, raw artifacts, git
history, live PR stack, and campaign ledger remain the durable source of truth.

When Goal mode is available, use it only if the user explicitly requests Goal mode for this
campaign. Create one objective for zero current, scoreable red cells on the release-gate rows
(ADR-0156) and omit a token budget unless the user supplies one. Goal mode is useful for automatic
continuation and for keeping the terminal condition visible across long tool runs. It is a poor fit
for an ordinary campaign that may receive `pause` or `wrap up`: it supports completion or genuine
blocking, not a merge-ready pause, permits only one active goal, and does not replace external
checkpoints. Never mark the goal complete for an improvement, a green cluster, or a wrap-up that
leaves current scoreable reds on a release-gate row.

## Completion gate

Complete the full campaign only when:

* a freshly regenerated matrix has zero current, scoreable red cells on the release-gate rows
  (ADR-0156), and no release-gate cell that is unscoreable because its instrument is uncalibrated —
  such a cell counts as red until the runtime is calibrated or recorded as uncalibratable; simulator
  and emulator red is rendered and reported, never counted as remainder, and a Mac cell counts only
  when it turned red on a change that was green on the trunk;
* every genuine product red on a release-gate row (or a Mac cell that turned red on a change that
  was green on the trunk) that existed during the campaign has a recorded product outcome — a
  verified improvement or an empirically rejected candidate followed by the next hypothesis; a
  campaign with such reds and only harness, documentation, or capture commits is incomplete;
* every stale or unavailable scoreable cell on a release-gate row has a faithful current
  replacement; a stale advisory row is either recaptured or marked preserved so it stops claiming
  currency;
* capture-path blockers on release-gate rows are fixed and every affected release-gate target is
  recaptured; an advisory target's blocker is filed as an issue, and a genuinely unsupported mode
  stays explicitly unscoreable rather than being counted as a pass;
* correctness, accessibility, visual behavior, native/web parity, persistence, rotation, undo, and
  export fidelity remain intact;
* every authoritative generated output agrees;
* every campaign PR is pushed, reviewed, linked into the stack, out of draft, and ready, with the
  stack tip green and any surviving red on a lower PR explained by the PR carrying its fix;
* every review comment is answered and resolved;
* the stack-tip PR summarizes the baseline clusters, root causes, fixes, before/after evidence,
  capture provenance, product commits, and final matrix status;
* `self-heal` has applied durable campaign and harness lessons in the homes future runs will read —
  and any newly earned capture-path mechanism (a way a capture produces a plausible wrong number or
  a plausible absence) lands in `docs/PROFILING-CAMPAIGNS.md` specifically, the catalogue every
  future capture session must read. The 2026-08 campaign routed such mechanisms there same-day for
  ten days and then stopped in its final wave, losing two; the catalogue is a named self-heal
  target, not an optional home.

**Every completion or merge-ready claim rests on its authoritative check, re-run after the last
change the claim covers — never on a proxy.** Name the check beside the claim: matrix state cites
the freshly regenerated outputs, stack linkage cites the chain verification, "CI green" cites the
run for the exact head SHA, "rig left as found" cites the current holder, not the port. A claim
whose own verification failed — or ran before the last change — is withdrawn, not softened. The
2026-08 corpus has five completion claims resting on proxies (a stack membership asserted 23 s after
its own check failed; a nine-PR stack called merge-ready on per-PR CI alone), every one with the
authoritative check available and cheaper than the retraction.

Ask the user only for genuinely human-only device interaction, missing authorization, or a choice
that materially changes product behavior or campaign scope. Otherwise operate autonomously until the
completion gate or a control message is satisfied.
