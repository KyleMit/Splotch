// Playwright test tags that route a spec to an engine.
//
// The projects in playwright.config.ts partition the suite on this one value —
// `webkit` greps for it, `chromium` greps it out — so the two halves are
// complements by construction rather than two patterns kept in agreement by
// hand. Changing this constant to something no spec carries empties the WebKit
// project, and that fails its job with "No tests found".
//
// That covers the constant, not the call sites: Playwright validates no tag, so
// a hand-written '@webkti-only' on one spec matches neither project and runs
// under Chromium alone — silently, since the correctly tagged specs keep the
// WebKit job non-empty and green. Specs therefore import WEBKIT_ONLY_TAG rather
// than spelling it out, and tools/tests/e2e-engine-tags.test.mjs fails on a
// tag literal, which turns that typo into a module-resolution error.
export const WEBKIT_ONLY_TAG = '@webkit-only';

export const WEBKIT_ONLY = new RegExp(WEBKIT_ONLY_TAG);
