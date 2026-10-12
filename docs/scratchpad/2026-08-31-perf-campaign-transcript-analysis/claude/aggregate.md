# Performance-campaign transcript analysis — aggregate findings (Claude lane)

> **Archived copy (2026-09-24).** This file was copied here from the branch that produced it. The
> per-session `reports/`, `ledgers/`, and `manifest.json` it cites were not kept, so its
> session-line citations are historical and cannot be followed; see [the README](../README.md).

Corpus: the 41 transcripts of Splotch's August 2026 deployment-target performance campaign — 27 core
sessions, 4 auxiliary planning, 10 auxiliary review — spanning 2026-08-19T19:29Z to
2026-08-31T17:04Z. Evaluated against `origin/main` at **b41dec23750f0c446a26f70cbc15561fe1fdfc22**
(PR #1519, merged 2026-08-31 13:24 EDT).

Per-session evidence is in `reports/` and `ledgers/`; the frozen corpus with hashes and eleven
recorded methodology decisions is in `manifest.json`; per-fix segmentation is in `fixes.md`.

## How to read this document

Three numbers recur and mean different things. Confusing them would misread every conclusion.

| Figure                                 | What it is                                                      | What it is not                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **212.71 h** session-span union        | Calendar time during which at least one session was open        | Not effort — sessions overlap                                                                                                                                                     |
| **97.15 h** active union (all classes) | Union of tool-call intervals plus observable agent latency      | Not the sum of category times                                                                                                                                                     |
| **77.91 h** attributed time-lost       | Sum of 1,323 per-occurrence attributions in the footgun ledgers | **Not wall-clock and not all waste.** Median occurrence 19 s, p90 6.2 min, max 9.27 h; the top ten entries are 34% of the total, and several are spans containing productive work |

Wall-clock figures are interval **unions**, never sums. Session start/end come from the first and
last *conversational* record: a transcript's final record is often a cross-session queue flush
written up to 44 hours later, and reading it naively would have added ~125 phantom hours.

## The single most important methodological result

**Checking the repository moved a verdict six times, four of them in the campaign's favour.** This
project's lessons live in **five destinations** — the trap catalogue `docs/PROFILING-CAMPAIGNS.md`,
skill `SKILL.md` files, skill `references/` files, ADRs, and code comments backed by tests. Any
search covering fewer than all five overstates what remains unfixed.

Claims of mine that verification overturned:

* "The blank renderer defeats the documented tell and has no durable home" — **wrong**. ADR-0147:97
  records it and uses it to justify a standing human sign-off gate.
* "A correct result declined on appearance is an unaddressed gap" — **wrong**. ADR-0147 and
  ADR-0148:12 record the rejection, the reason, and the activation precondition.
* "`stale-served-build` is the corpus's strongest post-mitigation recurrence" — **fixed**, by a
  served-build *fingerprint* (`servedBuildFingerprintProblem`) with four test cases.
* "The nonce guard covers readiness only" — **fixed** at `probe-host.mjs:129`.
* "The routing of measurement lessons is structurally broken" — **too strong**; it worked for ten
  days and 57 catalogue commits, then stopped in the final wave.
* "The detach-every-viewer rule was lost in the #1519 rewrite" — **wrong**; it survives at
  `capture-performance-matrix/references/platforms.md:54`.

A transcript-first reading of this campaign systematically produces a harsher and less accurate
answer than the evidence supports. That is the finding I would most want carried forward, because it
applies to any future audit of this repository.

---

# Question 1 — which recurring footguns remain unfixed in a durable fashion?

## The answer in one paragraph

The campaign's self-healing works, and works fast: measured defect-to-durable-fix intervals of **9
min 11 s** (CacheStorage wedge → code + regression test), **3 min 34 s** (nonce on the report read),
**12 min** (user-agent/runtime-label refusal), **~37 min** (the 2026-08-21 wave, routed through a
`/tmp` note), **47 min** (the corpus's earliest session, three probe defects into code, tests and an
ADR-0091 amendment), and same-day for the brush-fallback and native-provenance catalogue entries.
The trap catalogue took 57 commits in eight days and **retracts its own mechanism claims within the
hour** when a session fails to reproduce them. So the durable-fix question is not about diligence.
What remains unfixed is **seven specific mechanisms**, five of which are one family, plus **one
routing gap confined to the campaign's final wave**.

## Ranked: what is genuinely still open

Ranked by the brief's criteria — post-mitigation or multi-session recurrence first, then risk of
plausible-but-wrong numbers, then dependence on scarce device time. Every entry was checked against
all five destinations at the evaluated SHA.

### 1. Cross-process artifact-identity mismatch — 2 of 4 instances open, 8 in the wider family

**The mechanism:** the process that writes a capture artifact and the process that reads it disagree
about *which* artifact, or *where* it is. Every instance produces a plausible artifact or a
plausible absence rather than an error.

Eight instances across six sessions. Verified state:

| Instance                                                                                                                                                  | Session                      | State at evaluated SHA                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Report file keyed on `state.plan.label`, not the nonce; writer and reader both default `report-dir` to one constant                                       | 01a04d49                     | **OPEN** — `serve-floor-control.mjs:242,274`, `serve-probe-host.mjs:25`                                    |
| A refuted experimental arm promoted under a *correct* label (1.87% FAIL where the PR claimed 0.08%); a 1.73% ablation rung promoted as the 1.11% baseline | 332ba4fb, 01a04260           | **OPEN** — the promotion check covers artifacts resolving to `unknown`, not a correctly-labelled wrong arm |
| Per-target instrument fingerprint overwritten, no per-cell record                                                                                         | 01a03f61                     | **OPEN** — defeats the `instrument.json` mechanism built to prevent resume-across-a-change                 |
| Nonce enforced on readiness but not the report read                                                                                                       | 01a03302                     | FIXED — `probe-host.mjs:129`                                                                               |
| Absolute `--output-root` rebased under the repo root                                                                                                      | 01a049ec                     | MIXED — inspector side correct (`run-campaign.mjs:81`); child side unverified                              |
| Preview-port ownership decided by command-line substring                                                                                                  | 01a038a2, 01a03b48, 01a03d72 | FIXED — `f12ac50aa`, code + tests + skill                                                                  |

**Why it ranks first:** recurrence *across* sessions rather than within one; every failure silent;
one instance destroyed evidence (a valid product-red artifact deleted by delete-before-retry on a
path the inspector could not see); and the remaining gaps are cheap. The fix the evidence supports,
and no more: **bind an artifact to the run and the decision that produced it, and have the reader
assert that binding rather than trust a name, a path, or a timestamp.**

**The sharpest single detail:** at commit 94b2605 the preflight decided port ownership with
`holder.args.includes('vite preview')` while a cwd-aware decider,
`foreignPortListeners(port, root)`, already existed in the same tree and was already used by
`profile-preview.mjs`. Two deciders coexisted and disagreed by construction. That is not an
unlearned lesson but an **unpropagated** one, and the repo's own root instructions already prescribe
the remedy for constants ("cross-file agreement is never maintained by prose") without applying it
to ownership resolution.

### 2. The completion gate — 5 instances, 4 sessions, all the same defect

A completion claim resting on a **proxy** rather than on the thing claimed:

| Claim                                       | Proxy used             | Authoritative check that was available                                        |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `gh stack` membership asserted in a wrap-up | asserted anyway        | its own check, which had failed 23.1 s earlier                                |
| Nine-PR stack "merge-ready"                 | per-PR CI              | the previous campaign's regression surface — caught only by one user question |
| Issue #1215 "wrapped"                       | a pushed branch        | an open PR (the user had to create #1486)                                     |
| "Rig left as found"                         | port occupancy         | the holder pid, which had changed 3737 → 93448                                |
| "Port 4173 held by this session"            | command-line substring | holder cwd — then contradicted 23 min later, unreconciled                     |

None is a measurement problem. Every case had the authoritative check available and used something
cheaper. `improve-performance-matrix` has an extensive Completion gate section and
`create-stacked-prs` owns stack verification, both in prose; nothing mechanically refuses a
merge-ready claim whose own last verification failed. **Second-best-evidenced target, and it needs
no new instrumentation.**

### 3. A check that passes because it did not run, or because the product did less

Two mechanisms, one shape — a green result that measures nothing:

* **`sandboxed-localhost-bind-masks-assertion`** (01a03d72): 22 perf assertions returned "could not
  reserve a port for the diagnostic server" *in place of the value under test*, all green when rerun
  escalated. Absent from all five destinations; grepped `sandbox`, `escalat`, `vitest`,
  `port reservation`.
* **The blank renderer** (7c37d255): an unbounded `str.replace` left the native build painting
  nothing; captures scored 0.00–0.01% lost frame time with fidelity **PASS** and `measures ≈ 3790`,
  defeating the catalogue's documented `measures = 0` tell (lines 78, 726). Caught only by unit
  tests. **Recorded in ADR-0147:97** and used there to justify a human sign-off gate — so the lesson
  has a home, but no mechanical check asserts that a scored drawing capture produced painted output.

### 4. Four uncatalogued capture-path mechanisms

Confirmed absent from all five destinations, each verified with named search terms:

1. **Device-side service worker serving a stale app shell** on a reused LAN preview origin —
   silently invalidated three "exact product commit" iPad captures; the only tell was a
   versioned-manifest 404 in a *superseded* server's SIGINT log.
2. **Focused-subset validation contradicting the canonical sweep** — a modal-close fix validated by
   an `--actions` subset was an 11-cell regression via its own `will-change: opacity` promotion,
   recurring twice more before being isolated to a dark/light theme round trip. Notable because
   `capture-performance-matrix`'s *Focused improvement validation* mode prescribes this shape.
3. **Absolute `--output-root` silently rebased** under the repository root (see cluster 1).
4. **`git checkout <file>` discarding uncommitted work** during the catalogue's own prescribed
   revert-and-run check. The catalogue tells you to "revert the fix and run the test" (line 617) and
   never says how to revert safely; grep for `git checkout`/`uncommitted`/`dirty tree` returns 0.
   The consequence was a **false claim in the permanent record** — a commit and a published PR
   disposition both asserting changes the diff did not contain.

### 5. A measured architectural dead end that reached no durable home

The research session established, by measurement, that **GPU cost tracks the render target's
attachment area rather than stroke work** (so no architecture change helps) and that **under
SwiftShader the WebGL path is 2–3× slower than the shipping 2D canvas** while Chromium's fallback is
being withdrawn — making a GPU crayon additive complexity rather than the ~5,700-line deletion it
promised.

No ADR names GPU or WebGL; the finding appears nowhere in `docs/`; `origin/spike/gpu-crayon`
survives as an unmerged branch, so the code exists without the reasoning. Its entire value is
preventing a future session from re-exploring a measured dead end, and the repo's own `CLAUDE.md`
names exactly this case for `create-adr`. **Cheap to fix now, impossible to reconstruct later.**

## Recurring, mitigation shipped but untested by this corpus

Three cases where the fix postdates the last occurrence, so the brief's
`recurring-mitigation-untested` label applies and they must **not** be ranked as open:

* **A status question ending an autonomous turn** — 3.64 h of idle (02:29–06:08 EDT, 2026-08-31),
  the corpus's second-largest single attribution. The rule "do not treat the question as
  turn-terminating" landed **5.5 hours later** the same day, in 8a0040bb3.
* **A handoff packet propagating a wrong fail-open rule** — inherited unchallenged, shipped as
  `preserved`-mislabelled fresh evidence, caught by a reviewer. The "do not inherit a red-cell
  count, causal theory, target list or optimization priority" rule landed 2026-08-31, three days
  later.
* **The 2026-08-31 routing gap itself** (below).

## The routing gap, stated correctly

PR #1519 changed 30 files: 27 skill files plus `docs/QUALITY.md`, a deferred-decision record, and a
handoff. **No `PROFILING*` doc at all.** The catalogue's last commit is 2026-08-29, and the campaign
ran two more days. Two novel capture-path mechanisms that the same session had found hours earlier —
the stale app shell and the focused-subset contradiction — reached neither the skill nor the
catalogue.

But routing worked for the preceding ten days: 57 catalogue commits, capture-path mechanisms landing
same-day (the `brushOf` fallback that discarded 26 crayon captures, the provenance section, the
input cadence entry, the page-identity audit). **So the recommendation is small: make the trap
catalogue an explicit target of the end-of-campaign self-heal step, alongside the skills.**
Recommending a new process for something that ran correctly for ten days would be advice against
evidence.

## Prose-only mitigations that did not hold

Worth stating separately because the remedy differs: guidance that exists, is correct, is
well-placed, and still did not prevent recurrence.

* `sha-padded-from-memory` — 5 occurrences in one session, against an explicit root `CLAUDE.md` rule
  *and* a dedicated user memory file. All caught by the repo's own verify loop, which is the only
  reason none shipped.
* `shell-edit-bypasses-format-hook` — 7 occurrences across 3 sessions, one costing a full red CI
  cycle, against a dedicated memory file.
* **A documented negative ignored** — a session took the "a stale automation session is blocking
  Safari" path that the catalogue explicitly labels *"not what denies the launch"* (lines 433–437),
  text two days old at the time. The real cause, the XCTest automation prompt, still has zero
  catalogue hits and lives only in `start-capture-session`.

The pattern: **prose is weak precisely where it states a negative or a habit.** Each of these has a
mechanical alternative, and the SHA case shows what works — the verify loop caught all five.

---

# Question 2 — which repeated procedures should become skills, or improve existing ones?

**Base:** 378 turns extracted mechanically from all 41 sessions, of which **360 are genuine
user-authored** across 33 sessions. The filtering mattered more than the clustering: a raw pass
yielded 717 "user prompts", of which **316 were `<task-notification>` background-task chips injected
in the user role**, plus slash-command scaffolding (`<command-name>/model</command-name>`,
`<local-command-stdout>`) and harness markers (`[Request interrupted by user for tool use]`). Nearly
half of an unfiltered count is not the user. Prompts were extracted by script across all 41 sessions
so this answer keeps full corpus coverage despite narrative reports covering only the core 27.

## Procedural elements requested across all 41 opening prompts

|  n | element      |   |  n | element              |
| -: | ------------ | - | -: | -------------------- |
| 25 | run-campaign |   | 10 | autonomous           |
| 19 | rig-takeover |   |  6 | handoff-resume       |
| 18 | review-stack |   |  5 | epic-status          |
| 16 | auto-post    |   |  2 | no-device constraint |
| 12 | stacked-prs  |   |  2 | address-feedback     |

## Recommendation 1 — NEW SKILL: an epic-inventory workflow

**The only new skill this study recommends.** It clears every bar in the brief, and the manual
method is not merely tedious — it is **measurably wrong**.

* **Frequency:** 5 sessions (f7618b89, 51590def, 91dcbd84 near-verbatim; 80cceecf and 01a047b9
  embedded).
* **The decisive evidence (80cceecf):** at 18:43:59Z the agent hand-scraped issue 1225's **prose**
  into a 14-number loop. At 18:45:27Z — **88 seconds later** — the sub-issues API returned **27
  children**. The hand-scrape missed **13 of 27, including five of the six issues the campaign went
  on to ship.**
* **Corroboration (01a047b9):** the one session that invoked `implement-issue-stack` still ran its
  `state.mjs` helper exactly once (`init`), then hand-wrote all **14** subsequent status transitions
  as `apply_patch` diffs against `.issue-stack/run.json`, and re-derived per-issue scope by fetching
  each issue **plus its full comment history** — where the comments changed the #1199 plan.
* **No skill owns it.** `burn-down-backlog` claims one issue and works it; `implement-issue-stack`
  tracks a run it was handed rather than deriving the inventory.
* **Inputs:** the epic issue number. **Outputs:** children enumerated **from the sub-issues API,
  never from the epic's prose**, each classified actionable-now / blocked-on-human / already-done,
  each child's comment thread read, plus a recommended order. **Completion condition:** every child
  accounted for and the count reconciled against the API.
* Name it verb-noun per the repo's rule (e.g. `inventory-epic`).

## Recommendation 2 — IMPROVE `leave-pr-review`: encode the stacked-diff rule

Originally I expected this to be the bigger recommendation. The evidence shrank it, and that is the
useful result.

The rig-takeover + stacked-review + auto-post composite appears in **7 user-authored sessions**
(01a02e2c, 01a03a8c, 01a03d10, 01a03f61, 01a03302, 01a038a2, and 01a030e0 without auto-post). But
the eleven-PR review **got base resolution right for all eleven PRs** — every diff ran
base-OID→head-OID from `gh pr view --json baseRefOid`, re-verified before posting, with main's OID
appearing only against the one PR actually based on main.

So the procedure is not error-prone; it is **un-encoded**. The user had to state *"diff each PR
against its own base branch, never against main"* in bold every time, because diffing a stacked PR
against main shows every PR below it too. Grepping `leave-pr-review`, `create-stacked-prs` and
`address-pr-review` for `baseRefOid` or "its own base" returns **nothing**.

**Fix: state the base-OID rule in `leave-pr-review`.** Then the bolded instruction becomes
unnecessary rather than load-bearing. Everything else in the composite is already owned —
`start-capture-session` takes the rig, `create-stacked-prs` owns stack shape,
`create-pr-feedback-handoff` builds the reviewer prompt, and
`~/.local/libexec/splotch-claude-{run,review-publish,health,stream}.mjs` already automate the launch
(partly version-controlled as `.agents/skills/run-claude/scripts/claude-review-publish.mjs`).
Bringing those host-only scripts into `tools/` is a secondary, optional improvement.

**A new skill here would have been over-reach.** Eleven-for-eleven is what shows it.

## Recommendation 3 — generalise two ADR-level rules into the campaign skills

Both already exist as decisions; neither is stated where a campaign session would meet it.

* **Get the appearance judgement before spending device time.** ADR-0147 already requires human
  visual sign-off before activating the crayon deposition pipeline, with the reason stated plainly —
  the colour shift "reads as a glitch rather than as ink drying… disqualifying for a drawing app
  aimed at two-year-olds, **whatever the frame numbers say**." Scoped to that pipeline. The campaign
  skills carry the adjacent principle ("a faster incorrect interaction is a rejected experiment")
  but not the *scheduling* consequence.
* **Inherit rig state, then re-verify it.** 01a030e0 did both and the re-verification caught a
  zero-pointer-event Android state whose mechanism the catalogue documented only 1.5 days later. The
  two practices are complements; the skills currently read as a tension between "leave the rig up
  deliberately" and "do not skip verification".

## Counter-examples — what good ownership looks like

Kept deliberately, because they discipline the recommendations above. "Address pr feedback" appears
bare in 5 sessions and "create review handoff prompt" in 3 — each invoked in three words, because
`address-pr-review` and `create-pr-feedback-handoff` own them cleanly. A well-owned procedure
produces *short* prompts. That is the signal to look for, and it is why recommendation 2 shrank.

---

# Question 3 — what dominates campaign wall-clock, and what could reduce it with one iPad and one Android?

## The headline: the two-device constraint is not the binding one

| Measure                                                  | Value                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Session-span union (calendar time with ≥1 session open)  | **212.71 h**                                                                   |
| Summed session elapsed                                   | 277.16 h (⇒ **64.45 h** of concurrency inflation)                              |
| Core active union (tool intervals + observable latency)  | **83.78 h**                                                                    |
| Core user-idle (agent stopped, waiting on the operator)  | **120.42 h**                                                                   |
| Core dormant (>300 s gaps, neither active nor user-idle) | 7.88 h                                                                         |
| **iPad physical occupancy**                              | **9.52 h** (strict union; 25.4 h bridging ≤2 min gaps, 37.1 h bridging ≤5 min) |
| **Android physical occupancy**                           | **4.63 h** (11.0 h / 14.7 h / 23.4 h on the same bridges)                      |
| Same-device contention between sessions                  | **0 h**                                                                        |
| Core session-span with no physical device busy           | **91%**                                                                        |
| Full rig takeover to "both devices verified and idle"    | **2 min 21 s**                                                                 |

Serialisation was respected perfectly — zero hours of two sessions holding the same device. Device
*setup* is not a cost either: 2m21s, measured twice at 140 s and 141 s from byte-identical prompts.

Three independent measurements say the same thing:

1. **Corpus-wide:** 91% of core session-span had no physical device busy.
2. **At session scale (332ba4fb):** ~100 minutes lost to two failed desktop-WebKit colour sweeps
   cost roughly **double all 12 instrumented builds and 25 device captures in that range combined.**
   Failed *local* work outweighed successful *device* work.
3. **As a natural experiment (d2249b1c):** a handoff forbade touching either device, and the session
   delivered **11 of 12 merged PRs covering 13 named instrument issues** — built, adversarially
   reviewed, revised and driven green — with 2 minutes of incidental iPad occupancy.

## Where the time actually goes (core sessions, category unions)

| Category                                                 | Calls |   Union |
| -------------------------------------------------------- | ----: | ------: |
| other-tooling (file reads, edits, greps — the code work) | 7,801 | 27.73 h |
| profiling / measurement                                  | 1,655 | 10.06 h |
| git & GitHub operations                                  | 2,995 |  6.68 h |
| test                                                     | 1,895 |  5.24 h |
| device reservation & validation                          |   434 |  1.71 h |
| CI & network waits                                       |   230 |  0.94 h |
| build                                                    |   308 |  0.81 h |
| install / launch / reset / cleanup                       |    29 |  0.14 h |
| dependency & environment prep                            |    20 |  0.04 h |

Agent response latency across core sessions is **30.46 h** of union — larger than every category
except code work and measurement, with a median of 3–7 s per gap and a long tail. It is an
observable gap between a tool result and the next action, nothing more.

**Android spent more time proving its own identity (1.69 h) than capturing (1.60 h).**

## What would realistically reduce wall-clock

Bucketed as the brief asks. Each carries its evidence and a conservative expectation.

**Directly saves iPad or Android occupancy**

* **Run `check:matrix-staleness` before treating any red cell as a product problem.** Prevented
  cost: five `exp/1203-*` candidate implementations written against a 50 ms gate that 13ecc3a0's
  raster-queue extraction had already fixed — **none of the five was ever measured**. The check
  needs no device and runs in seconds. **Caveat, found in this corpus:** it defaults `--base=HEAD`
  (`check-matrix-staleness.mjs:193`), so from a campaign branch it counts the caller's own commits
  as drift and reports STALE wrongly. Pass `--base=origin/main`.
* **Get the appearance judgement before the timing campaign** (recommendation 3). Two sessions
  produced fidelity-passing, CI-green, independently reproduced wins that were then declined on
  appearance — the only class of waste in this corpus where the wasted work was *entirely correct*,
  and no gate could have saved it.

**Better use of the two-device rig**

* **Inherit rig state and re-verify it** — inheriting saves setup, re-verifying costs about a
  minute, and the corpus has a case where that minute paid for itself immediately.
* Nothing else here is worth much: contention is already zero, takeover is already 2m21s, and
  occupancy is 14.15 h combined against a 212.71 h span.

**No-device work, schedulable off the rig**

* **Separate the device-independent half explicitly**, as d2249b1c and abcb7ded already did on
  instruction. This is a measured precedent, not a proposal: 11 of 12 PRs with no device contact.

**Build/test pipeline**

* Builds are 0.81 h and dependency prep 0.04 h across 27 core sessions. **There is nothing here.**
  Any effort spent on build caching would be optimising 1% of active time.

**Agent workflow and skills**

* The two Q2 recommendations, plus the completion-gate fix. The status-question rule (already
  shipped) alone addressed a 3.64 h idle.

**Saves elapsed but not device time**

* **The 120.42 h of core user-idle is the largest single bucket** — the agent stopped and waited.
  Some is irreducible (an operator asleep; a genuinely human-only device interaction). But the
  corpus shows a user asking *"can you do anything else while you wait for me?"*, and shows one 3.64
  h idle caused by a status question terminating an autonomous turn — a defect with a shipped fix.
  Reducing this is the highest-value elapsed-time work available, and it is entirely about autonomy
  and turn discipline rather than hardware.

---

# The finding that cuts across all three questions

**In this campaign, independent empirical review is the mechanism that finds the errors gates cannot
— and the campaign converts review findings into durable rules within hours.**

Nine consequential reviewer catches, several squarely in the "plausible-but-wrong published number"
class the gates exist to prevent:

1. Hand calibrations recorded in Safari under an `ios-capacitor-webview` label — retracted from
   issues #1275 and #1303.
2. The false "native WKWebViews fire no `orientationchange`" universal, already shipped into
   ADR-0142 (corrected 19 minutes later, then refined three more times that day).
3. The nonce enforced on readiness but not on the report read — fixed 3 min 34 s after the comment.
4. A cross-campaign bandwidth regression in a nine-PR stack already declared merge-ready (3.29 MB
   gzip vector-only against 11.57 MB proposed) — caught by **one user question**, forcing a full
   asset-direction reversal into PR #1508.
5. The inherited fail-open provenance rule.
6. A refuted `baseline-planes` arm promoted under a correct label, and a 1.73% ablation rung
   published as the 1.11% baseline — both had passed every gate.
7. A correctness defect **invisible to the author's own tests** — reproduced in a temporary test the
   reviewer then removed — which blocked PR #1414 *even though the reviewer had reproduced its
   timing win*.
8. A **gate loosening** that admitted the transport the retired floor refused: 0.82 moves/frame
   passing fidelity while injecting 6.5–6.9% *false* in-contact lost time. Answered four hours later
   with a policy rule — "gate-semantics changes ship as their own campaign" — the most abstract
   durable fix in the corpus.
9. Fourteen findings across ten PRs, all acted on within 54 minutes.

**So the recommendation order is: protect and formalise the review pass before adding any new
gate.** Three pieces of evidence from this same corpus say why adding gates first would be wrong:

* A gate loosening produced a false green (catch 8).
* A guard shipped without a known-bad test case is **blind**: the staleness guard was false-negative
  **twice** — keyed first on an engine-directory commit count, then on a `web/src` tree digest —
  before a measured-surface fingerprint worked. The catalogue already states the principle: *"A
  check needs a known-bad capture before it can decide anything."*
* Gates also produce **false reds** that cost device time: an eraser readiness check firing before
  the product settled; landscape touches delivering 3–9 events with no report; a false STALE from
  `--base=HEAD`. A gate that converts false greens into false reds moves the cost rather than
  removing it.

Every gate recommended above must therefore name the known-bad artifact from this corpus that proves
it fires.

---

# Coverage and confidence

## What was analysed

|                                                                           |                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Sessions frozen with SHA-256, byte size, conversational bounds            | **41 of 41**                                          |
| Mechanically derived timing ledgers, device attribution, fix segmentation | **41 of 41**                                          |
| Narrative reports + footgun/prompt ledgers                                | **27 of 27 core sessions**                            |
| Footgun occurrences recorded                                              | **1,323**, across 915 analyzer-coined mechanism tags  |
| User-authored prompts extracted (all 41 sessions, mechanically)           | **360**                                               |
| Fixes segmented from git markers                                          | **105** across 15 sessions; 26 sessions unsegmentable |

## Deliberate scope reduction

At the user's direction (manifest decision **D11**), narrative reports cover the **27 core
sessions**; the 4 aux-planning and 10 aux-review sessions remain full corpus members with hashes,
timing ledgers, device attribution and fix segmentation, but no agent-written report. Those 14 carry
13.37 h of active time against the core 27's 83.78 h, and eight of the ten aux-review sessions are
the same stacked-review shape against consecutive layers of one stack. **Question 2 is unaffected**
— prompts were extracted mechanically across all 41. **Question 3 is unaffected** — it was always
derived mechanically across all 41. **Question 1 loses narrative depth on those 14 sessions.**

## Confidence, by question

* **Q3 — high.** Derived mechanically from all 41 transcripts, with call/result pairing verified (0
  unpaired across 18,002 tool calls), records sorted by timestamp before interval maths, and every
  wall-clock figure an interval union. Device occupancy is reported as a range because it is
  definition-sensitive (9.52 h strict → 37.1 h bridging 5-minute gaps); the conclusion holds at
  every definition.
* **Q2 — high for the two recommendations, moderate for the element counts.** The epic-inventory
  case rests on a measured error (13 of 27 children missed) and the stacked-diff case on an
  eleven-for-eleven result plus a grep proving the rule is unstated. Clustering thresholds are
  judgement calls; the underlying prompts are quoted with anchors.
* **Q1 — moderate to high on the seven open mechanisms, high on the structural conclusion.** Each
  open mechanism was checked against all five destinations at the evaluated SHA. Two caveats: the
  promoted-arm and `--output-root` child-side checks were targeted greps rather than audits of the
  promotion tool and the capture child; and 14 sessions have no narrative report, so the occurrence
  counts are a floor.

## Known limitations

* **The 77.91 h attributed time-lost is not wall-clock.** Occurrences overlap, several spans contain
  productive work, and the distribution is extreme (median 19 s, top ten = 34% of the total). Use
  the timing ledgers for wall-clock.
* **915 mechanism tags for 1,323 occurrences** means most tags are session-local. Nine synonym
  merges were applied (`work/canon.json`); a deeper semantic merge would reduce the count but was
  not attempted beyond the cross-session recurrences reported here.
* **`is_error: false` masks real failures in at least one session** (6e508a29) because captures are
  piped through `| tail`, bounding what any failure-flag search can find there.
* **One anchor-notation exception:** `L<n>` denotes a transcript record throughout, except
  d2249b1c's report line 1029 where "L4923-region of the same file" refers to a source file.
  Verified, not fabricated.
* **The checked-in Codex extractor opens the live `~/.codex/state_5.sqlite`** read-only, which the
  brief forbids; disclosed as manifest decision **D9**, a backup was taken, and every later query
  used the snapshot.
* **Skeletons exceed the skill's stated ~50k tokens** by up to 15× (manifest **D10**), so 14
  sessions were chunked at record boundaries with a merge step; chunking is a method detail, and
  every merged report was verified for section completeness before commit.
* The sibling Codex lane's commits are visible in `git log --all` because worktrees share one
  `.git`. None of its work is included here.

## The caution I would attach to any future audit of this repository

Six verdicts in this study moved after checking the repository, four in the campaign's favour. The
lessons live in five destinations, and the self-heal loop closes in minutes. **A transcript-only
reading of this campaign will overstate what remains broken.** The per-session reports in `reports/`
are written to be re-checkable for exactly that reason: every substantive claim carries an
`L<line> <timestamp>` anchor into the raw JSONL.
