# ADR-0078: Playwright Worker Count Is Measured, Not Assumed

**Status:** Active **Date:** 2026-07

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

**Commit-order races.** The brush→engine mode toggle flows through a Svelte `$effect`, so a stroke
dispatched shortly after `pickBrush()` can commit while the engine is still in the previous mode.
`flows-magic-brush.spec.ts`'s header already documented this, including the part that makes it
invisible: *"a canvas-fill count is immune — a pen stroke fills it too."* Three tests measured with
exactly such a count, so a 132px **pen** line passed as a 2314px magic reveal.

No timeout fixes this class. The failure is already committed before anything observes it, which is
why the failing assertion sat unchanged through a full 5s poll. The fix is to **redraw**, following
the `drawMagicReveal` pattern the file already established — measured at 16/200 failures before and
4/200 after, at 8 workers.

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
`retries: 2` absorbs the flakes is a local optimisation that also hides accumulating flakiness —
which is how the magic-brush tests reached the state they were in.

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
  unresolved and tracked as issue \#658 — 2c's cap is not the lever either way.

− **The deeper seam is unaddressed.** Tests can only observe when the *button* changes, not when the
engine commits the brush mode. A dev-harness signal for the engine's committed mode would retire the
commit-order class outright; until then, affected specs carry redraw retries.

− Setting `workers` per environment means the two paths can diverge in behaviour, so a flake that
only appears at one worker count will reproduce on only one of them.

## Reproducing and re-tuning

The full study — every configuration, both hardware profiles, the charts, and the hypotheses that
were falsified — is committed at
[`scrapbook/e2e-tuning/`](https://kylemit.github.io/Splotch/e2e-tuning/), regenerated with
`npm run gen:e2e-tuning-report` from the datasets recorded in `scripts/gen-e2e-tuning-report.mjs`.
That page carries the exact commands for a re-sweep.

To re-measure the attempt distribution in 2c, wrap each redraw site's callback in a counter that
appends `{site, attempts, ok, ms}` to a log file, then round-robin the worker counts over
`npm run test:e2e -- flows-magic-brush.spec.ts --workers=$w --repeat-each=10` against an
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
