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

// A check whose runtime reports the SAME value for a real finger and for
// synthesized touch. It carries no information about how a capture was driven,
// so it is not part of the verdict at all — which is a different statement from
// UNCALIBRATED. An uncalibrated check is a gap the instrument could still close
// by measuring; a not-applicable one has been measured and found to be silent.
const NOT_APPLICABLE = 'not-applicable';

// The floor is the half of cadence that discriminates, and it is measured from
// both sides: every transport this campaign rejected delivers 46.8-61 contact
// moves/s, and the slowest capture a human hand has produced is 117.5 (ADR-0141).
// 100 sits in that gap.
//
// There is no ceiling. One existed at 170 on the reasoning that a faster stream
// is "faster than a hand", and the 2026-08-23 hand corpus refutes it on both
// devices: a real finger reaches 178.0 on the phone and 268.4 on the iPad, while
// nothing has ever been observed failing by excess. Cadence excess is reported
// by `classifyInputCadence` and does not decide the verdict.
export const FIDELITY_MOVES_PER_SECOND_MIN = 100;
export const FIDELITY_MOVE_GAP_P95_MAX_MS = 20;
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

const cadence = (input) =>
  input.movesPerSecond >= FIDELITY_MOVES_PER_SECOND_MIN &&
  input.moveGapP95Ms <= FIDELITY_MOVE_GAP_P95_MAX_MS;

const noCoalescedSamples = (input) => input.coalescedPerMove === 0;
const noReportedPressure = (input) => input.pressure?.p50 === 0;

const fingerSizedContact = (input) =>
  input.contactWidth?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
  input.contactWidth?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX &&
  input.contactHeight?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
  input.contactHeight?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX;

// `trustedTouch` is runtime-independent by measurement. `cadence` is so only in
// its floor: the hand corpus shows the rate a finger produces is set by the
// device's touch sampling, 135.5-178.0 on the phone against 117.5-268.4 on the
// iPad, so an upper bound describes hardware rather than fidelity. The floor
// describes fidelity on both and is what this table relies on.
//
// The other three are stated per runtime, each with the capture that set it.
const RUNTIME_EXPECTATIONS = {
  'ios-safari': {
    // Safari delivers one pointermove per sample with nothing coalesced behind it.
    // Measured 0 across every ipad-device-web capture in the tracked corpus.
    coalescing: noCoalescedSamples,
    pressure: noReportedPressure,
    contactGeometry: fingerSizedContact,
  },
  'ios-capacitor-webview': {
    // The Capacitor WKWebView packages 1.05-1.08 coalesced samples per move where
    // Safari packages none, measured on 2026-08-23 across four brushes at the same
    // cadence on the same device the same night. That establishes the two runtimes
    // report differently. It does NOT establish that `> 0` identifies a well-driven
    // capture, and the negative control says it does not: the under-driven Android
    // Capacitor WebView probe on 2026-08-23 recorded `coalescing: false` under the
    // old `=== 0` rule at 47.81 contact moves/s — that is, more than zero coalesced
    // samples — which an inverted expectation would have passed. A check satisfied
    // by exactly the captures it exists to reject is not a check, so this stays
    // uncalibrated until a WKWebView capture of a KNOWN-BAD transport establishes a
    // discriminator.
    coalescing: UNCALIBRATED,
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
  // The Android WebView is very likely to report what Chrome reports, and this
  // campaign retracted three thresholds argued from exactly that kind of
  // likelihood. It stays uncalibrated until a capture in this runtime is read —
  // issue 1275, now that the transport into it works.
  'android-capacitor-webview': {
    coalescing: UNCALIBRATED,
    pressure: UNCALIBRATED,
    contactGeometry: UNCALIBRATED,
  },
  // Desktop capture synthesizes touch through Playwright and reports a
  // trusted-touch share of 0, so it can never pass `trustedTouch` and the other
  // three were never calibrated for it. It is here so a desktop capture run
  // through the rescorer is described rather than judged against Safari on an
  // iPad; the desktop transport writes no fidelity block of its own.
  'desktop-playwright': {
    coalescing: UNCALIBRATED,
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
