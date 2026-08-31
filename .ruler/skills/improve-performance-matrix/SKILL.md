---
name: improve-performance-matrix
description: Drive Splotch's deployment-target performance matrix from a fresh cell-by-cell inventory to zero current, scoreable red cells through product improvements, capture-path repairs, and faithful recaptures, shipping each causal cluster as reviewed, merge-ready stacked PRs with a green tip. Use for a sustained performance-improvement campaign; use capture-performance-matrix for capture-only snapshots or validation.
---

# Improve performance matrix

Run a fresh evidence-led campaign against the authoritative deployment-target matrix. The campaign
ends only when every current, scoreable cell is green, unless the user sends a control message that
explicitly requests a merge-ready stopping point.

This is the improvement sibling of `capture-performance-matrix`: that skill owns comparable capture
mechanics and matrix refreshes; this skill owns inventory, causal attribution, product optimization,
capture-path repair or faithful recapture, stacked delivery, review, and campaign control.

An explicit user request to run this improvement campaign authorizes its normal in-repository
branches, commits, pushes, draft PRs, stack links, and `start-capture-session` device reservation.
Merely loading the skill for planning or reference does not. Neither form authorizes merging.

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
3. Open a draft campaign PR as soon as the first coherent commit is pushed. Keep the current
   stack-tip PR body as the live campaign ledger, copying the ledger forward whenever the stack
   grows; older PR bodies remain scoped snapshots. Record the baseline inventory, shipped clusters,
   current cluster, remaining work, exact product commits, raw artifact provenance, correctness
   evidence, and matrix status.
4. Read the `profiling`, `capture-performance-matrix`, `testing`, and `create-stacked-prs` skills.
   Read `mobile` before any iOS, Android, or Capacitor work.
5. Locate the authoritative matrix inputs, source manifest, and generator from the current
   repository rather than carrying paths or output names forward from an older campaign. Discover
   generator-owned JSON, Markdown, and HTML outputs from the generator or directory instructions.
   `scrapbook/performance/` contains several matrices: identify the deployment-target matrix by its
   scope, source manifest, and generator rather than assuming the newest or first `data.json` is
   authoritative.

Resolve the authoritative deployment-target matrix first, then inventory every cell in its
`data.json` before changing product or harness code. Classify each cell by:

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

Generate counts from live data, not prose. Before editing code, turn the failures into a compact
causal-cluster inventory with a representative cell, affected blast radius, evidence confidence, and
next discriminating experiment. Prioritize a systemic cause that plausibly explains several cells
over isolated tail-chasing, but let current evidence choose the order.

## Non-negotiable evidence rules

Never make the matrix green by:

* relabeling a failure, weakening a gate, or changing scoreability to exclude it;
* reducing visual, input, drawing, native, or export fidelity;
* skipping actions, brushes, themes, orientations, runtimes, or difficult samples;
* publishing only a lucky retry or discarding a faithful red result;
* copying a pass from another target or calibration tier;
* treating stale, incomparable, or invalid evidence as current product approval.

Stale red cells require faithful fresh captures. A harness or scorer change is allowed only when raw
evidence proves the measurement is wrong. Promote representative raw captures with
`npm run perf:evidence:keep -- --corpus=<dir> --campaign=<name>` so they remain rescoreable, and
trial a scorer change across that preserved corpus with
`npm run perf:rescore -- --corpus=perf-profiles/evidence/<name>` before treating it as valid.
Preserve or strengthen coverage and add a regression test for the exact measurement failure.

Preserve drawing output, undo semantics, coloring selection and clearing, settings and persistence,
rotation restoration, export fidelity, native/web parity, accessibility, and toddler-facing visual
and interaction feedback. A faster incorrect interaction is a rejected experiment.

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
  another genuinely human-only device interaction blocks progress.

Simulator, emulator, desktop, and uncalibrated results are advisory unless the current profiling
rules explicitly give them approval authority. Use them to reject or narrow hypotheses; do not let
their passes overrule a calibrated physical failure.

## Work one causal cluster at a time

For each cluster:

1. Reproduce the smallest representative failure on the current product and capture path.
2. Inspect raw traces, activities, input delivery, engine marks, frame intervals, layout, paint,
   raster, GPU/compositor work, and capture metadata — not only the final pass boolean.
3. Attribute the expensive frame or invalid result to a concrete product, runner, transport, or
   instrumentation cause. Separate first-action latency from post-action work and physical
   corroboration from simulator-only behavior.
4. If attribution remains ambiguous, add narrowly scoped diagnostic evidence or a supported
   user-flow A/B control. Do not change the scorer to hide the ambiguity.
5. Make one causally coherent change. Back out rejected or inconclusive experiments instead of
   stacking speculation.
6. Run focused correctness tests and the exact failing performance case, plus `npm run check`,
   `npm run lint`, and `npm run format:check` before any commit that touches code or scripts.
7. Compare raw before/after traces and generated summaries from faithful runs. Preserve the first
   valid red after a change rather than retrying it away.
8. Verify the real app visually and behaviorally, including every interaction contract the change
   can affect.
9. Broaden across all affected themes, orientations, brushes/actions, and web/native targets.
10. Recapture complete affected modes, not only the original sample.
11. Fold only faithful, comparable captures into the authoritative matrix. Regenerate it with
    `npm run gen:performance-matrix -- <manifest>`; that command runs the staleness check in-process
    against the manifest it resolved. Validate every generator-owned output and prove
    JSON/Markdown/HTML agreement where present.
12. Commit and push each causally coherent verified improvement separately, update raw evidence and
    remaining status in the current stack-tip PR body, and proceed only from a clean tree.

## Stack and review discipline

Deliver causally distinct clusters as sequential PRs and link the real chain with `gh stack`. Every
PR body includes:

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

For each delivered cluster:

1. get an independent empirical review: from Codex, launch Claude through `run-claude`; otherwise
   run `leave-pr-review` in a fresh independent session or hand the stack off with
   `create-pr-feedback-handoff`;
2. use `address-pr-review` for every inline thread, review summary, and conversation comment;
3. reproduce findings, fix or rebut them with evidence, reply, and resolve every thread;
4. rerun the same reviewer after material fixes;
5. follow `pr-screenshots` when a PR changes visible UI;
6. keep the current stack tip green, verify the live PR head matches the tested SHA, and do not
   start the next stack layer until the current tip's CI is green.

Do not merge unless the user separately authorizes merging. A campaign completion or wrap-up request
authorizes making the stack merge-ready, not landing it.

## Control messages

Treat these as steering inside the active campaign, not as replacements for the campaign objective.

* **status** — report the overall campaign status in commentary, including the freshly established
  baseline; clusters and PRs already shipped or merge-ready; the exact current in-flight cluster,
  phase, branch/PR, and latest evidence; remaining current red, stale, incomparable, unavailable,
  and blocked cells; current runner/device blockers; and the best evidence-based estimate of work
  left. Re-read live matrix, git, PR, review, and CI state where it may have changed. Do not send a
  final response, stop tools, pause captures, or treat the question as turn-terminating. Continue
  the in-flight campaign after answering.
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
campaign. Create one objective for zero current, scoreable red cells and omit a token budget unless
the user supplies one. Goal mode is useful for automatic continuation and for keeping the terminal
condition visible across long tool runs. It is a poor fit for an ordinary campaign that may receive
`pause` or `wrap up`: it supports completion or genuine blocking, not a merge-ready pause, permits
only one active goal, and does not replace external checkpoints. Never mark the goal complete for an
improvement, a green cluster, or a wrap-up that leaves current scoreable reds.

## Completion gate

Complete the full campaign only when:

* a freshly regenerated matrix has zero current, scoreable red cells;
* every stale or unavailable scoreable cell has a faithful current replacement;
* capture-path blockers are fixed and every affected target is recaptured; a genuinely unsupported
  mode stays explicitly unscoreable rather than being counted as a pass;
* correctness, accessibility, visual behavior, native/web parity, persistence, rotation, undo, and
  export fidelity remain intact;
* every authoritative generated output agrees;
* every campaign PR is pushed, reviewed, linked into the stack, out of draft, and ready, with the
  stack tip green and any surviving red on a lower PR explained by the PR carrying its fix;
* every review comment is answered and resolved;
* the stack-tip PR summarizes the baseline clusters, root causes, fixes, before/after evidence,
  capture provenance, product commits, and final matrix status;
* `self-heal` has applied durable campaign and harness lessons in the homes future runs will read.

Ask the user only for genuinely human-only device interaction, missing authorization, or a choice
that materially changes product behavior or campaign scope. Otherwise operate autonomously until the
completion gate or a control message is satisfied.
