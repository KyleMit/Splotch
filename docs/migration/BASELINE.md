# Legacy performance baseline inventory

**Status: banked evidence only; current controls and architecture selection pending.** Inspected
2026-10-06 by metadata/tracked-file reads; no builds, tests, captures or candidate measurements.

The authoritative
[source manifest](../../scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json) and
[normalized results](../../scrapbook/performance/2026-07-31-deployment-target-matrix/data.json) have
`recordedOn: 2026-09-26`. The header names C; per-section commits below all resolve locally.

## Physical release rows

PL/PD/LL/LD mean portrait-light, portrait-dark, landscape-light and landscape-dark. D/U denotes
drawing and undo, which share the pen raw file. All 16 physical modes are `captured`, with no
preserved physical sections. All 64 drawing runs are scoreable, pass normalized input fidelity and
match their declared regime; all 16 undo sections pass. All action sections are scoreable with
passing idle controls. Action fractions below include idle; these are independent suite verdicts.

| Target         | Recorded device/OS/runtime                          | D/U regime and input                                                                               | Action transport/rate                                                                               |
| -------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| iPad web       | iPad13,8; iPadOS 26.5; Safari                       | 60 Hz; XCUITest/Appium browser drawing; trusted touch, cadence, pressure and contact geometry pass | HTTPS-front Appium; native touch/WebDriver/system activation; idle median 17 ms                     |
| iPad native    | iPad13,8; iPadOS 26.5; Capacitor WKWebView          | 60 Hz; XCUITest/Appium native WebView drawing; same four applicable checks pass                    | Appium native WebView; touch/WebDriver/accessibility/system activation; idle median 17 ms           |
| Android web    | SM-G990U1; Android 16; Chrome 153.0.0.0             | 120 Hz; split input/measurement; trusted touch and cadence pass                                    | Direct CDP trusted touch; requested/observed action refresh pin 60 Hz; idle median 16.7 ms          |
| Android native | SM-G990U1; Android 16; WebView Chrome 152.0.7977.87 | 120 Hz; split input/measurement; trusted touch and cadence pass                                    | Appium attached WebView; native touch/WebDriver/accessibility/system activation; idle median 8.3 ms |

Drawing classifies coalescing N/A, plus pressure/contact geometry on Android. Actions have their own
activation/idle evidence. Historical advisory labels do not exempt physical rows from
[ADR0156](../adrs/0156-physical-rows-gate-releases-advisory-rows-never-count.md); idle medians are
observations, not calibrated presentation channels.

Dates are 2026; all-brush passes include the iPad crayon gate exception. Explained reds retain
[ADR0174](../adrs/0174-ipad-drawing-lost-frame-is-judged-against-the-real-finger-floor.md)
disposition.

| Target         | Mode | D/U commit/date | Action commit/date | Drawing disposition  | Actions passed |
| -------------- | ---- | --------------- | ------------------ | -------------------- | -------------- |
| iPad web       | PL   | C / 09-23       | W / 09-25          | Pass                 | 38/55          |
| iPad web       | PD   | C / 09-23       | W / 09-25          | Pass                 | 40/55          |
| iPad web       | LL   | C / 09-23       | W / 09-25          | Eraser: ADR0174      | 40/56          |
| iPad web       | LD   | C / 09-23       | W / 09-25          | Pen, eraser: ADR0174 | 39/56          |
| iPad native    | PL   | C / 09-23       | C / 09-23          | Pass                 | 48/55          |
| iPad native    | PD   | C / 09-23       | C / 09-23          | Pass                 | 49/55          |
| iPad native    | LL   | C / 09-23       | I / 09-25          | Pass                 | 50/56          |
| iPad native    | LD   | C / 09-23       | I / 09-25          | Pass                 | 50/56          |
| Android web    | PL   | P / 09-25       | A / 09-26          | Pass                 | 56/56          |
| Android web    | PD   | P / 09-25       | A / 09-26          | Pass                 | 56/56          |
| Android web    | LL   | L / 09-26       | A / 09-26          | Pass                 | 42/42          |
| Android web    | LD   | L / 09-26       | A / 09-26          | Pass                 | 42/42          |
| Android native | PL   | C / 09-23       | N / 09-26          | Pass                 | 54/56          |
| Android native | PD   | C / 09-23       | N / 09-26          | Pass                 | 55/56          |
| Android native | LL   | C / 09-23       | N / 09-26          | Pass                 | 41/42          |
| Android native | LD   | C / 09-23       | N / 09-26          | Pass                 | 42/42          |

## Exact source and build provenance

Each physical source resolves through `index.capturedFrom + kept.source` to the index directory's
`kept.file`: 64 drawing, 16 undo and 16 action references resolve unambiguously to 80 distinct,
present, tracked raw JSON files, with matching corpus product commits. All nine indexes are tracked.
The original disposable physical paths are absent; promoted raw evidence is available.

| Key | Exact product commit                     | Tracked corpus indexes supplying these sections                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C   | 3928cd88edbf441530e473a4e3c0b6767926bfc6 | [iPad web D/U](../../perf-profiles/evidence/2026-09-23-matrix-ipad-device-web-3928/index.json), [iPad native D/U + portrait actions](../../perf-profiles/evidence/2026-09-23-matrix-ipad-device-native-3928/index.json), [Android native D/U](../../perf-profiles/evidence/2026-09-23-matrix-android-device-native-3928/index.json) |
| W   | 8e6700d5d801eb481a4bde3d47cea69135dd71b4 | [iPad web actions](../../perf-profiles/evidence/2026-09-24-issue-2211-ipad-web-secure-actions/index.json)                                                                                                                                                                                                                           |
| I   | d50d73927f1835bbe231d1c2450f49fbe5803f53 | [iPad native landscape actions](../../perf-profiles/evidence/2026-09-23-issue-2212-ipad-native-landscape-actions/index.json)                                                                                                                                                                                                        |
| P   | 1e3016ec407413a255e69d6eddaef2274dd3ee3a | [Android web portrait D/U](../../perf-profiles/evidence/2026-09-25-issue-2229-android-device-web-portrait/index.json)                                                                                                                                                                                                               |
| L   | 8a6ef42bc7a233abe9ca35cb6998daac60e0aa91 | [Android web landscape D/U](../../perf-profiles/evidence/2026-09-26-issue-2337-android-device-web-landscape/index.json)                                                                                                                                                                                                             |
| A   | 9993b68445ca19f8ab24d0f11c70c1bd5a8ae54e | [Android web actions](../../perf-profiles/evidence/2026-09-26-issue-2225-android-device-web-actions/index.json)                                                                                                                                                                                                                     |
| N   | b453e90c525b290b55d8ef431c583ea09f335bbd | [Android native actions](../../perf-profiles/evidence/2026-09-26-issue-2340-android-device-native-actions/index.json)                                                                                                                                                                                                               |

Raw `buildDigest` values fingerprint all served application chunks, per
[the binding owner](../../tools/perf/lib/profile-preview.mjs), not the native binary. N's APK digest
is a separate whole-artifact witness in its corpus index.

| Sections                                          | Recorded build witness                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| W actions                                         | `start.BXT_GXoD.js`; e19d4b19f7f02de772be474f4d9f8a33e0bdc858c4b6f8da82a28af5de6ceb97                                               |
| P D/U                                             | `start.C2vtQkqI.js`; 3445eabc37d0b1dd4e474afa411e6b5d2162b06d2c46c7a82fab1734944e8931                                               |
| L D/U                                             | `start.Dx1JZe5N.js`; ca96b82167bd893d5f6587dacf8737e09c82a7c06277b95a07b36dbf59df60de                                               |
| A actions                                         | `perf:build`; `start.BkKUaZAF.js`; 4f2fdccb98a42ad80b484e737e888dea018f2096363f292fddbc2e4c25aa1d16                                 |
| C Android native D/U                              | `start.DRKrKNDY.js`; e7ba3db899181c6112a683758edd88624aef0978e4d0145067692c9bc10c2427; probe-host `server.url`, not bundled release |
| N actions                                         | Instrumented Debug APK SHA256 ce75d985d5d1cd8be75bef3ee1e0c2fd6d62d8f9de54280200750baf16c66b3a                                      |
| C iPad D/U and portrait native actions; I actions | Entry/binary digests unrecorded in those raw files; I index records a Debug build with `contentInset` intervention                  |

Native optimized-release equivalence, exact capture-time probe/runner revisions and consistent
instrument fingerprints are unproved. Drawing uses engine/input/rAF measures; actions retain
frame-stamp epoch 2 and separate scheduled/actual clocks. Neither callback clock certifies
compositor presentation. Older output/page/host-quiet witnesses can be unrecorded; Android native
D/U explicitly has unprovable page identity and unbracketed landscape drift references. Passing
normalization does not fill those gaps. Each brush has one capture with ten gesture repeats; each
full action capture has four repeats, one warmup and three scored. These are not independent
benchmark replications.

## Retained diagnostic rows

The seven nonphysical targets preserve all suites in `data.json` (`preservedSections`), despite mode
status `captured`. They never approve physical performance. Rows cover all four modes unless noted;
tracked promoted D/U/A reference counts are out of 16/4/4, including shared pen undo files.

| Target/environment                                | D/U/A commit/date                                                      | Drawing regime; normalized scoreability                        | Durable raw D/U/A                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| iPad mini A17 Pro simulator, iOS 26.5, Safari     | S / 09-01, all suites                                                  | 60 Hz; drawing/actions scoreable                               | 4/1/0; all originals present locally but untracked  |
| Same simulator, Capacitor WebView                 | B / 08-28, all suites                                                  | 60 Hz; drawing/actions scoreable                               | 4/1/0; remaining raw absent; index commit unstamped |
| Pixel 7 Pro API33 emulator, Android 13, Chrome149 | D/A: B / 08-28; U: O / 08-21                                           | 60 Hz; drawing scoreable; action PL/LD idle fails, unscoreable | 4/0/0; remaining raw absent; index commit unstamped |
| Same emulator, WebView Chrome149.0.7827.91        | D: B / 08-28 portrait, T / 09-03 landscape; U: O / 08-21; A: B / 08-28 | 60 Hz; drawing/actions scoreable                               | 0/0/0; raw absent                                   |
| Mac arm64, macOS26.6.2, Chromium151.0.7922.34     | T / 09-03, all suites                                                  | 120 Hz; drawing/actions scoreable                              | 4/1/0; remaining raw absent                         |
| Same Mac, Playwright WebKit26.5                   | T / 09-03, all suites                                                  | 60 Hz; drawing/actions scoreable                               | 4/1/0; remaining raw absent                         |
| Same Mac, Firefox153.0                            | T / 09-03, all suites                                                  | 120 Hz; drawing/actions scoreable                              | 4/1/0; remaining raw absent                         |

S = c80fc3b240a3a7925257c9eea055cd83739c7eae; B = 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77; O =
6961e50b685d441e88b37d20d3f38a27136572fb; T = d17100cb8e9cbd157960f352020e21a7a523fddd.
Simulator/emulator drawing retains passing applicable input verdicts; Mac fidelity is unrecorded.
Missing raw/build/instrument evidence stays pending. These diagnostic rows have no release expiry.

## Causal limits and remaining controls

Banked native D/U passes coexist with 25 iPad and four Android action reds: iPad Magic, both themes,
page selection/clear and AI waiting in every mode, plus sound enable in PL; Android empty
landscape-to-portrait rotation in PL/LL, with-ink rotation in PL and dark-to-light theme in PD.
Without idle, native passes are 193/218 iPad and 188/192 Android. iPad web has 65 action reds and
three explained drawing reds; Android web actions pass.

The 9.5–14.7 ms `UpdateLayoutTree` trace in
[ADR0162](../adrs/0162-measured-p95-allowance-for-the-android-web-theme-flip.md) is **Android web**.
[ADR0160](../adrs/0160-measured-p95-allowances-for-gpu-attributed-ipad-transitions.md) attributes
iPad Safari transitions, not WKWebView's residual actions. Current native causal attribution remains
pending; focused gallery/theme interventions do not explain every canonical residual. Likewise
[ADR0085](../adrs/0085-tiled-live-canvas-for-ipad-webkit.md)'s historical at-most-2-ms `engine.draw`
is not whole-app JS cost; its gesture-start amendment also records 123–127 ms in that function.

## Capture age and current-control obligations

The iPad D/U raw URL stamps span 2026-09-23T04:28:51.649Z–05:31:38.019Z (web) and
05:38:23.343Z–06:50:58.779Z (native), including drift references. All other physical section dates
are fold-date fallbacks, which can overstate freshness. Using the actual UTC audit day 2026-10-06
and the owning [capture-date policy](../../tools/perf/lib/capture-date.mjs), 09-23/09-25/09-26
sections are 13/11/10 days old. Their first overdue instants are respectively **2026-10-08,
2026-10-10 and 2026-10-11 at 00:00 UTC**; equality with the owning limit still passes. The earliest
expiry covers all iPad D/U, Android-native D/U and iPad-native portrait actions. Old unexplained
reds keep counting under [ADR0175](../adrs/0175-matrix-sections-report-capture-age-not-currency.md).

Fresh matched controls, native attribution, build/instrument fingerprints, output/observer
calibration and full-screen/session workloads remain pending under the [contract](CONTRACT.md),
[acceptance scope](ACCEPTANCE.md) and [Phase 1 sequence](PHASE-1.md). iPad actions predate the veil;
later native layout/system-bar and export changes warrant workload-specific refresh. Docs-only
commits alone do not invalidate a capture. Rig preflight found no devices and performed no capture
or reservation; availability blocks physical comparisons, not structural work. Preserve
[ADR0173](../adrs/0173-physical-ipad-holds-the-commit-contract.md) physical stroke-commit
obligation; missing marks are NOT EVALUATED and fail, and a Safari `glaze-direct` arm is not
installed-native proof.
