# ADR-0141: Cadence Is a Floor, and a Check a Runtime Cannot Answer Is Named as Such

**Status:** Accepted — amends [ADR-0139](0139-per-runtime-input-fidelity-expectations.md); depends
on [ADR-0135](0135-split-device-capture-input-and-measurement.md),
[ADR-0138](0138-preserve-a-capture-evidence-subset.md). **Date:** 2026-08

## Context

ADR-0139 split `inputFidelity`'s five checks per runtime and recorded the ones with no measurement
behind them as `uncalibrated`. It named `trustedTouch` and `cadence` as the two that were
runtime-independent **by measurement**, on the strength of a 2026-08-23 corpus reporting 114.7–119.7
contact moves/s across three runtimes.

Every capture in that corpus was machine-driven. Nothing had measured a hand.

Issue 1218 asked for that measurement on Android and needed a person, so `npm run perf:device:hand`
was built to take it once and keep the raw event rows. Eight hand captures were recorded on
2026-08-23 across both physical devices, plus a synthesized `adb` control read by the same probe
minutes later.

The corpus refutes two things ADR-0139 asserted.

**A real finger overshoots the cadence band on both devices.**

| Runtime        | Drawn         | contact moves/s | Against the 100–170 band |
| -------------- | ------------- | --------------: | ------------------------ |
| iPad Safari    | gentle        |           117.5 | passes                   |
| iPad Safari    | normal        |           237.8 | **fails**                |
| iPad Safari    | vigorous      |           268.4 | **fails**                |
| Android Chrome | unhurried     |           135.5 | passes                   |
| Android Chrome | mixed brushes |   154.0 / 154.6 | passes                   |
| Android Chrome | fast          |   175.5 / 178.0 | **fails**                |

The ceiling was documented as rejecting input "faster than a hand". It rejects a hand, on the very
iPad it was calibrated from, whenever the hand is not dawdling. What it actually bracketed was the
rate the **automated** transport happens to deliver.

**Three Android checks are not uncalibrated. They are silent.** A real finger and `adb shell input`,
on the same phone the same night, through the same probe:

| Check              | real finger | synthesized touch |
| ------------------ | ----------: | ----------------: |
| `pressure` p50     |           1 |                 1 |
| `contactGeometry`  |        none |              none |
| `coalescedPerMove` |           0 |                 0 |

Chrome reports the same values however the touch was produced. There is no threshold to find,
because there is no difference to threshold. Issue 1218 anticipated this outcome and required it be
established by measurement rather than assumed.

## Decision

**`cadence` is a floor, not a band.** The 170 ceiling is removed from the verdict. An excess rate is
still reported by `classifyInputCadence` — it is worth saying out loud — but it does not decide
whether a capture can be scored.

The floor keeps both sides of its calibration, which is what the ceiling never had:

|                                  |      measured |
| -------------------------------- | ------------: |
| Appium Android browser transport |  46.8 moves/s |
| Android Capacitor WebView probe  | 47.81 moves/s |
| WebDriverAgent HTTP on the iPad  | 60–61 moves/s |
| **floor**                        |       **100** |
| slowest hand capture recorded    | 117.5 moves/s |

**A check whose runtime answers identically for a finger and for a robot is `NOT_APPLICABLE`, and is
absent from `checks` rather than present and true.** It was never asked, so there is no answer to
record, and a reader must not be able to mistake silence for a pass. This is a different state from
`UNCALIBRATED`: an uncalibrated check is a gap the instrument can still close by measuring, while a
not-applicable one **has been** measured and found to carry no information.

`android-chrome` therefore keeps `trustedTouch` and `cadence` and asks nothing else. Its captures
become scoreable, which unblocks the `android-device-web` recapture in issue 1220.

`android-capacitor-webview` stays uncalibrated. It is very likely to report what Chrome reports, and
this campaign retracted three thresholds argued from exactly that kind of likelihood.

## Consequences

* The four tracked `2026-08-23-android-split` captures now **pass** fidelity, where they previously
  could not be scored at all. That is the intended effect and the reason the measurement was worth a
  person's time. *Attribution caveat (2026-08, issue 1315):* those four captures were later found
  cross-run contaminated — each report's nonce names a different cell than its label — so they are
  runtime-level calibration evidence only, never per-cell measurements; their corpus `index.json`
  marks each file `cellAttributable: false` and `corpus-attribution.test.mjs` keeps the marking
  honest. The fidelity conclusion here is runtime-level and stands.
* A capture driven faster than 170 moves/s is no longer refused. Nothing has ever been observed
  failing by excess; every transport this campaign found wrong was under-driving. If a
  faster-than-real replay is ever built, this is the decision to revisit, and it should be revisited
  with a measurement rather than a bound.
* `FIDELITY_MOVES_PER_SECOND_MAX` is gone. It was imported by `input-verdict.mjs` and by tests; one
  of those tests asserted 240 moves/s was "faster than a hand", which the iPad's 268.4 refutes.
* Consumers iterate `checks`, so a missing key needs no special-casing anywhere. A preserved
  historical verdict keeps whatever keys it was written with.

## Alternatives considered

**Raise the ceiling per runtime from the hand maxima.** Rejected. The maxima are four positive
samples and a headroom figure would have to be invented on top of them — the shape
`docs/PROFILING-CAMPAIGNS.md` records as *a positive corpus is not a calibration*, which this
campaign has already retracted three thresholds for.

**Leave the ceiling and instruct capturers to draw gently.** Rejected as backwards: it makes the
instrument's convenience a constraint on the input it exists to certify, and the eight captures show
how easily an ordinary hand crosses it.

**Record the Android checks as passing.** Rejected. It reads as though the runtime answered, and the
next person to widen a check would have this as precedent.

**Keep them uncalibrated and wait for a worse Android transport.** Rejected. The pairing that
matters is finger against synthesized touch, and both are now on record; a worse transport would
only re-demonstrate the cadence floor, which already discriminates.

## Provenance

`perf-profiles/evidence/2026-08-23-hand/` — nine tracked captures, whole, with `index.json`
recording each reading **and how it was drawn**. Two of the Android runs swept brushes and colours
mid-capture; their readings are unaffected because the input statistics count canvas-targeted events
only, and the index says so rather than leaving a later reader to work it out.
