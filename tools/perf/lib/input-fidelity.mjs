// Whether a capture exercised the real touch path, judged against the runtime it
// came from.
//
// The verdict used to be five checks with one calibration, taken from a schema-2
// hand capture in Safari on the target iPad. Three of the five describe that
// runtime rather than describing faithful input, so a well-driven capture from any
// other runtime is marked unscoreable for a reason that has nothing to do with how
// it was driven: `coalescing` requires zero coalesced samples, which is what Safari
// reports and the Capacitor WKWebView does not; `pressure` and `contactGeometry`
// come from what Safari reports for a finger, which Chrome on Android does not.
//
// Splitting the table per runtime separates two questions that were being answered
// by one boolean — was this capture driven properly, and did it come from the
// runtime the thresholds describe.

// A check with no measured expectation for a runtime. It is NOT a pass: a capture
// whose verdict rests on an unmeasured threshold cannot be scored, exactly as one
// that was under-driven cannot. The two are distinguished so a reader knows which
// they are looking at — an uncalibrated check is a gap in the instrument and is
// closed by measuring the runtime, not by re-running the capture.
export const UNCALIBRATED = 'uncalibrated';

// Calibrated against the schema-2 hand capture on the target iPad. These gate
// whether a run exercised the physical touch path; they are not lag thresholds.
export const FIDELITY_MOVES_PER_SECOND_MIN = 100;
export const FIDELITY_MOVES_PER_SECOND_MAX = 170;
export const FIDELITY_MOVE_GAP_P95_MAX_MS = 20;
export const FIDELITY_CONTACT_SIZE_MIN_PX = 40;
export const FIDELITY_CONTACT_SIZE_MAX_PX = 100;

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
  input.movesPerSecond <= FIDELITY_MOVES_PER_SECOND_MAX &&
  input.moveGapP95Ms <= FIDELITY_MOVE_GAP_P95_MAX_MS;

const noCoalescedSamples = (input) => input.coalescedPerMove === 0;
const someCoalescedSamples = (input) => input.coalescedPerMove > 0;
const noReportedPressure = (input) => input.pressure?.p50 === 0;

const fingerSizedContact = (input) =>
  input.contactWidth?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
  input.contactWidth?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX &&
  input.contactHeight?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
  input.contactHeight?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX;

// `trustedTouch` and `cadence` are runtime-independent by measurement, not by
// assumption: the 2026-08-23 corpus reports a trusted-touch share of 1 and
// 114.7-119.7 contact moves/s on both iPad runtimes and on Android Chrome through
// the split transport. The other three differ per runtime and are stated per
// runtime, each with the capture that set it.
//
// Every Android expectation is UNCALIBRATED because no Android capture has yet
// recorded what a real finger reports there — issue 1218 is that measurement, and
// it needs a human hand. Chrome reports pressure 1 and no contact radius for
// synthesized touch, so leaving the iPad numbers in place would not have been a
// weaker threshold, it would have been a threshold describing a different browser.
const RUNTIME_EXPECTATIONS = {
  'ios-safari': {
    // Safari delivers one pointermove per sample with nothing coalesced behind it.
    // Measured 0 across every ipad-device-web capture in the tracked corpus.
    coalescing: noCoalescedSamples,
    pressure: noReportedPressure,
    contactGeometry: fingerSizedContact,
  },
  'ios-capacitor-webview': {
    // The same gesture at the same cadence through the Capacitor WKWebView packages
    // 1.05-1.08 coalesced samples per move where Safari packages none — measured on
    // 2026-08-23, four brushes, 114.7-118.4 contact moves/s against Safari's
    // 115.9-118.6 on the same device the same night. The input is identical and the
    // runtime's packaging of it is not, so the expectation is inverted rather than
    // widened: widening it would retire the check in Safari, where it is the thing
    // that catches an under-driven WebDriverAgent transport.
    coalescing: someCoalescedSamples,
    pressure: noReportedPressure,
    contactGeometry: fingerSizedContact,
  },
  'android-chrome': {
    coalescing: UNCALIBRATED,
    pressure: UNCALIBRATED,
    contactGeometry: UNCALIBRATED,
  },
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
export function inputFidelity(input = {}, runtime = DEFAULT_CAPTURE_RUNTIME) {
  const expectations = RUNTIME_EXPECTATIONS[runtime];
  if (!expectations) throw new Error(`Unknown capture runtime: ${runtime}`);
  const checks = {
    trustedTouch: trustedTouch(input),
    cadence: cadence(input),
    coalescing: null,
    pressure: null,
    contactGeometry: null,
  };
  const uncalibrated = [];
  for (const [name, expectation] of Object.entries(expectations)) {
    if (expectation === UNCALIBRATED) uncalibrated.push(name);
    else checks[name] = expectation(input);
  }
  return {
    runtime,
    passed: Object.values(checks).every((check) => check === true),
    checks,
    uncalibrated,
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
