// The Playwright tag that routes a spec to every engine. Chromium runs the whole suite; the
// Firefox and WebKit projects (playwright.config.ts) run only specs carrying this tag, so it marks
// the small set that proves the app boots and draws in each engine.
//
// Playwright validates no tag: a misspelt one would quietly drop a spec from both non-Blink jobs.
// Specs import SMOKE_TAG rather than spelling it, and tools/tests/e2e-engine-tags.test.mjs fails on
// a tag literal.
export const SMOKE_TAG = '@smoke';

export const SMOKE = new RegExp(SMOKE_TAG);
