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
  exceeds. Two workers wins despite finishing ~11s later.
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
reveal in software; the reveal sits near its 15s budget regardless of how many workers run. That is
also why `MAGIC_REVEAL_TIMEOUT` was raised from 15s to 30s — on CI the failures landed *at* the
budget (15.6s, 15.7s, 18.4s against 15s), not far past it.

That change was then re-measured, and the result is two-sided rather than clean:

| workers           | failures before → after | wall before → after |
| ----------------- | ----------------------- | ------------------- |
| 4 (what CI ships) | 2 → **0**               | 60.2s → 64.8s       |
| 1                 | 3 → 3                   | 95.2s → **138.1s**  |

It fixed the setting that ships and did nothing for one worker, where the same three failures now
cost far more: with `test.slow()` in play a non-converging reveal burns its full 90s budget instead
of failing at 30s. So those failures were never time-starved — `drawMagicReveal` churns
draw→check→undo→redraw, and a larger budget lets a non-converging loop churn longer. The budget
helped where the reveal was merely slow and not where the loop never converges. Kept because the
shipped configuration is clean, but the cost is real: a magic-brush failure on CI is now up to 90s
per attempt, tripled by retries.

So the same suite is limited by different things in the two places: contention locally, raw canvas
throughput on CI. Worker count fixes only the first.

### 3. Contention breaks tests two different ways, and only one is a timeout problem

This distinction is the reason the flakes resisted three separate fixes.

**Deadline exhaustion.** Fixed wall-clock budgets (`MAGIC_REVEAL_TIMEOUT = 15_000`,
`click({ timeout: 1000 })`, the 30s test timeout) against latency that inflates with contention.
Each test has a headroom ratio — budget ÷ normal duration — and fails when inflation exceeds *its*
headroom. That predicts the observed shape: distinct failing tests go 2 → 2 → 10 → 18 across 3, 4, 6
and 8 workers, sweeping a rising threshold through the suite's distribution of headroom rather than
breaking the same tests harder.

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

\+ The falsified hypotheses are recorded (in the scrapbook study and in 5f39e35's message), so the
next person does not re-test input coalescing or baseline polling.

− **Local runs are ~12s slower.** That is the deliberate trade: latency for signal.

− **The numbers are hardware-specific and will rot.** Nothing here transfers to a different runner
without re-measuring. The shape (saturation near cores−1) should hold; the optimum will not.

− **The CI setting leans on retries to stay cheap.** Choosing the fastest worker count on CI because
`retries: 2` absorbs the flakes is a local optimisation that also hides accumulating flakiness —
which is how the magic-brush tests reached the state they were in.

− **A magic-brush failure on CI is now expensive.** `test.slow()` plus the 30s reveal budget means a
non-converging reveal burns 90s per attempt and up to ~4.5 minutes across retries. The measured
failure rate at 4 workers is 0/1015, so this should be rare — but reverting the timeout is the fix
if it is not.

− **CI's real limit is canvas throughput, not workers.** A GPU-less runner rasterizes the magic
reveal in software, so those specs sit near their budget at any worker count. Worker tuning cannot
help there; only cheaper assertions or larger budgets can.

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
