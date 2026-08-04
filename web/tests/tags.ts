// Playwright test tags that route a spec to an engine.
//
// The projects in playwright.config.ts partition the suite on this one value —
// `webkit` greps for it, `chromium` greps it out — so the two halves are
// complements by construction rather than two patterns kept in agreement by
// hand. A tag that matches nothing fails the WebKit job outright ("No tests
// found"), so a typo can't quietly demote a spec to Chromium.
export const WEBKIT_ONLY_TAG = '@webkit-only';

export const WEBKIT_ONLY = new RegExp(WEBKIT_ONLY_TAG);
