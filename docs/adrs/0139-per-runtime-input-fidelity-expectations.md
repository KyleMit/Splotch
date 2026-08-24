# ADR-0139: State Input-Fidelity Expectations Per Runtime, and Name the Uncalibrated Ones

**Status:** Accepted — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md);
depends on [ADR-0135](0135-split-device-capture-input-and-measurement.md),
[ADR-0138](0138-preserve-a-capture-evidence-subset.md). **Date:** 2026-08

## Context

`inputFidelity` decides whether a capture exercised the real touch path. A capture that fails it
must not be scored at all, however plausible its number looks — that rule is what stopped the
2026-08 campaign publishing `android-device-web` rows of 10–31% that were an under-driven transport
rather than the product.

The verdict was five checks with **one** calibration, taken from a schema-2 hand capture in Safari
on the target iPad. Three of the five describe that runtime rather than describing faithful input:

| Check             | What it required | What it is really describing              |
| ----------------- | ---------------- | ----------------------------------------- |
| `trustedTouch`    | trust share of 1 | faithful input                            |
| `cadence`         | 100–170 moves/s  | faithful input                            |
| `coalescing`      | `=== 0`          | **Safari's** packaging of pointer samples |
| `pressure`        | `=== 0`          | **Safari** reporting a finger             |
| `contactGeometry` | 40–100 px        | **Safari** reporting a finger             |

So a real, well-driven capture from any other runtime is marked unscoreable for a reason that has
nothing to do with how it was driven. This is the third instance of one shape, not a tidiness
complaint: `pressure` and `contactGeometry` cannot be satisfied by Chrome on Android (issue 1218),
and `coalescing` cannot be satisfied by a Capacitor WKWebView (issue 1234).

The WKWebView half looked measurable without a human. Same device, same night, same gesture, same
brush, same build, from the tracked corpus at `perf-profiles/evidence/2026-08-23-ipad-main/`:

| Runtime                          | `coalescedPerMove` | contact moves/s | verdict  |
| -------------------------------- | -----------------: | --------------: | -------- |
| Safari (`ipad-device-web`)       |              **0** |     115.9–118.6 | pass     |
| WKWebView (`ipad-device-native`) |      **1.05–1.08** |     114.7–118.4 | **FAIL** |

The cadence agrees to within a move per second across the two runtimes and moves-per-frame is ~2.0
in both. **The input is being delivered identically**; the WKWebView packages it with coalesced
samples where Safari does not.

That establishes the two runtimes report differently. **It does not establish a discriminator**, and
review caught the difference. Those four captures are all healthy, so they show what a good
WKWebView capture looks like and say nothing about what a bad one looks like — and the negative
control says `> 0` does not separate them: the under-driven Android Capacitor WebView probe of
2026-08-23 recorded `coalescing: false` under the old `=== 0` rule at **47.81 contact moves/s**,
which is more than zero coalesced samples. An inverted expectation would have passed exactly the
capture the check exists to reject. A check satisfied by its own negative control is not a check.

That verdict was never harmless. `perf:campaign` treats a failed verdict as `UNSCOREABLE` and
retries the cell to exhaustion, so every native iPad cell spent three attempts of device time
reaching the same structural answer. And the already-published `ipad-device-native` evidence carries
the same failed verdict, so the whole target has been published under a `physical-native-advisory`
class reached by an undocumented route — nothing said "this target is expected to fail
`coalescing`", leaving a future session to either ignore the campaign's own rule or discard the
target.

Three options were weighed.

**Widen `coalescing` globally** to accept any value. This is the tempting one-line fix and it is
wrong: the check does real work in Safari, where it is part of what catches an under-driven
WebDriverAgent transport. Removing it everywhere to make one runtime pass is how a gate quietly
stops gating — the same failure this campaign found in the WebKit commit gate.

**Drop the three runtime-shaped checks** and keep `trustedTouch` and `cadence`. Cheaper, and it
gives up the only evidence that a capture came from the touch path a child actually uses rather than
from synthesized input that happens to arrive at the right rate.

**State the expectations per runtime.** More surface, and it requires an honest answer for runtimes
nobody has hand-captured.

## Decision

Move the verdict into `tools/perf/lib/input-fidelity.mjs` and key the three runtime-shaped checks by
**capture runtime** — `ios-safari`, `ios-capacitor-webview`, `android-chrome`,
`android-capacitor-webview`, `desktop-playwright`. `trustedTouch` and `cadence` stay shared, because
the corpus shows them agreeing across every runtime that has been captured.

Each capture records the runtime it was taken in, and each campaign target declares the runtime its
cells are judged against, so a re-score of an artifact written before this change is judged by the
table its thresholds actually came from rather than by a guess.

**A check with no measured expectation for a runtime is recorded `UNCALIBRATED`, and an uncalibrated
check does not pass.** This is the load-bearing half. Every Android expectation is uncalibrated
today, because no Android capture has recorded what a real finger reports there — issue 1218 is that
measurement and it needs a human hand. Marking those checks uncalibrated leaves the Android verdict
exactly where it was, failing, which is the point: recapturing `android-device-web` stays blocked
until the thresholds are measured, and it stays blocked for a reason a reader can now see.

What changes is that the verdict distinguishes two things that were one boolean:

* **not passing because the capture was badly driven** — a real defect in the run, fixed by
  recapturing it;
* **not passing because the instrument has no expectation for this runtime** — a gap in the
  instrument, fixed by measuring the runtime.

`describeFidelityFailures` names them apart, so a one-line verdict reads
`cadence+pressure(uncalibrated)` rather than a flat list in which the two are indistinguishable.

**The WKWebView's `coalescing` is uncalibrated, not inverted.** An earlier revision of this ADR
adopted `coalescedPerMove > 0` on the strength of the healthy corpus above; the negative control
retired that. Inverting the expectation would have promoted the native-iPad runtime to scoreable on
positive evidence alone, which is the same mistake as leaving a Safari-shaped threshold in place — a
threshold nobody has shown can fail. It stays uncalibrated until a WKWebView capture of a known-bad
transport establishes what separates the two.

Expectations are set from tracked captures rather than from hand-written fixtures, and the test
reads those captures directly. A fixture cannot go stale against a runtime that changed what it
reports; the corpus can, which is what ADR-0138 tracks it for.

## Consequences

* − **The sixteen `ipad-device-native` cells stay unscoreable**, and the campaign still spends three
  attempts per cell reaching that verdict. What changes is that the verdict now says *why* —
  `coalescing(uncalibrated)` rather than a bare failure — so the fix is legible as one
  negative-control capture rather than as an unexplained rejection. Closing it is cheap and nobody
  has done it yet.
* − Issue 1236 (crayon costing about twice as much in the WKWebView as in Safari) still carries its
  caveat that the evidence is not formally scoreable.
* \+ Android's block is now legible. `android-device-web` reads
  `coalescing(uncalibrated)+pressure(uncalibrated)+contactGeometry(uncalibrated)` instead of a bare
  failure, which says what to do about it.
* − **`coalescing` on Android moved from incidentally passing to uncalibrated**, because Chrome
  through the split transport reports 0 and nobody has established what a real finger reports there.
  That widens issue 1218 from two checks to three. It changes no verdict — Android was already
  failing on the other two — but the hand capture has one more value to read off.
* − Five runtimes with three checks each is a table that can rot silently, exactly as the single
  calibration did. The mitigation is that every entry names the capture it was set from and the test
  reads the corpus rather than a fixture, so a runtime that changes its reporting fails a test
  instead of quietly failing captures.
* \+ The bar an entry has to clear is now stated: a positive corpus shows what a good capture looks
  like, and an expectation needs a **known-bad** capture too before it can decide anything. The
  Safari entries predate this ADR and do not meet that bar either — they were set from a hand
  capture with no negative control. They are left as they are because they are what the gate has
  always used, and re-deriving them is its own measurement; the standard applies to entries added
  from here.
* − A capture from a runtime the table does not know throws rather than falling back. That is
  deliberate: a fallback would score a capture against a table nobody chose for it, which is the
  defect this ADR exists to remove.
* − The verdict is now two concepts where operators learned one. `docs/PROFILING-CAMPAIGNS.md` and
  the `start-capture-session` skill both state the distinction, because *which check failed decides
  what the failure means* was already the operating rule and this only makes it representable.
