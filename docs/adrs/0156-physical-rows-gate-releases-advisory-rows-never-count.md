# ADR-0156: Physical Rows Gate a Release; Advisory Rows Never Count Toward Completion

**Status:** Active — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md),
[ADR-0137](0137-lost-frame-gate-exceptions.md), and
[ADR-0142](0142-rotation-actions-anchor-at-resize.md) **Date:** 2026-09

## Context

The deployment-target performance matrix publishes eleven targets. Its generator already names one
of them the calibrated release gate — the physical iPad running Safari (`physical-safari-gated`) —
and files every other target under an advisory fidelity class (`physical-native-advisory`,
`physical-web-advisory`, `simulator-advisory`, `desktop-advisory`). The `improve-performance-matrix`
skill, however, ended a campaign only at "zero current, scoreable red cells" and its inventory
counted every target's cells alike. On 2026-09-02 that inventory held 290 red items, 14 of them on
the physical iPad web rows; the rest were emulator, simulator, Mac, and native-shell rows whose red
is dominated by instrument limits the skill itself calls advisory. The iPad Simulator fails eleven
actions per mode on a Mac's compositor, the Android emulator fails its idle control at a fixed 60
Hz, and every Android and desktop drawing capture is uncalibrated on three of the four fidelity
checks (ADR-0139). A campaign that treats those cells as its remainder never finishes, and spends
device time on numbers no release depends on.

Three gate-posture questions had been answered case by case rather than once:

* **Which rows can block a release.** Only the iPad web row was ever called the gate, yet Splotch
  ships to Android phones and the physical Samsung is the only calibrated Android instrument
  (`android-chrome`'s trusted-touch and cadence verdicts are measured; its other checks are
  uncalibrated and silent).
* **A max gate sized from one capture.** `ACTION_FRAME_MAX_GATE_MS` was 33.5 ms — two exact 60 Hz
  intervals — and a matrix cell is one capture of three scored repeats. ADR-0137 already warns that
  a single capture of a single-frame statistic is what chance produces. At c80fc3b240a3 the physical
  iPad's `clear drawing` read 37 ms max on one mode and 17–21 on the other three; on 2026-09-02 a
  concurrent A/B put `save screenshot` at 32 ms max on one arm and 35 on the other with identical
  P95, and `select coloring page` at 28 on one arm and 91 on the other from one frame in one repeat.
  `open Settings` carries a 56 ms capture-environment allowance for the same reason.
* **Rotation with ink.** A device rotation is an OS-animated transition the page cannot pace. The
  physical iPad's `with ink: PORTRAIT to LANDSCAPE rotation` cells read 21–22 ms post-action P95
  against the 20 ms gate in both portrait modes and pass in the landscape modes, on `main` and on
  the layer 1 candidate alike; the physical Android native rows read 41–92 ms first frames on the
  same label. ADR-0142 fixed where the clock starts but not whether a two-frame hitch inside the
  animation is a defect for a toddler app.

Alternatives considered for the max gate: raising `ACTION_FRAME_MAX_GATE_MS` to 50 ms — one
constant, and 50 ms already means "the visible freeze" and the drawing paint max here. Rejected on
review: the P95 is pooled across every scored frame of the three repeats, so one 33 ms frame on
every activation of a long animation is 3 of ~120 gaps and never reaches the P95. The max is the
only statistic that catches a hitch recurring on every tap, and raising it to 50 would wave that
hitch through. Confirming the breach across samples keeps the threshold and removes the
single-sample noise instead.

## Decision

1. **The physical iPad (web and native) and the physical Android phone (web and native) are the
   release gate.** A campaign's remainder is counted on those four rows only. Their fidelity classes
   differ — the iPad web row is `physical-safari-gated`, the other three stay advisory in the
   fidelity sense because their input instruments are uncalibrated on some checks — but a red
   scoreable cell on any of them is a product finding that must end in a recorded product outcome.
2. **Mac rows are a regression tripwire.** A Mac cell that turns red on a change that was green on
   the trunk is a finding to attribute before shipping; a Mac cell that was already red is not a
   campaign remainder (ADR-0087: Playwright WebKit does not reproduce the iPad compositor).
3. **Simulator and emulator rows are advisory and never count toward campaign completion.** They
   reject or narrow hypotheses; they cannot fail a campaign or approve one. The matrix keeps
   rendering their red; the `improve-performance-matrix` completion gate reads "zero current,
   scoreable red cells on the release-gate rows".
4. **A post-action max breach is confirmed, not declared, by one sample.**
   `ACTION_FRAME_MAX_GATE_MS` stays 33.5 ms and the P95 stays 20 ms, but a group with warm-up
   metadata (the canonical one-warm-up-plus-three-scored sweep) fails on max only when at least
   `MAX_BREACH_CONFIRMING_SAMPLES` (2) of its scored samples carry a frame over the gate
   (`tools/perf/lib/action-stats.mjs`, `summarizeActionGroup`). One breaching sample is recorded as
   `frames.maxUnconfirmed` with `frames.maxBreachSamples`, and is the cell the next recapture
   targets first. A bare single-sample group keeps the direct rule. First-frame and every drawing
   gate are unchanged; the `open Settings` 56 ms max allowance stays with its recorded reopen
   condition (ADR-0090's amendment), since its breaches recurred on every run.
5. **Rotation with ink stays gated at the base 20 ms P95 and 33.5 ms max with no allowance.** A
   two-frame hitch inside an OS-animated rotation is the moment the paper the child was drawing on
   visibly stutters, and toddlers rotate tablets constantly. Nothing is lowered silently; a future
   allowance needs the ADR-0090 shape — measured, per runtime, recorded into the capture.

## Consequences

* \+ A campaign has a finite, release-relevant remainder, and device time goes to rows that gate a
  release.
* \+ A single lucky or unlucky frame no longer flips an action cell; a persistent max breach still
  fails.
* − Simulator and emulator red is easier to ignore; it stays rendered so a systemic regression there
  is still visible.
* − A two-beat frame that recurs in only one of three repeats is a warning, not a failure, until a
  recapture confirms or clears it.
* − Every published action cell re-scores under the confirmation rule on the next matrix
  regeneration, so a cell that was red on one breaching sample turns green without a recapture; the
  regeneration's diff is the record.
