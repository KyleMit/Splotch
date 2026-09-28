// The app's live-canvas render-scale cap, restated where a tool cannot import
// it: the floor control's page source and two browser-console snippets. A copy
// that drifts measures a cheaper surface than the product draws on, and still
// produces plausible numbers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const OWNER = 'web/src/lib/drawing/engine.ts';
const COPIES = [
  'tools/perf/split-capture/serve-floor-control.mjs',
  'tools/perf/probes/engine-gates.js',
  'tools/perf/probes/input-recorder.js',
];
const DECLARATION = /const MAX_RENDER_SCALE = (\d+(?:\.\d+)?);/g;

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

function declaredCap(path) {
  const values = [...read(path).matchAll(DECLARATION)].map((match) => Number(match[1]));
  expect(values, `${path} declares MAX_RENDER_SCALE exactly once`).toHaveLength(1);
  return values[0];
}

describe('the render-scale cap the perf tools restate', () => {
  const appCap = declaredCap(OWNER);

  it.each(COPIES)('%s matches the app', (path) => {
    expect(declaredCap(path)).toBe(appCap);
  });
});
