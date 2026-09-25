# Codex performance-campaign session analysis

## Executive summary

This report integrates the completed analysis of the Splotch performance campaign from 2026-08-19
through 2026-08-31. Repository state is evaluated at `origin/main`
`b41dec23750f0c446a26f70cbc15561fe1fdfc22`.

The campaign's strongest durable improvement is evidence integrity. At the evaluated SHA, capture
identity, runtime, fidelity, scoreability, refresh regime, attribution, build identity, staleness,
and preservation are enforced well enough that the latest stale-manifest incident was rejected
rather than published (session `01a0556d-5324-7f02-b38f-4c9d0426d506`, L5326,
2026-08-31T10:37:49.986Z; L6147, 2026-08-31T11:35:33.814Z). The largest remaining gaps are
operational: long diagnostics without checkpoints, inconsistent process lifecycle, build/tool
contamination that is rejected only after consuming time, hidden nested failures, hand-copied
identifiers, execution-context mistakes, and path/shell mistakes.

Across the 27 core sessions, the authoritative elapsed union is **228 h 59 m** and the active
campaign-work union is **98 h 48 m** (**43.1%**). Profiling/measurement is the largest active
category at **51 h 05 m**. Evidence-attributable physical-device lower bounds are **22 h 29 m on the
one iPad**, **6 h 16 m on the one Android device**, **1 h 12 m simultaneous**, and **27 h 33 m on
either physical lane**. With exactly that hardware, a conservative overlap-discounted portfolio
could save **4–7 active hours** without reducing controls, repeats, fidelity gates, exact-commit
validation, or per-device serialization.

Five genuine-user procedures recur in at least five sessions and merit a new or improved skill:
execute a whole-stack PR review; create a richer PR-review handoff; start and hand off the physical
rig; produce a copyable continuation prompt; and report campaign status without stopping an active
campaign. Eight machine-launched checkout-review transcripts had no genuine-user prompt and are
excluded from these frequencies.

## Ranked findings

1. **Trustworthy admission, not lucky green results, was the campaign's most important durable
   result.** Invalid or stale captures occurred in 21 sessions, but the evaluated repository now
   fails closed across the relevant evidence contracts. A vacuous native capture once passed
   fidelity while painting nothing (session `7c37d255-8494-5f99-a40f-7dcee3e25013`, L2011,
   2026-08-27T03:07:55.294Z); the corpus ends with stale evidence being quarantined.
2. **The highest-cost unresolved work is operational rather than scorer semantics.** Missing
   checkpoints cost at least 123.6 evidenced active minutes; process/port/test lifecycle cost at
   least 102.8; build contamination cost at least 55.8. These are conservative floors, not elapsed
   unions and not additive.
3. **Causal-validation discipline remains the highest wrong-number risk.** Fixed-order sweeps,
   single-pass mocks, and focused-to-canonical promotion all produced misleading conclusions. A
   fixed-order sweep appeared to show a 15× coefficient effect until a repeated control exposed
   session drift (session `332ba4fb-4e2f-45a9-a3fc-934d386561df`, L1757, 2026-08-27T17:11:26.538Z).
   The 2026-08-31 campaign workflow addresses this, but the corpus cannot test a post-corpus
   mitigation.
4. **Measurement dominated active work, so iteration quality matters more than adding local
   parallelism.** Profiling/measurement occupied 51 h 05 m, while directly tagged device queueing
   was only 4 m 50 s. The median device-measured segment was 15.0 m and the median code-change-to-
   physical-validation transition was 8.8 m.
5. **One iPad and one Android device were not saturated symmetrically.** The conservative physical
   lower bounds are 22 h 29 m iPad versus 6 h 16 m Android, with only 1 h 12 m simultaneous. The
   opportunity is disciplined dual-lane scheduling and reservation hygiene, not simultaneous scoring
   on a shared host.
6. **Campaign orchestration is a repeated user need with incomplete workflow ownership.** Nine
   sessions requested a full PR-stack review, 11 requested review-handoff generation, 24 requested
   rig takeover/start, five requested copyable continuation prompts, and 14 requested campaign
   status.
7. **Per-fix precision has a hard evidence limit.** The 27 core sessions can be assigned exactly
   once to ten fix groups, but edit starts, rebuild counts, and recapture counts are often
   unsegmentable. The report preserves those boundaries rather than inventing per-PR precision.

## Corpus and method

* The frozen manifest contains **41 sessions**: **27 core**, **4 auxiliary planning**, and **10
  auxiliary review**. There are **41 finished reports** and **123 finished ledgers**: one footgun,
  prompt, and timing ledger per session.
* This integration read only the finished manifest, reports, ledgers, `fixes.md`, and the three
  finished aggregate analyses. It did not read raw transcripts.
* All 123 ledger files parse as JSON, their session IDs match their filenames and the manifest, and
  all 41 reports map one-to-one to manifest sessions. The reports contain 3,463 raw-evidence anchor
  patterns in `L<number> + ISO timestamp` form.
* The representative pilot paired every observed tool call to a result for both providers, detected
  nested failures behind successful/background wrappers, retained pre-compaction evidence, and
  reported zero parse failures. The manifest's review-corpus verification confirmed that all ten
  auxiliary review sessions concerned campaign PRs.
* Timing uses half-open interval unions. Durations were recomputed from timestamps. Boolean `true`
  and non-empty campaign strings count as active; `false` and `null` do not. All **14 auxiliary
  sessions are excluded from every timing total and distribution**.
* Prompt analysis contains **366 genuine-user entries**. These eight machine-launched checkout
  reviews have no genuine-user prompt and are excluded completely:
  `0742f1b4-a4b8-4cb0-a7bf-3749b1d732ad`, `3d85518e-44c1-4bfb-8d91-d11268217a97`,
  `69b8d12f-ece7-4380-8997-c41808bc3965`, `7b134243-0632-4837-83c5-a25c49933bb5`,
  `cd2d1ac2-51b7-40e0-862b-a63732bfcc8e`, `d7a932a0-5a8a-4bf3-bd95-b2d4f78d65f7`,
  `e21aeb77-bff3-443f-90cc-56555fa0a166`, and `ebf22b39-c9b7-42e3-9e6d-becfbf878e6c`. The other two
  auxiliary-review prompt ledgers explicitly classify their requests as genuine and remain eligible.
* Footgun analysis contains **707 occurrences**, **424** with non-null `timeLostMs`. Its time
  figures are conservative evidenced active-time floors: null durations, deliberate negative
  controls, and expected probes are excluded, and compound events are assigned to one primary
  mechanism.

## Recurring footguns and current mitigation state

The ranking prioritizes recurrence after a dated mitigation, then evidenced active time, distinct
sessions, plausible-wrong-number risk, and dependence on the single physical devices. The 2026-08-31
mitigation wave is post-corpus: `dcdfe0507` at **2026-08-31 10:35:02 -0400**, `a546ef799` at
**10:52:33 -0400**, `8a0040bb3` at **11:38:45 -0400**, `eb36abb9a` at **11:55:19 -0400**,
`35da49de6` at **12:37:52 -0400**, and `ba160a041` at **12:57:22 -0400**. A mechanism covered by
that wave is `recurring-mitigation-untested`, never described as fixed by or recurring after an
untestable change.

| Rank | Mechanism                                                                           | Sessions | Evidenced active floor | Current state                                                            | Exact mitigation history at evaluated SHA                                                                                                                                                                                                                                                                                                                                       |
| ---: | ----------------------------------------------------------------------------------- | -------: | ---------------------: | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Under-controlled or non-canonical causal validation                                 |        6 |             ≥192.1 min | `recurring-mitigation-untested`                                          | Contract/order prose `8ec148571`, 2026-08-25 19:02:23 -0400; workflow wave `8a0040bb3`–`ba160a041`, 2026-08-31 11:38:45–12:57:22 -0400                                                                                                                                                                                                                                          |
|    2 | Invalid capture identity, fidelity, regime, or scoreability admitted as evidence    |       21 |             ≥170.5 min | `historical-and-fixed`                                                   | Transport `2c5c61fa3`, 2026-08-21 13:05:03 -0400; refresh `f5466e21a`, 2026-08-23 15:10:10 -0400, `020d1fba5`, 2026-08-27 17:10:12 -0400, `9eef62e1a`, 2026-08-27 22:25:45 -0400; runtime/fidelity `fe79ae9c6`, 2026-08-25 17:06:35 -0400, `00db78cfc`, 2026-08-26 06:11:52 -0400, `0bdb63602`, 2026-08-28 15:43:13 -0400; page identity `7937125ef`, 2026-08-30 23:42:52 -0400 |
|    3 | Non-checkpointed or collision-prone evidence and diagnostics                        |        8 |             ≥123.6 min | `recurring-after-attempted-fix`; unresolved outside standard runner      | Queue `b0840a9c5`, 2026-08-21 10:40:45 -0400; durable evidence `6f4c08b02`, 2026-08-22 19:05:57 -0400; atomic replacement `9cdf5369e`, 2026-08-23 07:21:49 -0400; collision-safe naming `5ead92e8b`/`c2ced20a6`, 2026-08-24 22:25:08/22:50:43 -0400                                                                                                                             |
|    4 | Unbounded/stale process, port, preview, Appium, and test lifecycle                  |       27 |             ≥102.8 min | `recurring-after-attempted-fix`; unresolved                              | Foreign-port refusal `3162bc714`, 2026-08-23 07:26:05 -0400; stale-report rejection `5c8199754`, 2026-08-24 11:56:04 -0400; stale-page failure `a4d3e8fcc`, 2026-08-25 17:38:08 -0400; live-probe report root `81f6c460a`, 2026-08-29 09:58:08 -0400                                                                                                                            |
|    5 | Mutating lower stacked PRs or deleting a live base branch                           |        2 |             ≥100.1 min | `recurring-mitigation-untested`                                          | Prose rule `c516a257d`, 2026-08-23 13:47:42 -0400; mechanical pre-push guard `dcdfe0507`/`a546ef799`, 2026-08-31 10:35:02/10:52:33 -0400                                                                                                                                                                                                                                        |
|    6 | Build/tool contamination across cells, runtimes, or branches                        |        5 |              ≥55.8 min | `recurring-after-attempted-fix`; admission guarded, run waste unresolved | Served-build guard `427d04460`, 2026-08-23 03:37:32 -0400; dependency fingerprint `145f61cc3`, 2026-08-25 17:04:33 -0400; action-page identity `7937125ef`, 2026-08-30 23:42:52 -0400                                                                                                                                                                                           |
|    7 | Physical-device takeover and human-gate readiness                                   |       11 |              ≥32.4 min | `recurring-mitigation-untested`                                          | Preflight `f19325acd`, 2026-08-22 07:35:20 -0400; launch/Guided Access `5c44ef795`, 2026-08-22 15:49:34 -0400; Appium proof `59525849e`, 2026-08-22 20:08:53 -0400; Android input `ec0b14ce1`, 2026-08-22 21:18:58 -0400; grant expiry `aa0cd9cd6`, 2026-08-26 09:56:59 -0400; workflow wave 2026-08-31                                                                         |
|    8 | Nested failure, background task, or truncated output hidden by a successful wrapper |       23 |              ≥18.6 min | `recurring-after-attempted-fix`; unresolved                              | Silent-catch audit `dc2589072`, 2026-08-26 09:52:30 -0400; no cross-wrapper enforcing contract                                                                                                                                                                                                                                                                                  |
|    9 | Retyped/padded SHAs and hand-copied evidence values                                 |        5 |               ≥1.2 min | `recurring-after-attempted-fix`; unresolved                              | Copy-exact-SHA prose `c516a257d`, 2026-08-23 13:47:42 -0400; no posting-time validator                                                                                                                                                                                                                                                                                          |
|   10 | Listener/device/Git/cache/network work in the wrong sandbox context                 |       25 |              ≥24.2 min | `confirmed-unresolved`                                                   | Component-only dprint fix `c22bfeada`, 2026-08-28 20:06:01 -0400; no general execution-context router                                                                                                                                                                                                                                                                           |
|   11 | Guessed paths, leaked working directories, zsh globs, and shell quoting             |       29 |               ≥8.8 min | `confirmed-unresolved`                                                   | No enforcing general mitigation at evaluated SHA                                                                                                                                                                                                                                                                                                                                |

### Evidence behind the ranking

* **Causal validation:** a one-pass test masked a two-band production constant, yielding 0.2944
  while source and ADR claimed 0.16 (session `332ba4fb-4e2f-45a9-a3fc-934d386561df`, L2654,
  2026-08-27T22:21:37.248Z); a focused modal green turned red in the canonical sequence (session
  `01a0556d-5324-7f02-b38f-4c9d0426d506`, L3606, 2026-08-31T05:09:07.665Z; L3621,
  2026-08-31T05:09:32.026Z).
* **Evidence durability:** a collision discarded both iPad artifacts (session
  `3e6f6f97-83a3-4945-a288-b4724cdd6602`, L381, 2026-08-25T02:12:30.878Z), and a browser sweep held
  rows only in memory and lost them at row 21 (session `332ba4fb-4e2f-45a9-a3fc-934d386561df`,
  L1935, 2026-08-27T18:59:17.807Z).
* **Lifecycle:** a useful preflight remained alive until a 600-second wrapper timeout (session
  `aad29a65-527a-4977-8210-25432a61b059`, L51, 2026-08-23T02:49:11.634Z), and the corpus ends with
  an orphaned Vitest child blocking a focused run (session `01a0556d-5324-7f02-b38f-4c9d0426d506`,
  L1113, 2026-08-31T02:47:11.376Z; L1202, 2026-08-31T02:53:00.284Z).
* **Stack mutation:** deleting a live base branch closed three children (session
  `332ba4fb-4e2f-45a9-a3fc-934d386561df`, L3072, 2026-08-28T02:38:15.833Z); later lower-branch fixes
  forced a 92.3-minute cascade rebase (session `01a0556d-5324-7f02-b38f-4c9d0426d506`, L7388,
  2026-08-31T13:33:09.332Z; L7803, 2026-08-31T14:19:25.548Z).
* **Build contamination:** a mid-run tool edit broke 75 drawing attempts (session
  `aad29a65-527a-4977-8210-25432a61b059`, L1827, 2026-08-23T08:09:59.851Z), and a later artifact
  lacked measures and engine marks (session `7c37d255-8494-5f99-a40f-7dcee3e25013`, L693,
  2026-08-26T22:19:33.297Z).
* **Rig readiness:** Appium absence surfaced only as `fetch failed` (session
  `3e6f6f97-83a3-4945-a288-b4724cdd6602`, L42, 2026-08-25T01:28:40.432Z), while an iPad passcode
  prompt appeared only after launch services were repaired (session
  `01a04d49-fc00-7f20-a37b-aeb55d7d018f`, L11938, 2026-08-30T18:35:11.052Z).
* **Wrapper observability:** Gradle printed `BUILD FAILED` behind a successful tail pipeline
  (session `28542214-61b6-40b1-bf07-f9f8ba043a99`, L1935, 2026-08-21T13:40:50.916Z), and a
  post-merge wrapper exited zero while reporting `Tests: failure` (session
  `d2249b1c-c2d7-5484-9146-f6d23293668f`, L2622, 2026-08-25T21:58:53.884Z).
* **Citation identity:** a published review cited a nonexistent commit (session
  `01a03d10-b25f-7d20-9e12-9df8808f4847`, L569, 2026-08-26T08:32:50.763Z), and copied evidence
  changed `tocRows:0` to `tocRows:11` (session `ebf22b39-c9b7-42e3-9e6d-becfbf878e6c`, L213,
  2026-08-29T16:45:19.581Z; L251, 2026-08-29T16:49:36.766Z).
* **Context and shell discipline:** the newest core session hit Git ref-lock restrictions three
  times (session `01a0556d-5324-7f02-b38f-4c9d0426d506`, L528, 2026-08-31T01:53:41.245Z; L1610,
  2026-08-31T03:23:19.058Z; L8618, 2026-08-31T15:31:18.930Z), while review sessions repeated
  unquoted zsh-glob failures (session `3d85518e-44c1-4bfb-8d91-d11268217a97`, L54,
  2026-08-29T20:29:14.326Z; session `d7a932a0-5a8a-4bf3-bd95-b2d4f78d65f7`, L117,
  2026-08-29T15:47:31.655Z).

## Repeated genuine-user procedures and skill opportunities

Frequencies count distinct genuine-user sessions first and prompt entries second. Every promoted
cluster spans at least three sessions; machine-launch boilerplate is excluded.

### 1. Add `review-pr-stack`

**Frequency:** 9 composite execution prompts in 9 sessions.

The stable procedure is to resolve live stack topology; order PRs bottom-to-top; bind each PR to its
actual base and head; deduplicate prior review findings; use isolated clean checkouts; run focused
empirical validation when necessary; publish one atomic review per PR; and finish with a stack-level
sequencing verdict and final rig/checkout state. Existing `leave-pr-review` owns one PR, not an
entire base-sensitive stack.

Representative prompts explicitly required a twelve-PR bottom-to-top review with inline findings
(session `01a02e2c-c6f6-7ac2-a939-23c342b9a7b9`, L9, 2026-08-23T10:31:23.219Z), every PR diffed
against its own base and no merges (session `01a03d10-b25f-7d20-9e12-9df8808f4847`, L9,
2026-08-26T07:55:01.287Z), and one isolated worktree per branch with verified findings only (session
`01a038a2-7db2-7c41-b6d1-494db975c2d2`, L9, 2026-08-25T11:16:09.921Z).

### 2. Improve `create-pr-feedback-handoff`

**Frequency:** 18 creation/revision prompts in 11 sessions.

Keep the existing owner, but add structured fields for the receiving workflow (`review-pr-stack` or
`leave-pr-review`), actual base/head OIDs, prior-review deduplication, delivery mode, empirical rig
authorization and focus, no-modification/no-merge boundaries, and expected final state.
Representative requests asked for a single tooling-harness takeover prompt (session
`aad29a65-527a-4977-8210-25432a61b059`, L1972, 2026-08-23T10:04:58.476Z), a three-PR review prompt
using the review skill (session `332ba4fb-4e2f-45a9-a3fc-934d386561df`, L2610,
2026-08-27T21:30:35.125Z), and a PR review with rig takeover and spot checks (session
`01a049ec-f2d2-7f93-808a-f54dd7330118`, L3587, 2026-08-29T00:22:08.049Z).

### 3. Improve `start-capture-session` and formalize `rig-state`

**Frequency:** 53 rig-start/takeover prompts in 24 sessions; 11 reports separately corroborate the
same sandbox-first preflight mistake.

The existing workflow should treat invocation as reservation authority without implying a full
campaign, run the physical preflight at the host boundary on the first attempt, resolve service
ownership and ports dynamically, distinguish human-only gates, and leave a compact observational
`rig-state`: checkout/commit, device verdicts, preview/probe/Appium/WDA endpoints, borrowed versus
owned services, blocker, dirty scaffolding, Android wake state, and readiness. Consumers must
re-preflight instead of trusting stale readiness.

The recurring invocation included explicit physical-iPad/Android takeover and the full launch/input
preflight (session `01a03b48-fac8-7621-9e95-1abd9698bc66`, L9, 2026-08-25T23:37:15.204Z), while
another prompt authorized targeted review use without a full campaign (session
`01a03a8c-f603-7d30-933c-d6d96ac1721b`, L328, 2026-08-25T20:33:20.857Z).

### 4. Add `mode=prompt` to `create-handoff`

**Frequency:** 5 copyable continuation-prompt requests in 5 sessions, after excluding review-only
handoffs.

Reuse `create-handoff`'s state model but render one fenced prompt when requested. Refresh live
branch/PR/stack/CI/process state; distinguish transient state from durable lessons; include
objective, non-goals, verified work, reverted approaches, unverified assumptions, blockers,
authority, exact next step, and completion condition. Keep packet mode unchanged and route
independent review prompts to `create-pr-feedback-handoff`.

Representative requests asked another session to start capture (session
`01a03a8c-f603-7d30-933c-d6d96ac1721b`, L941, 2026-08-25T23:36:10.844Z), requested a fenced prompt
starting from latest `main` (session `d2249b1c-c2d7-5484-9146-f6d23293668f`, L2612,
2026-08-25T21:57:22.311Z), and asked a new session to resume the overall campaign (session
`01a04d49-fc00-7f20-a37b-aeb55d7d018f`, L13860, 2026-08-31T01:03:30.011Z).

### 5. Add `report-campaign-status`

**Frequency:** 46 status/progress/remaining-work prompts in 14 sessions, including 18 exact
`status?` prompts in two sessions.

The workflow should refresh authoritative trackers, matrix/artifact manifests, branch/stack state,
reviews, CI, running processes, and rig state; report numerator, denominator, and excluded scope;
separate delivered, in-flight, remaining, blocked/quarantined, and merge-ready work; and state the
immediate next action. Most importantly, a status aside during persistent work must return a
commentary snapshot and continue. The latest session stopped after such an aside, and the user had
to ask why (session `01a0556d-5324-7f02-b38f-4c9d0426d506`, L4693, 2026-08-31T06:24:48.406Z; L4829,
2026-08-31T10:10:18.810Z). Another session asked directly for percent complete (session
`28542214-61b6-40b1-bf07-f9f8ba043a99`, L1782, 2026-08-21T13:21:00.378Z).

### Repeated clusters not promoted

| Cluster                                   |                 Frequency | Disposition                                                                              |
| ----------------------------------------- | ------------------------: | ---------------------------------------------------------------------------------------- |
| Sustained zero-red performance campaign   | 11 mentions / 10 sessions | Already owned by `improve-performance-matrix`; improve in place                          |
| Create/link/merge stacked PRs             |  17 mentions / 9 sessions | Already owned by `create-stacked-prs`; the post-corpus guard addresses the major failure |
| Address all stack feedback in one tip PR  |  13 prompts / 11 sessions | Already absorbed by `address-pr-review`                                                  |
| Bare `continue`                           |    3 prompts / 3 sessions | Resume semantics belong to the active workflow; no independent completion gate           |
| Bulk instruction/document reads truncated |                12 reports | Bounded routing rule inside orchestrators, not a user-facing skill                       |

## Authoritative core timing

### Elapsed and active unions

| Measure                         |          Union | Share of core elapsed | Meaning                                                          |
| ------------------------------- | -------------: | --------------------: | ---------------------------------------------------------------- |
| Core session-envelope elapsed   | **228 h 59 m** |                100.0% | Union of 27 core manifest envelopes                              |
| Active campaign work            |  **98 h 48 m** |                 43.1% | Union of intervals marked active campaign                        |
| Elapsed minus active            | **130 h 12 m** |                 56.9% | Complement only; not a sum of idle categories                    |
| All observed non-idle core work | **102 h 45 m** |                 44.9% | Adds 3 h 57 m of core review/rig work not marked active campaign |
| All labeled core intervals      | **213 h 32 m** |                 93.3% | Union of every labeled interval, including idle labels           |
| Unlabeled envelope slack        |  **15 h 27 m** |                  6.7% | Included in elapsed; inferred as neither active nor idle         |

The observed range is `2026-08-19T19:29:14.477Z` through `2026-08-31T17:04:19.766Z`. Explicit
user/approval/external-idle labels union to 149 h 53 m, but they overlap concurrent active sessions
and are never used as the elapsed complement.

### Active-category unions

These independently unioned categories overlap and must not be added.

| Category                                     |         Union | Share of active campaign union |
| -------------------------------------------- | ------------: | -----------------------------: |
| Profiling/measurement                        | **51 h 05 m** |                          51.7% |
| Agent response latency                       | **16 h 46 m** |                          17.0% |
| Recovery/rework                              | **12 h 08 m** |                          12.3% |
| Device reservation and validation            | **10 h 07 m** |                          10.2% |
| Git/GitHub operations                        |  **7 h 29 m** |                           7.6% |
| Test                                         |  **7 h 10 m** |                           7.3% |
| CI and network waits                         |  **5 h 24 m** |                           5.5% |
| Dependency/environment preparation           |  **4 h 14 m** |                           4.3% |
| Failed or abandoned attempts                 |  **4 h 13 m** |                           4.3% |
| Install/launch/reset/cleanup                 |  **3 h 23 m** |                           3.4% |
| Build                                        |  **2 h 50 m** |                           2.9% |
| Handoff/resume/context reload/repeated setup |  **2 h 09 m** |                           2.2% |

Failure plus recovery/rework has a **16 h 08 m union**, not the arithmetic sum. CI, Git/GitHub, and
handoff have a **14 h 38 m combined union**.

### Distributions

* **180 semantic fix/phase markers** with at least 60 seconds of active union: elapsed-envelope P25
  **2.5 m**, median **6.9 m**, P75 **20.6 m**, P90 **52.2 m**; active-union P25 **2.3 m**, median
  **6.4 m**, P75 **15.7 m**, P90 **40.4 m**. These are phases, not uniformly product fixes.
* **33 substantive device-measured segments:** minimum **3.4 m**, P25 **7.6 m**, median **15.0 m**,
  P75 **45.3 m**, P90 **62.0 m**, maximum **198.0 m**. The maximum was the physical-iPad
  `action-modal-clusters` sweep in session `01a0556d-5324-7f02-b38f-4c9d0426d506`.
* **17 sessions with a substantive first measurement:** time-to-first-useful-measurement minimum
  **3.5 m**, P25 **9.8 m**, median **14.3 m**, P75 **31.8 m**, P90 **90.6 m**, maximum **186.9 m**.
  The physical Android eraser validation reached a faithful result after 3 h 06 m 56 s (session
  `d2249b1c-c2d7-5484-9146-f6d23293668f`, L2515, 2026-08-25T21:41:19.891Z).
* **74 separable code-change-to-physical-validation transitions within two hours:** minimum **1.3
  m**, P25 **5.2 m**, median **8.8 m**, P75 **14.4 m**, P90 **47.1 m**, maximum **103.7 m**; total
  affected span **20 h 48 m**. A representative exact-candidate preflight to completed
  theme/coloring A/B took about 39.9 minutes (session `01a0556d-5324-7f02-b38f-4c9d0426d506`, L5213,
  2026-08-31T10:31:22.853Z; L5756, 2026-08-31T11:09:05.100Z).

## Device utilization with one iPad and one Android

### Activity-tag unions

| Device activity tag        |         Union |
| -------------------------- | ------------: |
| Measuring/capturing        | **45 h 42 m** |
| Recovering from failure    |  **6 h 58 m** |
| Reserving/proving identity |  **5 h 00 m** |
| Installing/launching       |  **2 h 39 m** |
| Building for device        |  **1 h 03 m** |
| Waiting for device         |  **4 m 50 s** |
| Device reserved but idle   | **51 h 52 m** |

Non-idle/non-waiting device-tagged activity unions to **56 h 15 m**, but the tag lacks device
identity and includes simulators, emulators, and generic rig activity. Explicit report/ledger
evidence supports only these conservative physical lower bounds:

| Physical lane               | Attributable active union | Share of active campaign union |
| --------------------------- | ------------------------: | -----------------------------: |
| The single iPad             |             **22 h 29 m** |                          22.8% |
| The single Android device   |              **6 h 16 m** |                           6.3% |
| Both devices simultaneously |              **1 h 12 m** |                           1.2% |
| Either physical lane        |             **27 h 33 m** |                          27.9% |

Reserved-idle time is generic rig wall-clock and is counted once, never doubled into iPad-hours and
Android-hours. Its largest contributors include 22.14 h in session
`3e6f6f97-83a3-4945-a288-b4724cdd6602`, 10.25 h in `332ba4fb-4e2f-45a9-a3fc-934d386561df`, and 3.65
h in `01a0556d-5324-7f02-b38f-4c9d0426d506`; these are mainly user gaps, overnight gaps, or
open-session tails, not recoverable implementation time.

Observed overlap between device-active and offline work is **3 h 20 m** globally and **3 h 08 m**
within the same session. The conservative same-session missed-overlap set—offline work while the rig
was explicitly reserved but idle—is **3 h 18 m**. A broader **8 h 48 m** cross-session intersection
is rejected as a savings bound because stale/open reservation tails contaminate it.

### Conservative improvements with the existing hardware

| Improvement                                                                  |                                                Observed basis |       Conservative savings | Guardrail                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------: | -------------------------: | -------------------------------------------------------------------------------------------------- |
| Start with one known-good control after full preflight                       |           6 h 51 m above a 15-minute first-measurement target |              **0.7–1.4 h** | Additive control; never replace inventory or preflight                                             |
| Exact-commit build → launch → one control → prescribed repeats command       | 74 transitions, 20 h 48 m affected; 9 h 40 m above 15 minutes |              **1.0–2.0 h** | Preserve repeats, modes, orientations, themes, and identity checks                                 |
| One FIFO lane per physical device                                            |      27 h 33 m either-lane active; only 1 h 12 m simultaneous |      **0.8–1.6 h elapsed** | Serialize each device; no dual scoring on the shared host without a quiet-host equivalence control |
| Safe offline work during installs/launches or on the other lane              |                    3 h 18 m conservative missed-overlap union |              **0.5–1.0 h** | Remote/CPU-light work only during scoring-critical capture                                         |
| Mandatory report-root, context, Appium, ownership, and one-cell smoke checks |                              Failure+recovery union 16 h 08 m |              **1.6–3.2 h** | Fail closed; reuse/caching must retain provenance                                                  |
| Draft/checkpoint/review/CI/stack lifecycle discipline                        |                                CI/Git/handoff union 14 h 38 m |              **1.0–2.0 h** | Publish stable evidence only; keep stack-linearity guard                                           |
| Release devices across overnight/user gaps and re-prove on reacquisition     |                                 Reserved-idle union 51 h 52 m | **0 h active-time credit** | Improves availability without claiming fictitious implementation savings                           |

Rows overlap and must not be added. After discounting that overlap, the conservative portfolio is
**4–7 active hours**, or **4–7% of active campaign time** and **1.7–3.1% of elapsed**. No credit is
taken for extra hardware, fewer samples, weakened gates, simultaneous work on one device, or turning
user/overnight gaps into active savings.

## Fix-cycle summary

The ten groups below assign every core session exactly once. Each row is an independently unioned
group view; rows overlap in wall-clock and must not be added. The correctly unioned campaign-wide
non-idle categorized core interval is **4 d 6 h 44 m 31 s** (rounded to 102 h 45 m in the timing
tables).

| Fix group                                          | Core sessions | Delivery union | Capture union | Device union | Defensible outcome                                                                                                                                                                        |
| -------------------------------------------------- | ------------: | -------------: | ------------: | -----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Issue #1161 / PR #1163                          |             2 |         51m05s |        27m29s |           0s | Firefox/Chromium action work; replacement Quality job green by session `01a01b9b-4712-71d1-8b25-a58265c01abd`, L1090, 2026-08-19T21:24:30.649Z                                            |
| 2. Deployment matrix / PRs #1191, #1200            |             3 |      16h20m26s |     13h27m15s |       18m21s | Physical iPad reached 20/20 cells (session `6e508a29-39cc-45ff-9dd4-3d79dc1c4d13`, L1346, 2026-08-21T18:04:52.575Z); final visible coverage 44/44 drawing/undo and 40/44 actions          |
| 3. Durability stack #1227–#1244                    |             2 |       9h46m17s |      5h47m19s |     2h04m11s | Four targets recaptured; two review rounds and 26 findings handled; stack remained open                                                                                                   |
| 4. Issue #1225 follow-through / #1259–#1320        |             5 |      12h46m57s |      3h25m31s |     1h20m38s | Two explicit 20-cell physical recaptures; cluster-wide final green boundary unsegmentable                                                                                                 |
| 5. Instrument stack #1332–#1346                    |             4 |       3h44m46s |        22m48s |     1h34m23s | Twelve PR markers merged; Android eraser capture faithful at 1.0217% lost-frame share (session `d2249b1c-c2d7-5484-9146-f6d23293668f`, L2515, 2026-08-25T21:41:19.891Z)                   |
| 6. Follow-through #1347–#1357, reviews #1368/#1369 |             2 |       2h09m41s |        14m18s |       24m10s | Stack merged and post-merge CI green; zero physical performance recaptures                                                                                                                |
| 7. Crayon/instrument #1382–#1479                   |             4 |      16h49m39s |      9h04m39s |       48m27s | 16 Safari alternatives and native T1–T10; final native five-sample crayon median 0.03% versus pen 0.05% (session `332ba4fb-4e2f-45a9-a3fc-934d386561df`, L2824, 2026-08-28T02:09:36.824Z) |
| 8. Remaining #1225 descendants / #1480–#1492       |             2 |      15h01m31s |      8h26m41s |     2h21m08s | Four complete 20-cell simulator/emulator targets; #1458 quarantined; #1486 merged                                                                                                         |
| 9. Zero-red/selector #1493–#1509                   |             2 |      14h20m43s |      4h47m56s |     3h31m23s | Faithful red Safari modes retained; matrix not regenerated to zero red (session `01a04d49-fc00-7f20-a37b-aeb55d7d018f`, L13860, 2026-08-31T01:03:30.011Z)                                 |
| 10. Physical-iPad/action #1511–#1519               |             1 |      11h01m29s |      5h01m08s |       19m55s | Seven-PR stack merged; skills PR green; complete 11-target matrix still not recaptured (session `01a0556d-5324-7f02-b38f-4c9d0426d506`, L9498, 2026-08-31T17:04:19.723Z)                  |

Fix-cycle evidence supports precise first-edit or first-measurement boundaries only when a report or
ledger exposes a stable marker. It does not support a grand count of approaches, rebuilds, or
recaptures. For example, the final core session can distinguish three grid geometries and at least
seven selection variants, but their preparatory work overlaps, so no single total is asserted.

## Coverage, confidence, and interpretation limits

**High confidence:** corpus membership; one-to-one report/ledger coverage; auxiliary exclusion;
elapsed and active unions; category/device-tag unions; prompt frequencies; footgun session counts;
Git mitigation dates at the evaluated SHA; and raw anchors copied from finished reports.

**Moderate confidence:** physical iPad/Android utilization, because `deviceTag` records activity but
not identity. Figures are conservative lower bounds assigned only from explicit physical-device
notes or physical-only campaigns. The 4–7 hour improvement estimate is also moderate-confidence: it
discounts overlap and preserves correctness gates, but it remains an estimate rather than an
observed intervention.

**Limited precision:** first edit per PR, rebuild/recapture counts, hidden model compute, and
queueing. Observable response latency is not model/UI queue time. A long command remains active
through its completion record when the ledger says it stayed in flight.

The following totals intentionally overlap and must never be added: active categories; device
activity tags; iPad, Android, and simultaneous physical-lane figures; footgun active-time floors;
fix-group delivery/category unions; and recommendation rows. Faithful red captures, rejected setup
attempts, invalid captures, and superseded evidence remain distinct. Auxiliary reports may
corroborate review or decisions, but auxiliary time contributes zero to implementation timing.

Finally, this corpus cannot validate mitigations created in the 2026-08-31 wave. Causal campaign
control, the stack pre-push guard, and the latest rig workflow therefore remain
`recurring-mitigation-untested` until a later campaign exercises them.
