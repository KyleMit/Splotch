// Regression tests for the solid-region gate (lib/solid-regions.mjs), the
// detector for "does this line art contain a solid black region the dark-mode
// invert + punch can't survive". Two bars, each with its own broken fixture:
//
//   • biggestBlob > SOLID_BLOB_MAX — a large solid pupil (owl/ant-tall's class).
//   • interiorPx > SOLID_INTERIOR_MAX — the fake-hollow class: cores small
//     enough to each duck the blob bar, but whose total surviving interior does
//     not. Never committed as a real asset, so synthesis is the only source.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs) — the gate scores pure
// mask geometry, so a drawn solid disc exercises the same opening the shipped
// regressions did while isolating one bar at a time.
import { describe, it, expect } from 'vitest';
import { scoreSolidity, SOLID_BLOB_MAX, SOLID_INTERIOR_MAX } from '../lib/solid-regions.mjs';
import { solidPupilOutline, thinStrokeOutline, fakeHollowOutline } from './fixtures/synthetic.mjs';

describe('solidity gate — a solid region must be flagged', () => {
  it('flags a large solid pupil on the blob bar', async () => {
    const r = await scoreSolidity(await solidPupilOutline());
    expect(r.passes).toBe(false);
    expect(r.biggestBlob).toBeGreaterThan(SOLID_BLOB_MAX);
  });

  it('flags a fake-hollow page on the interior bar while it ducks the blob bar', async () => {
    const r = await scoreSolidity(await fakeHollowOutline());
    expect(r.passes).toBe(false);
    // the failure is the SECOND bar: no single blob is large, but the total
    // surviving interior is — exactly what biggestBlob alone would miss.
    expect(r.biggestBlob).toBeLessThanOrEqual(SOLID_BLOB_MAX);
    expect(r.interiorPx).toBeGreaterThan(SOLID_INTERIOR_MAX);
  });
});

describe('solidity gate — thin strokes must pass', () => {
  it('passes a thin-stroke-only page', async () => {
    const r = await scoreSolidity(await thinStrokeOutline());
    expect(r.passes).toBe(true);
    expect(r.biggestBlob).toBeLessThanOrEqual(SOLID_BLOB_MAX);
    expect(r.interiorPx).toBeLessThanOrEqual(SOLID_INTERIOR_MAX);
  });
});

it('separates solid from thin with margin on the blob bar', async () => {
  const broken = await scoreSolidity(await solidPupilOutline());
  const good = await scoreSolidity(await thinStrokeOutline());
  expect(good.biggestBlob).toBeLessThan(SOLID_BLOB_MAX);
  expect(broken.biggestBlob).toBeGreaterThan(SOLID_BLOB_MAX);
  // clear air between the classes, not a hair over the bar
  expect(broken.biggestBlob - good.biggestBlob).toBeGreaterThan(SOLID_BLOB_MAX);
});
