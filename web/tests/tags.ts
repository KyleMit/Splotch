// Playwright test tags that route a spec to an engine.
//
// The projects in playwright.config.ts partition the suite on this one value:
// Firefox and WebKit grep for it while Chromium greps it out. Changing this
// constant to something no spec carries empties both engine-smoke projects,
// and their standalone jobs fail with "No tests found".
//
// That covers the constant, not the call sites: Playwright validates no tag, so
// a hand-written '@engine-smoke-typo' on one spec matches no project and runs
// under Chromium alone — silently, since correctly tagged specs keep both smoke
// jobs non-empty and green. Specs therefore import ENGINE_SMOKE_TAG rather than
// spelling it out, and tools/tests/e2e-engine-tags.test.mjs fails on a tag
// literal, which turns that typo into a module-resolution error.
export const ENGINE_SMOKE_TAG = '@engine-smoke';

export const ENGINE_SMOKE = new RegExp(ENGINE_SMOKE_TAG);
