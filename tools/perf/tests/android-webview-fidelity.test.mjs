import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { RUNTIME_EXPECTATIONS } from '../lib/input-fidelity.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';

// The android-capacitor-webview pressure and contactGeometry decision (issue
// 1274, closing the runtime's half of issue 1218), bound to the raw evidence
// rather than hardcoded: a real finger and `adb shell input` in the installed
// WebView report pressure IDENTICALLY (p50 1 against 1), so pressure cannot
// tell a hand from a robot and is not-applicable, the ADR-0141 rule verbatim.
// Contact geometry is different in kind: it DOES separate the two drivers (a
// finger reports ~3.1-3.5 px p50 radii, adb reports 0) — but both drivers are
// trusted-path touch (trust.share 1 on both sides), so it distinguishes WHICH
// faithful driver, never faithful from unfaithful. The failure modes the
// verdict exists for are covered elsewhere: JS-synthesized events fail
// trustedTouch, under-driving fails the cadence density floor. An expectation
// requiring finger geometry would structurally refuse the only automatable
// transport; one accepting both would not be a check.

const HAND_CORPUS = join(ROOT, 'perf-profiles', 'evidence', '2026-08-24-hand-native');
const CONTROL_CORPUS = join(
  ROOT,
  'perf-profiles',
  'evidence',
  '2026-08-26-android-native-split-control'
);

function inputOf(path) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  const summaries = artifact.report ? summarizeRun(artifact.report) : artifact.summaries;
  return summaries.phases[0].input;
}

describe('android-capacitor-webview pressure and contact geometry', () => {
  const hands = [
    inputOf(join(HAND_CORPUS, 'hand-android-native-pen-portrait-light.json')),
    inputOf(join(HAND_CORPUS, 'hand-android-native-crayon-portrait-light.json')),
  ];
  const adb = inputOf(join(CONTROL_CORPUS, 'android-device-native-pen.json'));

  it('pressure is identical for a finger and adb — not a check', () => {
    for (const hand of hands) expect(hand.pressure.p50).toBe(adb.pressure.p50);
    expect(RUNTIME_EXPECTATIONS['android-capacitor-webview'].pressure).toBe('not-applicable');
  });

  it('contact geometry separates the drivers, but both drivers are trusted touch', () => {
    for (const hand of hands) {
      expect(hand.contactWidth.p50).toBeGreaterThan(0);
      expect(hand.trust.share).toBe(1);
    }
    expect(adb.contactWidth.p50).toBe(0);
    expect(adb.trust.share).toBe(1);
    expect(RUNTIME_EXPECTATIONS['android-capacitor-webview'].contactGeometry).toBe(
      'not-applicable'
    );
  });
});
