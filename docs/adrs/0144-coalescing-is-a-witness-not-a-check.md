# ADR-0144: Coalescing Is a Witness, Not a Check

**Status:** Accepted — amends [ADR-0139](0139-per-runtime-input-fidelity-expectations.md) and
[ADR-0141](0141-cadence-is-a-floor-and-silent-checks-are-named.md). **Date:** 2026-08

## Context

`inputFidelity` stated a `coalescing` expectation per runtime: iPad Safari's calibrated `=== 0`, and
`uncalibrated` entries holding both Capacitor WebViews and desktop unscoreable pending calibration.
The sixteen `ipad-device-native` drawing cells were blocked by this check alone — every other check
passes on their banked captures.

Two measurements retired the per-runtime framing, then the check itself.

**The value tracks page delivery, not input.** The calibration question for the iPad WKWebView was
answered three times, each answer refuting the previous framing (the comment thread on issue 1303
holds the full sequence). The final table: at matched cadence on the same physical iPad, the same
WKWebView reports `coalescedPerMove` 1.05–1.08 when its page loads from the app bundle, and 0 when
the same page is delivered remotely from the probe host — through Appium (corpus
`2026-08-25-wkwebview-delivery`), by a **real finger** (corpus `2026-08-25-hand-wkwebview`), and
through WDA-direct (the 2026-08-24 leg, recorded in issue 1303's comment table; that capture was not
banked). The bundled legs are `2026-08-23-ipad-main`. With transport and input held fixed and only
delivery varied, the value moved. Whatever expectation were recorded per runtime would describe
whichever delivery happened to take the calibration capture.

**The recorded quantity never measured merging.** The probe stores `getCoalescedEvents().length`
raw, and in the WebKit configurations that populate the list at all, the list carries the event
itself — its floor is 1, not 0. So "1.05" was a list of one with occasional doubles (essentially no
merging, consistent with those captures delivering ~1.95 pointermove events per frame — every
digitizer sample as its own event), and "0" is WebKit returning an **empty** list. The field
distinguishes whether the list mechanism is populated in a given context — API bookkeeping — not how
input arrived. The Pointer Events spec makes this sharper, not vaguer: the coalesced events list of
a trusted `pointermove` always contains at least one event, so the observed 0 is WebKit *deviating*
from the spec in remote-delivery contexts, and the "1.05" contexts are the conformant ones. MDN
documents nothing either way, and which contexts deviate is recorded only in WebKit's source.

The check also never caught anything on the runtimes where it was calibrated: Safari's `=== 0` was
measured identically for a real finger and for automation (the same equivalence that made ADR-0141's
three Android checks not-applicable), and the one candidate discriminator — `> 0` identifying a
well-driven WKWebView capture — was refuted by the 2026-08-23 negative control, where an
under-driven Android WebView at 47.81 moves/s also reported more than zero.

## Decision

`coalescing` is excluded from the fidelity verdict in **every** runtime, recorded as
`not-applicable` so the exclusion is named in each verdict rather than silent (ADR-0141's rule). A
check whose answer moves with a variable that has nothing to do with input cannot verify input.

`coalescedPerMove` stays recorded in every artifact. It is the field that exposed the delivery
dependence in the first place, and the banked values across every corpus become the confirming
dataset when a mechanism is finally named. Under-driven capture detection — the job the check was
imagined to help with — belongs to the checks that measurably discriminate: `trustedTouch` and
`cadence`.

`NOT_APPLICABLE` now has two recognized grounds, stated at its definition: a runtime reporting the
same value for a hand and a robot (ADR-0141), and a value shown to track an input-irrelevant
variable (this ADR).

## Consequences

* The sixteen `ipad-device-native` drawing cells become scoreable from their already-banked captures
  at the next matrix generation — the matrix re-derives fidelity verdicts (the ADR-0136-era
  re-derivation), so no device time is spent.
* `ios-capacitor-webview` no longer has uncalibrated checks, so a banked `uncalibrated-runtime`
  ledger conclusion for it must not outlive this change — the resume logic already re-asks
  `runtimeHasUncalibratedChecks` per run, and `campaign-resume.test.mjs` pins that only the Android
  WebView (pressure, contact geometry) remains uncalibrated.
* One tripwire is genuinely lost: a future transport with pathological batching will not fail a
  check automatically. The recorded field keeps the evidence available to a reader; nothing pages
  one.

## Reopen condition

The one unmeasured cell in the delivery table is a real finger against the **bundled** build — the
configuration the store ships — blocked on issue 1323's report channel (mixed content stops a
bundled page's report leaving the device; the operator has ratified the native-bridge channel as the
fix). If that capture reports a populated list where the remote finger reported none is *expected*
under this ADR (delivery-keyed); what would reopen the decision is the bundled finger **disagreeing
with the bundled automation legs** — that would mean the value discriminates input after all, within
a delivery mode, and the check would deserve re-admission per (runtime × delivery).
