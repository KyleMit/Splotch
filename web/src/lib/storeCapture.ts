import { browser, dev } from '$app/environment';

// Capture mode: set by tools/marketing-assets/gen-store-assets.mjs before the
// app boots, so a marketing screenshot shows the chrome a store listing sells
// rather than one install's numbers. The free-generation count on the wand
// button is the whole of it today — a badge that reads as noise beside the
// headline copy, and that is wrong for every reader whose own install shows a
// different number.
//
// Gated like the other client seams (lib/boot/devHarnessSeam.ts): the flag and
// the branches reading it compile out of a release bundle, and
// tools/check-release-seams.mjs holds the name out of the shipped client.
export function storeCaptureMode(): boolean {
  if (!browser || (!dev && !__DEV_HARNESS__)) return false;
  return window.__storeCapture === true;
}
