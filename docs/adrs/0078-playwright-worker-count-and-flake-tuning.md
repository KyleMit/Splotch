# ADR-0078: Playwright Worker Count Is Measured, Not Assumed

**Status:** Active, partly superseded by [0080](0080-committed-brush-mode-seam-and-paced-strokes.md)
**Date:** 2026-07

## Context

`playwright.config.ts` set `workers: '100%'` with a comment justifying it on wall clock alone: "on a
4-core box that's the difference between ~90s and ~58s for the suite." Playwright's own default is
~50% of logical cores, so this was a deliberate override — but the flake cost of that override had
never been measured, and the number it was measured against had drifted.

The suite was visibly unreliable. Ten consecutive local runs at `'100%'` produced **five distinct
flaky tests and four red runs**, all of them passing 10/10 when re-run in isolation. CI hides this:
`retries: 2` turns a flaky test into a silent retry, so the cost lands on developers running locally
with `retries: 0`, not on the PR status check.

Three explanations were plausible and mutually exclusive, and picking between them by reasoning
alone was not working:

* **The tests are wrong** — fix them and keep the parallelism.
* **The worker count is wrong** — lower it and keep the tests.
* **Both**, in some proportion that determines which to do first.

The sub-question that made this hard: `'100%'` is a *percentage*, so its meaning changes per
machine. Reasoning about "one worker per core" assumes a Playwright worker costs one core. Nobody
had checked whether that is true.

## Decision

**The worker count is a measured quantity, recorded with its hardware, and re-measured when the
hardware changes.** Three things follow from that.

### 1. `workers` is set per environment, from measurements

```ts
retries: process.env.CI ? 2 : 0,
workers: process.env.CI ? 4 : 2,
```

Not `'100%'`, and not a percentage at all. A percentage silently means something different on a
2-core CI runner than on a 16-core laptop, and the measured curve does not transfer between them.

The split is not arbitrary — it falls out of an expected-cost model,
`wall + P(red) × cost of a red
run`:

* **Locally** (`retries: 0`) a red run costs a re-run plus the attention to notice and triage it.
  The break-even is only **~15 seconds of attention** on top of the re-run, which triage always
  exceeds. Two workers wins despite finishing ~10.2s later.
* **On CI** (`retries: 2`) flakes are absorbed cheaply, and the measured flake rate barely moves
  between 1 and 6 workers — so wall clock decides, and 4 workers is the fastest setting measured
  (60.2s, against 63.1s at 3 and 69.6s at 2).

### 1b. The count is derived from the ratio — the literals were never the finding

```ts
const CORES_PER_WORKER = 2; // §2
const saturation = availableParallelism() / CORES_PER_WORKER;
workers: process.env.CI ? Math.max(2, cores) : Math.max(1, Math.floor(saturation));
```

`workers: process.env.CI ? 4 : 2` is right for the 4-core boxes measured above and wrong everywhere
else: `2` on a 10-core laptop leaves most of the machine idle, a regression against the `'100%'` it
replaced for anyone on bigger hardware. §2's **ratio** is the part that reproduced across two
unrelated machines, so that is what the count derives from. `availableParallelism()` rather than
`cpus().length`, because it respects cgroup CPU quotas and so does not over-report inside a
container. `--workers=N` still overrides.

The CI/local split survives derivation because it encodes flake *cost*, not hardware: locally a
flake costs a re-run plus triage, so local sits *at* capacity, while retries make a flake cheap
enough on CI that wall clock decides among settings whose flake rates don't differ. §4 measures that
they don't, at 4 cores: 4 workers went 1/35 runs red against 3 workers' 3/35, and 3.2s faster per
run. So CI goes to **twice** capacity — `cores` — which is also the most oversubscription measured
as safe.

Two edges it cannot claim, recorded rather than smoothed over:

* **SMT is untested, and is the likeliest place the formula is wrong.** `availableParallelism()`
  counts *logical* CPUs, and both measurement boxes ran one thread per core — so `cores / 2` and
  "physical cores" were indistinguishable there. On an 8-logical / 4-physical laptop the formula
  says 8 where physical capacity argues 4. Settling it needs a real SMT machine, which a cloud
  container is not.
* **Above 2× capacity there are no clean numbers at all.** Only 4 cores was ever measured, so bigger
  machines are extrapolation from a ratio fitted at one point — and 6 and 8 workers were measured
  only *before* §4's spec fix, so what breaks at 3× and 4× capacity is unknown rather than merely
  untested. `cores` never exceeds 2×, which keeps the formula inside the measured region on any
  machine. The ratio form is chosen because the failure mode is contention-driven deadline
  exhaustion, whose severity tracks the oversubscription *ratio* (§3) rather than any absolute
  worker count — mechanism, not measurement.

### 2. Each worker costs ~2 cores, which is why `'100%'` oversubscribed

Per-test latency inflation (each test's mean duration ÷ its own mean at one worker) tracks **w/2**
almost exactly past the saturation point:

| workers                      | 2     | 3     | 4     | 6     | 8     |
| ---------------------------- | ----- | ----- | ----- | ----- | ----- |
| local inflation              | 1.27× | 1.67× | 2.13× | 3.06× | 4.10× |
| CI inflation                 | 1.38× | 1.88× | 2.34× | 3.58× | 4.35× |
| implied cores/worker (local) | 2.54  | 2.23  | 2.13  | 2.04  | 2.05  |
| implied cores/worker (CI)    | 2.77  | 2.51  | 2.34  | 2.39  | 2.18  |

The ratio reproduced on completely different hardware, which is the part that generalises.

A "worker" is not one process — it is a Chromium (browser, renderer, GPU, network, utility
processes, many threads) plus a Node runner, alongside the shared `vite preview` server. On 4 cores
that means saturation begins at **2 workers**, which is exactly where the wall-clock gains stop: 1→2
saves 74.1s, 2→3 saves 9.3s, 3→4 saves 5.1s, 4→6 saves nothing, and 6→8 *costs* 4.4s.

Because the machine is already saturated, everything past w=2 divides fixed capacity rather than
adding any. The CPU accounting shows the waste directly — summing every test's duration in a run
should be flat (it is the same 203 tests) and is not: 179.5s at 2 workers, 225.4s at 3, **293.3s at
4** against the 152.4s an uncontended run needs.

### 2b. On CI, contention is not the dominant flake driver

> **The failure columns below are contaminated — see
> [§4](#4-most-of-the-measured-flake-rate-was-the-harness).** Every rep in this sweep shared one
> preview server, and the suite deliberately fills 60-second per-IP rate-limit windows, so a rep
> inherited the previous rep's spent budget. The wall-clock column and the conclusion drawn from it
> (4 workers, and the shape of the curve) stand; the flake rates are an upper bound on something
> that was mostly the harness.

The CI sweep (`ubuntu-latest`, 5 reps per worker count, one runner each, retries off) did **not**
reproduce the local flake curve:

| workers             | 1     | 2     | 3     | 4         | 6     | 8       |
| ------------------- | ----- | ----- | ----- | --------- | ----- | ------- |
| wall clock (median) | 95.2s | 69.6s | 63.1s | **60.2s** | 63.5s | 60.4s   |
| green runs          | 2/5   | 3/5   | 4/5   | 3/5       | 4/5   | **0/5** |
| failures / 1015     | 3     | 2     | 1     | 2         | 2     | **9**   |

The rate is flat from 1 to 6 workers and only breaks at 8. **One worker was the second-worst
setting** — three failures, two of them 30s timeouts — which rules contention out as the cause,
because at one worker there is none. The runner has no GPU, so Chromium rasterizes the magic-brush
reveal in software; the reveal sits near its 15s budget regardless of how many workers run. That
also prompted raising `MAGIC_REVEAL_TIMEOUT` from 15s to 30s, since the failures landed *at* the
budget (15.6s, 15.7s, 18.4s against 15s) rather than far past it.

**That change was tried, measured, and reverted.** It is recorded here because the measurement is
the useful part:

|                                | for 30s                       | for 15s                                                                                                                        |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Shipped CI setting (4 workers) | 2 failures → **0**, 5/5 green | —                                                                                                                              |
| 1 worker                       | —                             | 3 failures → **3**: no contention to relieve, so no gain                                                                       |
| Wall clock at 1 worker         | —                             | 95.2s → **138.1s**, one rep 230s                                                                                               |
| Failure cost                   | —                             | a stuck reveal burns 90s, not 30s                                                                                              |
| Suite critical path            | —                             | 90s exceeds the ~70s parallel floor at 4 workers, so one stuck test *becomes* the makespan; ×3 retries ≈ 270s, ~4× a clean run |

Two things decided it. First, at 4 workers the two failures it fixed were **already invisible** —
with `retries: 2` a 2/1015 rate reaches red essentially never, so the win landed where retries had
already paid. Second, a stuck reveal is not time-starved: `drawMagicReveal` churns
draw→check→undo→redraw, so a wider window only lets a non-converging loop churn longer. The budget
helped where the reveal was merely slow and did nothing where the loop is stuck.

So the same suite is limited by different things in the two places: contention locally, raw canvas
throughput on CI. Worker count fixes only the first.

### 2c. The redraw loop is bounded by attempts, not by wall clock

> **Superseded by [ADR-0080](0080-committed-brush-mode-seam-and-paced-strokes.md).** The redraw
> loops and `MAGIC_REVEAL_MAX_ATTEMPTS` are gone: with the engine's committed mode observable and
> the specs' own strokes paced inside the engine's dropped-pointer threshold, a redraw has nothing
> left to rescue. The reasoning below about *what a wall-clock bound cannot do* still holds and is
> why nothing replaced the cap; the attempt distribution it measured was recording truncated
> strokes, not the mode race it attributes them to.

The reverted experiment above left one lever: stop the churn sooner. `drawMagicReveal` and the three
sibling redraw loops in `flows-magic-brush.spec.ts` were bounded only by a `toPass({ timeout })`
wrapper, and wall clock is the wrong bound for this failure. A wrong-mode stroke is already
committed, so a redraw loop has exactly two futures: it recovers on the next attempt, because the
`$effect` has since landed and the mode is now correct for good, or it is stuck and no further
attempt can change that. A timeout cannot tell those apart — it spends the whole budget either way.

Distinguishing them needs the attempts-until-success distribution, not a guess: picking a cap blind
risks failing the valid-but-slow reveals the loop exists to rescue. The helper was instrumented to
log attempts and elapsed time per call, and `flows-magic-brush.spec.ts` was run at
`--repeat-each=10` across four worker counts on the local profile above (328 recorded calls across
all four redraw sites):

| workers | calls | landed on attempt 1 | on attempt 2 | on attempt 3+ | never converged |
| ------- | ----- | ------------------- | ------------ | ------------- | --------------- |
| 1       | 90    | 90                  | 0            | 0             | 0               |
| 2       | 79    | 79                  | 0            | 0             | 0               |
| 4       | 79    | 77                  | 1            | 0             | 1               |
| 8       | 80    | 71                  | 9            | 0             | 0               |

The distribution has no tail. Every one of the 327 successes landed by the second attempt, and the
second attempt is only ever needed under contention — it appears at 4 and 8 workers and never at 1
or 2. The single non-converging call is the whole pathology in one data point: it ran **4 attempts
and 14.05s**, i.e. it churned until the budget expired and then failed anyway.

So `MAGIC_REVEAL_MAX_ATTEMPTS = 3` — one spare attempt above the measured distribution, keeping the
second chance a valid-but-slow reveal needs while refusing to pay for a fourth that has never once
helped.

Measured against a forced non-converging reveal (the magic brush deliberately never selected, so
every attempt paints one flat pen colour), the failure cost drops from **15.00s — the entire budget,
on all three runs — to 9.19s**. The number matters less than the shape: the cost is now a function
of the cap, not of a clock, so the objection that killed the 30s bump — that widening the window
widened the stuck case with it — no longer applies to anything.

**The cap is the loop's only bound, and getting there took two tries.** The first version kept
`MAGIC_REVEAL_TIMEOUT` alongside the cap as a "backstop", exiting the loop on whichever bound came
first. Review killed it, and the reason generalises past this helper:

* **A between-attempts deadline cannot do the job that would justify it.** It never interrupts an
  attempt, so it cannot rescue "one attempt runs long" — the case it was there for. It can only cut
  the loop *shorter*, and the loop can still overrun it by a full attempt. Probed on the shipped
  loop shape: a 4s always-failing attempt under a 5s deadline failed at **8009ms**, where
  `toPass({ timeout: 5000 })` hard-stops mid-attempt at 5013ms. So relative to `main` the budget had
  quietly stopped being a ceiling at all.
* **Worse, it made the effective cap a function of machine speed.** A slower runner spends the
  budget inside earlier attempts and silently loses the third. That is exactly the
  deadline-exhaustion failure §3 names, reintroduced inside the fix for it — and it is invisible,
  because both exits produced the *cap's* diagnosis. The same probe exited at `tries=2` on the
  deadline and still reported "never landed in 2 attempt(s)", pointing a future tuner at the cap
  when the truth was the clock.

So the deadline is gone and `MAGIC_REVEAL_TIMEOUT` with it — nothing polls against it any more,
since each attempt's own wait is `REVEAL_ATTEMPT_SETTLE_MS`. Playwright's per-test timeout is the
real outer ceiling, and unlike a deadline inside the loop it *can* stop a hung attempt mid-flight.
Two bounds remain, each owning one decision: how long one attempt waits, and how many attempts there
are.

### 3. Contention breaks tests two different ways, and only one is a timeout problem

This distinction is the reason the flakes resisted three separate fixes.

**Deadline exhaustion.** Fixed wall-clock budgets (the magic reveal's since-removed 15s window,
`click({ timeout: 1000 })`, the 30s test timeout) against latency that inflates with contention.
Each test has a headroom ratio — budget ÷ normal duration — and fails when inflation exceeds *its*
headroom. That predicts the observed shape: distinct failing tests go 2 → 2 → 10 → 18 across 3, 4, 6
and 8 workers, sweeping a rising threshold through the suite's distribution of headroom rather than
breaking the same tests harder. 2c is a worked example of how easily this class hides: a deadline
added as a *safety net* beside an attempt cap turned the cap itself into a headroom ratio.

**Commit-order races.** *(Diagnosis corrected in
[ADR-0080](0080-committed-brush-mode-seam-and-paced-strokes.md): once the engine's mode became
observable, no failure in ~700 recorded reveals was in the wrong mode. The 132px stroke below is a
stroke the engine truncated — it paints the page's colours, not ink — and the fix that measured
16/200 → 4/200 was rescuing that by redrawing.)* The brush→engine mode toggle flows through a Svelte
`$effect`, so a stroke dispatched shortly after `pickBrush()` can commit while the engine is still
in the previous mode. `flows-magic-brush.spec.ts`'s header already documented this, including the
part that makes it invisible: *"a canvas-fill count is immune — a pen stroke fills it too."* Three
tests measured with exactly such a count, so a 132px **pen** line passed as a 2314px magic reveal.

No timeout fixes this class. The failure is already committed before anything observes it, which is
why the failing assertion sat unchanged through a full 5s poll. The fix is to **redraw**, following
the `drawMagicReveal` pattern the file already established — measured at 16/200 failures before and
4/200 after, at 8 workers.

### 4. Most of the measured flake rate was the harness

Issue \#653 asked for the flake rate to be re-measured once #650 and #651 landed, and for the retry
count to be chosen against it. Re-measuring came first, and it changed the question: the sweep that
produced §2b's rates was generating most of them.

**Mechanism.** Reps ran back to back against one preview server, and the suite deliberately fills
two 60-second per-IP rate-limit windows — `generate-image.spec.ts` exhausts the BYOK bucket (30
hits) and bursts the managed token's (15). A rep takes about as long as those windows last, so a rep
inherited the previous rep's spent budget and its guard tests took a 429 where they assert a 415 or
a 413. Nothing to do with the app or the specs: the sweep protocol alone.

**It is not a rounding error.** On `ubuntu-latest` at 4 workers,
`throttles a managed token hammered
in a burst` failed in **12 of 12** reps. Locally at 4 workers
the BYOK guard tests were 4 of 5 failures across 7 reps. Those are the same specs §2b's counts are
made of.

**Fix.** `scripts/e2e-sweep.mjs` owns the protocol — a fresh preview server per rep, `CI` unset for
the run, one summary line per rep — and both the local sweep and the workflow drive it. That is the
general lesson too: every defect the shell-in-YAML version shipped with (a missing managed code, a
missing harness probe code, this) existed because only one of its two callers could ever have caught
it. *(2026-08, issue \#1044: the driver — now `tools/e2e-tuning/run-worker-sweep.mjs` — no longer
boots that server itself. Once `reuseExistingServer: false` became unconditional, the sweep-owned
server collided with the config's own webServer and every rep silently reported 0 tests as 0
failures. Playwright now boots the fresh per-rep server; the driver builds once up front and sets
`SPLOTCH_E2E_PREBUILT` so reps serve that bundle preview-only, a zero-execution rep counts as red,
and `npm run test:sweep:smoke` exercises one grepped rep on every PR so the harness can't rot
unnoticed between re-tunes.)*

**Re-measured**, 15 reps per configuration, one runner each, retries off (run 30512081902):

| workers         | 1     | 2     | 3        | 4     | 6     | 8     |
| --------------- | ----- | ----- | -------- | ----- | ----- | ----- |
| runs gone red   | 6/15  | 2/15  | **0/15** | 6/15  | 15/15 | 15/15 |
| failures / 3060 | 6     | 3     | **0**    | 6     | 15    | 23    |
| per-test rate   | 0.20% | 0.10% | **0%**   | 0.20% | 0.49% | 0.75% |
| seconds per rep | 140.2 | 84.2  | 69.7     | 66.5  | 65.3  | 63.9  |

Seconds per rep come from the sweep step's own duration, so they include the ~4s the driver spends
booting a fresh server — compare the shape against §2b's column, not the absolute values.

**That table is one spec.** Read on its own it says the rate rises steeply with workers and that 4
is significantly worse than 3 — and a first pass of this record said exactly that, setting §1b's
coefficient to 1.5× capacity on the strength of it. The tell that it was wrong is in the table: 6
workers failed in **15 of 15** reps, which is a deterministic failure, not a flake rate. It was
`a burst of screenshot taps shares one save before allowing the next`, whose fixed 500ms sleep was
waiting for a save to *happen*; the more starved the worker, the more reliably it missed. It is
fixed here (a poll for the positive half, a named idle window for the negative one).

Re-measured after that fix, 35 reps at each of the two candidate counts:

| workers         | 3     | 4        |
| --------------- | ----- | -------- |
| runs gone red   | 3/35  | **1/35** |
| failures / 7175 | 3     | 1        |
| median wall     | 69.7s | 66.5s    |

**So the gradient was the spec, not the worker count.** Three and four are indistinguishable (Fisher
p = 0.61) and four is 3.2s faster, which puts the coefficient back at 2× capacity — `cores`, as
first proposed in issue \#649. The 1.5× detour is recorded rather than quietly reverted, because the
mistake generalises: **a worker count tuned against a rate that one bad spec dominates is tuning
around the spec.** ADR-0080 reached the same conclusion from the other direction, and this record
had already made the error once in §2b.

What that leaves genuinely unknown is the ceiling. Six and eight workers were only ever measured
*before* the fix, so 3× and 4× capacity have no clean numbers at all — the one hint is that w=8
carried 8 failures beyond the deterministic one where w=6 carried none, so something does break
further up. `cores` never exceeds 2× capacity, which is the most that has been measured as safe.

One earlier surprise survives, and is worth keeping because it was surprising twice: **one worker is
among the worst settings** (6/15), with no contention to blame. The GPU-less runner rasterizes
canvas work in software, so those specs sit near their budgets however few workers run — which is
why the curve is a U and not a slope, and why worker tuning alone was never going to reach zero.

### The retry count

The residual at the shipped configuration — 4 workers — is **1 of 35 unretried runs going red**.
That is 2.9%, with a 95% confidence interval reaching **12.9%**: one observed failure in 35 does not
establish a rate. Three workers, which the formula never selects on CI, was 3/35. The two are worth
keeping apart — pooling them into "4 red in 70" quotes a figure for a configuration that was
measured 35 times, and the pooled 5.7% then collides with the worst spec's own 2/35 two sentences
later.

Across both counts the failures belong to three specs, all zoom/pinch gestures:

| spec                                                                    | reps failed |
| ----------------------------------------------------------------------- | ----------- |
| `closing the overlay resets the zoom for the next open`                 | 2/35 (w=3)  |
| `navigating to another section resets the zoom`                         | 1/35 (w=4)  |
| `a pinch swallows the trailing click, so it never toggles the control…` | 1/35 (w=3)  |

**`retries: 2` stays, and the interval is the whole argument.** `0` reddens a run whenever the
residual does, with no evidence it is rare enough to bear. `1` needs a spec to fail twice, which
looks like ~0.1% *if the attempts are independent* — and they are not: a retry runs immediately
afterwards on the same starved machine, so the squaring flatters exactly the failure mode being
retried. Dropping to `1` on a point estimate whose interval spans 12.9% would be choosing a knob
against a number the data does not support — the mistake this same section records above.

What changes is that the debt stops being silent. `web/playwright-flaky-reporter.ts` turns every
retried pass into a GitHub Actions annotation plus a job-summary table, so "green, but only on
attempt 2" is visible on the run page. That is the standing objection in the Consequences below —
retries hiding what they compensate for — answered without pretending the rate is lower than it is.

**Reducing the count is downstream of those three specs** (issue \#665), not of another sweep.
Fixing one spec took 4 workers from 6/15 red to 1/35; three more of the same kind is what makes
`retries: 1` a measurement rather than an assumption. They are a coherent cluster (zoom/pinch
gesture state), which is a better starting point than a rate.

### 4a. The zoom/pinch cluster was one bug, and the count still does not move

The three specs above were a cluster because they shared a cause, and it was not in the code they
were testing. All four failures land on the first assertion after the gesture — zoom still 1, or the
ghost-click guard never primed — i.e. the pinch did nothing at all.

**Mechanism.** `dialogFlyFromOrigin` (`app.css`) opens a modal at `scale(0.05)` translated **onto
the button that opened it**, and `modalDialog` arms a launch dead zone at that same point
(`launchGuard`: 72px, 600ms) whose capture-phase `pointerdown` handler swallows everything inside it
— dialog content included, deliberately, so a toddler's repeat taps cannot work the controls that
painted under the finger (issue \#308). So for the opening frames the *whole dialog* sits in that
dead zone. Stepping the animation by hand, Settings' content pane centers **6px** from the launch
origin at the first keyframe, 60px at 10ms, and only clears the 72px radius around 13ms.

The specs read that pane's **live** rect and dispatched synthetic pointer events at it from an
`evaluate`, which skips the actionability checks a real Playwright click performs — so they could
aim straight into the guard. A CSS animation advances with *rendered frames*, so a starved worker
parks the dialog on that first keyframe for far longer than 13ms of wall clock: that is the
contention coupling. Held at frame 0, the pinch's `pointerdown` comes back `defaultPrevented` and
the zoom stays 1, which reproduces the failure exactly. `a two-finger pinch enlarges the pane` is
structurally identical and never failed in 70 reps — its extra `paneZoom` round trip lets the fly-in
advance first, which is the tell that the window is about one round trip wide.

**Fix.** `openSettingsModal` awaits the fly-in's `Animation.finished` (`settleFlyIn` in
`tests/helpers.ts`). Landed, the pane rests 574px from the launch origin, so the dependency on
animation progress is removed rather than timed. Nothing in the app changed: the dead zone
swallowing content that is momentarily sitting on the launch button is what it is for.

**The same window reaches a real click** (2026-09-02). The paragraph above leans on the
actionability checks a real `.click()` performs, and they are not enough: Playwright's stability
check is two consecutive frames with an identical rect, and a CSS animation still *pending* its
start time holds its first keyframe across frames, so a starved compositor that grants the start
late passes the check with the dialog parked at 5% scale on the launch button. Five
`ai-report.spec.ts` tests that click the report confirmation's buttons straight after it opens were
39 of the 52 retried passes in 106 CI runs; the `Escape` and reduced-motion variants in the same
spec had none. A probe run under full-suite contention at 4 workers captured it: the click
dispatched 52ms after `showModal()`, at a 17×21px dialog with its fly-in `running/pending@0`, 9px
from the origin — inside the zone, swallowed, no request sent. The fix is the one above, applied
before the first pointer action on the dialog rather than only before a coordinate read
(`landedReportConfirm` in `tests/ai-harness.ts`).

**Re-measured**, 35 reps at 4 workers, retries off (run 30581020210):

| spec cluster                                                                      | before    | after |
| --------------------------------------------------------------------------------- | --------- | ----- |
| the three zoom/pinch specs                                                        | 4/70 reps | 0/35  |
| `pointer exploration still snaps a hexagon gap and commits the highlighted color` | 0/70 reps | 1/35  |
| runs gone red (4 workers)                                                         | 1/35      | 1/35  |

**So the cluster is gone and the rate is not.** The red run belongs to a spec in a different
subsystem — the colour picker's gap snap, where a `mouse.move` into the gap between hexagons left
the nearest one un-highlighted. It did not fail once in the 70 reps behind the table above, so this
is not a regression the fix introduced so much as the next spec down becoming visible once the
loudest one stopped.

**`retries: 2` therefore stays.** The precondition §4 set was a clean sweep, and 1 of 35 is not one:
the red-run rate at the shipped count is where it was, so every argument above still applies
unchanged. What has changed is what the number is *made of* — a single identified spec rather than
an unexplained residual — and which spec the next attempt should start from. Reducing the count is
now downstream of `pointer exploration still snaps a hexagon gap and commits the highlighted color`,
not of issue \#665.

The wider lesson is the one §4 already records twice: a rate that one spec dominates is not a rate.
Three specs looked like a cluster of gesture-state races and were a single missing wait shared by
the helper all three called.

## Consequences

\+ The worker count is now defensible: 91 local runs and 30 CI runs, with the hardware recorded
alongside the numbers.

\+ Local runs get a materially more trustworthy signal — the configuration that produced 4 red runs
in 10 is gone.

\+ The three repaired tests removed a real defect, not just contention sensitivity: they could pass
while asserting on a pen stroke, so they were under-testing the magic brush even when green.

\+ **That claim only became true on review.** As first written it held for the eraser site alone —
its assertion requires the pixel count to *fall*, which a magic pass cannot do. The two letterbox
sites still could not tell the modes apart, because a pen sweep and a reveal paint the *identical*
pixel count in both bands (measured 2845 left, 2065 top). Counting distinct colours does not rescue
it either: the rotation-lock top margin is a flat extension of one edge colour, so both quantize to
a single bucket. What separates them is *which* colour — a pen paints the active ink (171,113,225 =
`TEST_PALETTE.purple`), a reveal paints the page's own edge colours (201,233,243 sky). Both bands
now assert on non-ink pixels, and each test first asserts purple is still the active swatch, so the
check cannot silently stop discriminating if that default changes.

\+ The falsified hypotheses are recorded (in the scrapbook study and in 5f39e35's message), so the
next person does not re-test input coalescing or baseline polling.

− **Local runs are ~10.2s slower** (92.3s at 2 workers vs 82.1s at 4, post-fix). That is the
deliberate trade: latency for signal.

− **The numbers are hardware-specific and will rot.** Nothing here transfers to a different runner
without re-measuring. The shape (saturation near cores−1) should hold; the optimum will not.

− **The CI setting leans on retries to stay cheap.** Choosing the fastest worker count on CI because
retries absorb the flakes is a local optimisation that also hides accumulating flakiness — which is
how the magic-brush tests reached the state they were in. *(Mitigated, not removed:
`web/playwright-flaky-reporter.ts` annotates every retried pass, so the hiding is now visible. §4.)*

\+ **The count is derived, so new hardware needs no edit** — but two edges are untested and stay
untested until someone runs the suite on the machines that would settle them: SMT, and any core
count other than 4 (§1b).

− **A measurement harness is code, and this one was wrong for two months.** §4's contamination was
invisible because the sweep lived as shell inside a workflow that only ever ran on CI, while the
local half was a different loop entirely — so neither could check the other, and three separate
defects shipped that way. The protocol now lives in one driver both callers use, with the parts that
can be asserted asserted (`scripts/tests/worker-sweep.test.mjs`). The general form: a measurement
you cannot run in two places is a measurement nobody has reviewed.

− **CI's real limit is canvas throughput, not workers.** A GPU-less runner rasterizes the magic
reveal in software, so those specs sit near their budget at any worker count. Worker tuning cannot
help there, and — as the reverted experiment showed — neither does a larger budget when the retry
loop is what is stuck. The attempt cap (2c) removes the churn; cheaper assertions are the remaining
lever.

\+ **The failure reports evidence instead of prescribing a fix.** With one bound, the message can
state what actually happened — how many attempts ran and how long each took — and name the two
readings of it. That matters because the durations discriminate: attempts that each ran out the full
settle window mean the reveal never rasterized (more attempts cannot help), while quick failures
mean the mode race the retry exists for. An earlier draft said "raise `MAGIC_REVEAL_MAX_ATTEMPTS`",
which the cold measurement below showed to be the wrong advice for the only non-convergence seen in
the wild.

− **The attempt cap is measured on one hardware profile and inherits that limit.** The distribution
in 2c comes from the local 4-core container; CI's GPU-less runner is the environment where reveals
sit nearest their budget, and the sweep there would need a throwaway workflow like the worker sweep
did.

− **The 2c distribution is warm-server-dominated, and the cold path fails differently.** That sweep
ran `--repeat-each=10` against an already-running preview server, so all but a handful of the 328
calls are warm repeats — while *every* CI run is cold. Review reported a cold-container failure at
the post-clear reveal in "reveals a rainbow gradient when no coloring page is applied", the slowest
reveal in the file. A dedicated cold sweep — fresh preview-server process per iteration, the spec
run first against it, 22 iterations and 102 recorded calls — **reproduced it twice**, and the
per-attempt durations say it is not the cap's problem:

* Cold calls are bimodal. 100 of 102 landed on attempt 1 in ~100–200ms; the 2 failures spent the
  **entire** settle window on all three attempts (`3018/3033/3029ms` and `3064/3017/3014ms`).
  Nothing cold ever succeeded on attempt 2 or 3 — the warm distribution's recoveries have no cold
  counterpart.
* So this failure is retry-insensitive, and that was checked rather than inferred: re-running the
  same cold protocol with the cap raised to **8** still failed, twice in 14 iterations, with all
  eight attempts at the ceiling (`3092/3041/3044/3037/3051/3034/3031/3035ms`). Raising the cap buys
  nothing and makes the failure proportionally slower, which is why the message no longer recommends
  it.
* It is not a regression from this change. The per-attempt logic and settle window are unchanged
  from `main`; `main` would have run more identically-failing attempts and gone red at its 15s
  budget instead of at 9s. Whether it is the settle window or the post-clear regeneration itself is
  unresolved and tracked as issue \#658 — 2c's cap is not the lever either way. *(Resolved in
  [ADR-0080](0080-committed-brush-mode-seam-and-paced-strokes.md): neither of the two. The
  post-clear reveal painted correctly every time — the colour-count threshold overlapped the
  reveal's own measured distribution, which is also why no number of attempts ever helped.)*

− **The deeper seam is unaddressed.** Tests can only observe when the *button* changes, not when the
engine commits the brush mode. A dev-harness signal for the engine's committed mode would retire the
commit-order class outright; until then, affected specs carry redraw retries. *(Built in
[ADR-0080](0080-committed-brush-mode-seam-and-paced-strokes.md) — where it retired the hypothesis
rather than the failures.)*

− Setting `workers` per environment means the two paths can diverge in behaviour, so a flake that
only appears at one worker count will reproduce on only one of them.

## Reproducing and re-tuning

The full study — every configuration, both hardware profiles, the charts, and the hypotheses that
were falsified — is committed at
[`scrapbook/e2e-tuning/`](https://kylemit.github.io/Splotch/e2e-tuning/), regenerated with
`npm run gen:e2e-tuning-report` from the datasets recorded in
`tools/e2e-tuning/gen-tuning-report.mjs`. That page carries the exact commands for a re-sweep.

Both halves of the sweep now run one driver, so a local re-tune and the CI one measure the same
thing (§4). The driver builds the instrumented bundle itself, so it is one command:

```sh
node tools/e2e-tuning/run-worker-sweep.mjs --workers=4 --reps=30 --out=runs
```

On CI hardware it is **Actions → "Worker sweep (manual)" → Run workflow**, whose `workers` input
takes a JSON list. Two different questions want two different shapes there: the full
`[1, 2, 3, 4, 6, 8]` curve answers *how many workers*, while `[4]` with a large `reps` is what a
**retry** count needs, because that rests on the red-run rate at the one configuration CI ships.
Read either from `grep SWEEPTOTAL` in the job log — it names the specs the failures belonged to,
which is usually the actual finding.

One thing the local half cannot measure honestly: if the box running the sweep is also running the
session that dispatched it, its own tooling shows up as contention. The numbers in §4 are from CI
for that reason.

The attempt-distribution recipe below is kept for the technique; the loops it measures no longer
exist (2c). To re-measure the attempt distribution in 2c, wrap each redraw site's callback in a
counter that appends `{site, attempts, ok, ms}` to a log file, then round-robin the worker counts
over `npm run test:e2e -- flows-magic-brush.spec.ts --workers=$w --repeat-each=10` against an
already-running preview server (step 1 of the re-sweep commands). Only the per-call counter needs
adding — `redrawUntilPasses` already collects each attempt's duration for its failure message. Force
the stuck case by calling `drawMagicReveal` **without** selecting the magic brush: every attempt
then paints one flat pen colour, so the loop cannot converge and the time to fail is the cap's cost.

The **cold** protocol is a different harness and finds a different failure, so keep them separate:
per iteration, kill and restart the preview server, wait for it to answer, then run the spec as the
first thing to touch it. Twenty-odd iterations is enough to see the post-clear rainbow failure at a
few percent. Point it at `-g "rainbow gradient" --workers=1` to isolate that test, or run the whole
spec at `--workers=4` for cold plus contention. Temporarily sourcing the cap from an env var is what
makes the "would more attempts help?" question cheap to answer.
