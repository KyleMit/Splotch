// Whether a capture exercised the real touch path, judged against the runtime it
// came from.
//
// The verdict used to be five checks with one calibration, taken from a schema-2
// hand capture in Safari on the target iPad. Four of the five turned out to
// describe that iPad rather than describing faithful input: `coalescing`,
// `pressure` and `contactGeometry` report what Safari reports for a finger, and
// `cadence`'s upper bound reported what that iPad's digitizer samples at.
//
// Splitting the table per runtime separates two questions that were being answered
// by one boolean — was this capture driven properly, and did it come from the
// runtime the thresholds describe. The 2026-08-23 hand corpus is what turned the
// second question from an argument into a measurement, on both devices and from
// both sides: a real finger, and a synthesized touch read by the same instrument.

// A check with no measured expectation for a runtime. It is NOT a pass: a capture
// whose verdict rests on an unmeasured threshold cannot be scored, exactly as one
// that was under-driven cannot. The two are distinguished so a reader knows which
// they are looking at — an uncalibrated check is a gap in the instrument and is
// closed by measuring the runtime, not by re-running the capture.
const UNCALIBRATED = 'uncalibrated';

// A check that has been measured and found to carry no information about how a
// capture was driven, so it is not part of the verdict at all — which is a
// different statement from UNCALIBRATED. An uncalibrated check is a gap the
// instrument could still close by measuring; a not-applicable one has been
// measured and found to be silent. Two grounds have earned it so far: a runtime
// reporting the SAME value for a real finger and for synthesized touch
// (android-chrome's pressure, contact geometry and coalescing, ADR-0141), and a
// value shown to track a variable that has nothing to do with input at all
// (coalescing everywhere else — see the block above RUNTIME_EXPECTATIONS).
const NOT_APPLICABLE = 'not-applicable';

// Cadence gates on DENSITY — contact moves per observed frame — not on a rate
// (ADR-0145). A rate floor encodes an assumption about how fast the display
// runs: a 60 Hz-locked device (the Android emulator, desktop WebKit) physically
// cannot exceed ~60 moves/s while being driven perfectly at 1.0 moves per frame,
// and the rate the input stream reaches tracks the display beat as much as the
// input (46.8-268.4 across healthy captures). Density is refresh-rate
// independent by construction and measured from BOTH sides on BOTH panel
// speeds:
//
// - 120 Hz bad side: the founding Appium defect at 0.44-0.45
//   (2026-08-25-underdriven-control).
// - 60 Hz bad side: the same rejected transport measures 0.82 on every run —
//   three in the PR 1361 review thread, two banked in
//   2026-08-26-appium-60hz-controls — and its distortion is a per-run lottery
//   (one banked run reports a fake 6.84% lost at 0.11 ms/frame engine work,
//   the other a genuinely clean 0.00%, both at identical stream statistics),
//   so only the density it cannot exceed fences it.
// - Good side: 0.96 is the sparsest of 169 tracked healthy phases, across
//   every device, transport, and hand.
//
// 0.9 sits between 0.82 and 0.96. The margins are thinner than the old
// 120 Hz-only gap and are stated rather than padded: both sides are measured,
// and a future healthy transport landing below 0.96 re-derives this floor with
// its evidence attached. Shared with `classifyPhase`'s input-loss diagnostic so
// the gate and the report cannot disagree.
export const FIDELITY_MOVES_PER_FRAME_MIN = 0.9;

// The gap cap rejects BURSTINESS — a stream whose average density is fine but
// which stalls and catches up, which density alone cannot see. 25 ms is 1.5x
// the slowest beat any scored display runs (60 Hz, 16.67 ms): a p95 gap beyond
// that means the stream skipped input frames on any supported panel, without
// asking which regime the capture ran in (the beat is not in the input block,
// and the refresh-regime check owns that question). The good side is tracked
// (healthy corpus tops out at 19 ms — 60 Hz-paced desktop WebKit, 36/36
// phases); the bad side is currently PROSE ONLY: the untracked founding
// capture was recorded at 40 ms, while the tracked negative control of the
// same transport reads p95 21 / max 39 — inside this cap, refused on density
// instead. The former 20 ms cap passed those healthy 19 ms phases by 1 ms —
// this names the margin instead of shipping it as luck.
export const FIDELITY_MOVE_GAP_P95_MAX_MS = 25;
const FIDELITY_CONTACT_SIZE_MIN_PX = 40;
const FIDELITY_CONTACT_SIZE_MAX_PX = 100;

export const CAPTURE_RUNTIMES = [
  'ios-safari',
  'ios-capacitor-webview',
  'android-chrome',
  'android-capacitor-webview',
  'desktop-playwright',
];

// The runtime an un-tagged capture is judged as. Every threshold here was set from
// Safari on the iPad, so this keeps a capture written before the artifact carried a
// runtime scoring exactly as it did then.
export const DEFAULT_CAPTURE_RUNTIME = 'ios-safari';

export function captureRuntime(platformName, nativeApp) {
  const ios = String(platformName ?? '').toLowerCase() === 'ios';
  if (ios) return nativeApp ? 'ios-capacitor-webview' : 'ios-safari';
  return nativeApp ? 'android-capacitor-webview' : 'android-chrome';
}

const trustedTouch = (input) => input.kinds === 'touch' && input.trust?.share === 1;

// Every measurement must be FINITE, which the retired ceiling used to enforce
// as a side effect. Without it a non-finite reading satisfied the floor and a
// malformed or zero-window reading could be banked as scoreable — while the
// diagnostic rejected the same value. The gate that decides scoreability must
// not be more permissive than the one that only reports.
//
// There is deliberately NO fallback for an absent `movesPerFrame`. The PR 1361
// review proved the legacy rate branch had no reachable beneficiary — every
// committed artifact carrying movesPerSecond also carries movesPerFrame,
// summarizeRun writes the field unconditionally (0 when contactFrames is 0,
// never undefined), and the field predates this gate's existence — so the only
// input that could reach a rate fallback is a doctored block, which is exactly
// the field-omission dodge fail-closed must refuse. The rate is still required
// to be a real measurement (finite, nonzero): a truncated phase can bank
// movesPerSecond 0 alongside a plausible density, and a density whose rate
// half is missing is not a measured stream.
const cadence = (input) =>
  Number.isFinite(input.moveGapP95Ms) &&
  input.moveGapP95Ms <= FIDELITY_MOVE_GAP_P95_MAX_MS &&
  Number.isFinite(input.movesPerSecond) &&
  input.movesPerSecond > 0 &&
  Number.isFinite(input.movesPerFrame) &&
  input.movesPerFrame >= FIDELITY_MOVES_PER_FRAME_MIN;

const noReportedPressure = (input) => input.pressure?.p50 === 0;

const fingerSizedContact = (input) =>
  input.contactWidth?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
  input.contactWidth?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX &&
  input.contactHeight?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
  input.contactHeight?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX;

// `trustedTouch` is runtime-independent by measurement, and so is `cadence` now
// that it gates on density: moves per frame needs no per-runtime table because
// its bad side (0.44-0.45) and good side (0.96-2.33) hold across every device,
// transport, and hand in the tracked corpora.
//
// `coalescing` is NOT_APPLICABLE in every runtime, on two measurements that
// together retired it as a check (see the ADR on coalescing as a witness):
//
// - The value tracks PAGE DELIVERY, not input. The same physical-iPad WKWebView
//   at matched cadence reports 1.05-1.08 when its page is bundled and 0 when the
//   page is delivered remotely — through Appium, through WDA-direct, and by a
//   real finger alike (the three-leg table on issue 1303, corpora
//   2026-08-25-wkwebview-delivery and 2026-08-25-hand-wkwebview). A check whose
//   answer moves with an input-irrelevant variable cannot verify input.
// - The recorded quantity never measured merging. The probe stores
//   `getCoalescedEvents().length` raw, and a populated list carries the event
//   itself — so its floor is 1, "1.05" is a list of one with occasional doubles,
//   and "0" is WebKit returning an EMPTY list. The value distinguishes whether
//   the list mechanism is populated in that context, not how input arrived.
//
// `coalescedPerMove` stays recorded in every artifact — it is the field that
// exposed the delivery dependence, and the banked values become the dataset that
// confirms a mechanism when one is finally named. The decision reopens if a
// bundled-delivery finger capture (blocked on issue 1323's report channel)
// contradicts the automation legs.
//
// Pressure and contact geometry are stated per runtime, each with the capture
// that set it.
export const RUNTIME_EXPECTATIONS = {
  'ios-safari': {
    coalescing: NOT_APPLICABLE,
    pressure: noReportedPressure,
    contactGeometry: fingerSizedContact,
  },
  // This entry spent two revisions chasing a per-runtime coalescing expectation —
  // first `=== 0` (failed every bundled capture), then UNCALIBRATED pending a
  // known-bad WKWebView capture. The delivery experiments made the question
  // unanswerable per runtime: whatever value was recorded would describe
  // whichever DELIVERY happened to take the calibration capture. See the
  // coalescing block above RUNTIME_EXPECTATIONS.
  'ios-capacitor-webview': {
    coalescing: NOT_APPLICABLE,
    pressure: noReportedPressure,
    contactGeometry: fingerSizedContact,
  },
  'android-chrome': {
    // Measured on the same phone the same night, a real finger and `adb shell
    // input` report these IDENTICALLY: pressure p50 1 against 1, no contact
    // geometry at all against none, 0 coalesced samples per move against 0. A
    // check that cannot tell a hand from a robot is not a weak check, it is not
    // a check — so these are excluded from the verdict rather than recorded as a
    // gap in it. Issue 1218 asked for exactly this answer as its alternative to
    // thresholds, and required it be established by measurement.
    //
    // What is left still separates a driven capture from an under-driven one:
    // 46.8 moves/s for the Appium transport this campaign rejected, against
    // 115.9 driven through the split path and 135.5-178.0 by hand.
    coalescing: NOT_APPLICABLE,
    pressure: NOT_APPLICABLE,
    contactGeometry: NOT_APPLICABLE,
  },
  // Measured on the same phone in the same installed WebView, page delivered
  // by the probe host in both arms (issue 1274, closing issue 1218's native
  // half): a real finger (2026-08-24-hand-native, two captures) and `adb
  // shell input` (2026-08-26-android-native-split-control) report pressure
  // IDENTICALLY — p50/p95/max all 1 against 1 — so pressure cannot tell a
  // hand from a robot and is not a check, the ADR-0141 rule verbatim. (The
  // runtime DOES report pressure now, where the 2026-08-23 probe on issue
  // 1217 read 0; it reports the same constant for both drivers, which is what
  // matters.) Contact geometry is different in kind: it CAN separate the two
  // drivers — a finger reports ~3.1-3.5 px p50 radii, adb reports exactly 0 —
  // but both drivers are trusted-path touch (trust.share 1 on both sides), so
  // it distinguishes WHICH faithful driver, never faithful from unfaithful.
  // The failures the verdict exists for are covered elsewhere: JS-synthesized
  // events fail trustedTouch, under-driving fails the cadence density floor.
  // An expectation requiring finger geometry would structurally refuse the
  // only automatable transport; one accepting both sides is not a check.
  // Both arms' figures are pinned by android-webview-fidelity.test.mjs.
  'android-capacitor-webview': {
    coalescing: NOT_APPLICABLE,
    pressure: NOT_APPLICABLE,
    contactGeometry: NOT_APPLICABLE,
  },
  // Desktop capture synthesizes touch through Playwright and reports a
  // trusted-touch share of 0, so it can never pass `trustedTouch` and pressure
  // and contact geometry were never calibrated for it. It is here so a desktop
  // capture run through the rescorer is described rather than judged against
  // Safari on an iPad; the desktop transport writes no fidelity block of its own.
  'desktop-playwright': {
    coalescing: NOT_APPLICABLE,
    pressure: UNCALIBRATED,
    contactGeometry: UNCALIBRATED,
  },
};

// `checks` keeps the boolean shape every existing reader expects, with `null` for a
// check that has no expectation for this runtime. `null` is falsy, so a consumer
// that filters for failing checks still names it — and `uncalibrated` lets one that
// cares say which kind of not-passing it is.
//
// A not-applicable check is ABSENT from `checks` rather than present and true: it
// was never asked, so there is no answer to record. Consumers iterate the keys,
// which is why absence reads correctly everywhere a value would have had to be
// special-cased.
export function inputFidelity(input = {}, runtime = DEFAULT_CAPTURE_RUNTIME) {
  const expectations = RUNTIME_EXPECTATIONS[runtime];
  if (!expectations) throw new Error(`Unknown capture runtime: ${runtime}`);
  const checks = {
    trustedTouch: trustedTouch(input),
    cadence: cadence(input),
  };
  const uncalibrated = [];
  const notApplicable = [];
  for (const [name, expectation] of Object.entries(expectations)) {
    if (expectation === NOT_APPLICABLE) {
      notApplicable.push(name);
      continue;
    }
    if (expectation === UNCALIBRATED) {
      uncalibrated.push(name);
      checks[name] = null;
      continue;
    }
    checks[name] = expectation(input);
  }
  return {
    runtime,
    passed: Object.values(checks).every((check) => check === true),
    checks,
    uncalibrated,
    notApplicable,
  };
}

// Which checks did not pass, and why not — an uncalibrated one is suffixed so a
// one-line verdict says whether the capture was bad or the instrument is silent
// about this runtime.
export function describeFidelityFailures(fidelity) {
  const uncalibrated = new Set(fidelity?.uncalibrated ?? []);
  return Object.entries(fidelity?.checks ?? {})
    .filter(([, passed]) => passed !== true)
    .map(([name]) => (uncalibrated.has(name) ? `${name}(uncalibrated)` : name))
    .join('+');
}

// Whether this runtime still has any check with no measured expectation. The
// campaign ledger asks, because "this cell cannot be scored" is a statement about
// the INSTRUMENT rather than about the attempt — and an instrument changes. A
// conclusion recorded before a runtime was calibrated must not outlive the
// calibration.
export function runtimeHasUncalibratedChecks(runtime) {
  const expectations = RUNTIME_EXPECTATIONS[runtime];
  if (!expectations) return false;
  return Object.values(expectations).includes(UNCALIBRATED);
}

// Whether the ONLY thing standing between this verdict and a pass is a check the
// instrument has no expectation for. Callers use it to tell a bad run from a
// silent instrument: a bad run is worth retrying and this is not, because no
// number of recaptures adds an expectation that was never measured.
//
// A capture failing `cadence` AND carrying uncalibrated checks is a bad run
// first. Reporting it as an instrument gap would send the next session to write
// a threshold when what actually happened is that the app was barely driven.
export function onlyUncalibratedChecksFailed(fidelity) {
  if (fidelity?.passed !== false) return false;
  const uncalibrated = new Set(fidelity?.uncalibrated ?? []);
  if (uncalibrated.size === 0) return false;
  const notPassing = Object.entries(fidelity?.checks ?? {})
    .filter(([, check]) => check !== true)
    .map(([name]) => name);
  return notPassing.length > 0 && notPassing.every((name) => uncalibrated.has(name));
}

// The two universal checks whose failure invalidated a capture's NUMBERS under
// every table this module has ever shipped: an untrusted touch is synthetic
// input, and cadence is the one that invalidates a number outright (the
// rescorer's row rule). Only the legacy branch below reads this list — a
// modern verdict says which of its failures were calibrated itself.
const LEGACY_NUMBER_INVALIDATING_CHECKS = ['trustedTouch', 'cadence'];

// Whether a failed verdict invalidates the capture's NUMBERS, as opposed to
// failing only per-runtime calibration checks the numbers survive. Owned here
// beside the check vocabulary so a future check addition lands in the policy
// that classifies it, not in a restated list in a consumer (evidence
// selection was the consumer that restated it, stack 1353's second review
// round). Two branches, keyed on whether the verdict can speak for itself:
//
// - A MODERN verdict carries `uncalibrated`, so a failure confined to
//   uncalibrated checks is a silent instrument (see above) and anything else
//   is a real calibrated failure — the same split acceptance scores with.
// - A LEGACY verdict predates the field; deriving from it would strand the
//   whole banked corpus, so the stable universal pair decides.
export function numberInvalidatingFailure(fidelity) {
  if (fidelity?.passed !== false) return false;
  if (Array.isArray(fidelity.uncalibrated)) return !onlyUncalibratedChecksFailed(fidelity);
  return LEGACY_NUMBER_INVALIDATING_CHECKS.some((check) => fidelity.checks?.[check] === false);
}
