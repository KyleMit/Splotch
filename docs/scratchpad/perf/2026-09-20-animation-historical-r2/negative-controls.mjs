// Proves check.mjs's identity and control assertions reject the evidence they are meant to reject.
// A verifier that only ever sees good data cannot show it would catch bad data; each case below is
// a mutation a rival review landed on a passing package while the checker still exited 0.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadedOnlyArmEntry, matchesDeclaredControls, readRun, root } from './lib.mjs';

const failures = [];
const rejects = (claim, mutated, predicate) => {
  const ok = predicate(mutated) === false;
  console.log(`${ok ? 'ok  ' : 'FAIL'} rejected: ${claim}`);
  if (!ok) failures.push(claim);
};
const accepts = (claim, original, predicate) => {
  const ok = predicate(original) === true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} accepted: ${claim}`);
  if (!ok) failures.push(claim);
};

const identity = JSON.parse(readFileSync(join(root, 'BUILD-IDENTITY.json'), 'utf8'));
const beforeEntry = identity.before['ipad-native'].entry;
const afterEntry = identity.after['ipad-native'].entry;
const nativeBefore = readRun('runs', 'ipad-native', 'before-1');
const safariBefore = readRun('runs', 'ipad-safari', 'before-1');
const withEntries = (run, pageEntries) => ({ ...run, pageEntries });

accepts('the unmodified iPad native before capture loaded only its own arm entry',
  nativeBefore, (run) => loadedOnlyArmEntry(run, beforeEntry));
rejects('an iPad native before capture that also loaded the after arm entry',
  withEntries(nativeBefore, [beforeEntry, afterEntry]), (run) => loadedOnlyArmEntry(run, beforeEntry));
rejects('an iPad native before capture that loaded only the after arm entry',
  withEntries(nativeBefore, [afterEntry]), (run) => loadedOnlyArmEntry(run, beforeEntry));
rejects('a native capture that recorded no loaded entry at all',
  withEntries(nativeBefore, []), (run) => loadedOnlyArmEntry(run, beforeEntry));

accepts('the unmodified iPad Safari before capture matches the declared campaign controls',
  safariBefore, (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture campaigned on iPadOS 26.6 instead of the declared 26.5',
  { ...safariBefore, device: { ...safariBefore.device, os: '26.6' } },
  (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture campaigned in portrait instead of the declared landscape',
  { ...safariBefore, orientation: 'PORTRAIT' }, (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture campaigned on the dark theme',
  { ...safariBefore, theme: 'dark' }, (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture driven through the native Capacitor WebView runtime',
  { ...safariBefore, captureRuntime: 'ios-capacitor-webview' },
  (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture driven by synthetic rather than the declared native touch',
  { ...safariBefore, uiActivation: 'driver' }, (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture carrying a cadence pin the target never declared',
  { ...safariBefore, refreshRatePin: { requestedHz: 60, observedHz: 60 } },
  (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture whose open Settings P95 allowance was widened from 29 ms to 999 ms',
  {
    ...safariBefore,
    gateAllowances: {
      ...safariBefore.gateAllowances,
      p95: { ...safariBefore.gateAllowances.p95, 'open Settings': 999 },
    },
  },
  (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad Safari capture that recorded no allowance ledger at all',
  { ...safariBefore, gateAllowances: {} }, (run) => matchesDeclaredControls(run, 'ipad-safari'));
rejects('an iPad native capture handed the iPad web row allowance ledger it never scored under',
  { ...nativeBefore, gateAllowances: safariBefore.gateAllowances },
  (run) => matchesDeclaredControls(run, 'ipad-native'));
accepts('the unmodified iPad native before capture scored on the base gates it declares',
  nativeBefore, (run) => matchesDeclaredControls(run, 'ipad-native'));
rejects('an Android Chrome capture whose observed cadence missed the declared 60 Hz pin',
  { ...readRun('runs', 'android-chrome', 'before-1'), refreshRatePin: { requestedHz: 60, observedHz: 30 } },
  (run) => matchesDeclaredControls(run, 'android-chrome'));

console.log(`${failures.length ? failures.length + ' negative controls did not fire' : 'every negative control fired'}`);
if (failures.length) process.exit(1);
