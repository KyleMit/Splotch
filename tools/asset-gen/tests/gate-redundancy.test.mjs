// The fixtures×gates REDUNDANCY MATRIX, executable.
//
// Per gate, the other suites prove "broken in → fails, good in → passes". This
// suite proves the complementary, catalog-level claim the handoff asked for: is
// each gate LOAD-BEARING, or redundant with another? It runs every gate in a
// group over every broken fixture in that group and asserts:
//   1. each gate is the SOLE catcher of at least one broken fixture (remove it
//      and that regression ships) — the load-bearing property;
//   2. no gate fires on a GOOD fixture (no false positives);
//   3. the one deliberate overlap (a thin white stroke trips both scoreDrift and
//      detectInventedShapes) is pinned, so a future change to either is noticed.
//
// The prose matrix + interpretation lives in docs/gate-redundancy.md; this test
// is its enforcement. Fixtures are synthetic (tests/fixtures/synthetic.mjs), each
// isolating one failure class. Two groups, because gates take different inputs:
// line-art gates read one outline buffer, night-fill gates read a (source, fill)
// pair. The eye-fill, outline-match, night-halo, and composite-eye gates each
// consume a still-different pairing and are covered only by their own suites.
import { describe, it, expect } from 'vitest';
import { scoreSolidity } from '../lib/solid-regions.mjs';
import { scoreEyeRings } from '../lib/eye-fill.mjs';
import {
  scoreNightness,
  scoreDrift,
  scoreLineColor,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  DRIFT_THRESHOLD_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';
import { detectInventedShapes } from '../lib/invented-shapes.mjs';
import * as F from './fixtures/synthetic.mjs';

// Run a group's gates over its fixtures → { fixture: Set<gateName that caught it> }.
async function catchMatrix(gates, fixtures) {
  const rows = {};
  for (const [fname, mk] of Object.entries(fixtures)) {
    const input = await mk();
    const caught = new Set();
    for (const [gname, gate] of Object.entries(gates)) if (await gate(input)) caught.add(gname);
    rows[fname] = caught;
  }
  return rows;
}

// Every gate must be the sole catcher of at least one BROKEN fixture.
function loadBearing(gates, matrix, broken) {
  const report = {};
  for (const g of Object.keys(gates))
    report[g] = broken.filter((f) => matrix[f].size === 1 && matrix[f].has(g));
  return report;
}

describe('line-art gates (solidity, eye-rings)', () => {
  const gates = {
    solidity: async (buf) => !(await scoreSolidity(buf)).passes,
    eyeRings: async (buf) => !(await scoreEyeRings(buf)).passes,
  };
  const fixtures = {
    solidPupil: F.solidPupilOutline, // broken
    fakeHollow: F.fakeHollowOutline, // broken
    swirlEye: F.swirlEyeSource, // broken
    thinStroke: F.thinStrokeOutline, // good
    goodEye: F.goodEyeSource, // good
  };
  const broken = ['solidPupil', 'fakeHollow', 'swirlEye'];
  const good = ['thinStroke', 'goodEye'];

  it('every gate is the sole catcher of ≥1 broken fixture', async () => {
    const matrix = await catchMatrix(gates, fixtures);
    const sole = loadBearing(gates, matrix, broken);
    for (const [gate, fixturesOnlyItCatches] of Object.entries(sole))
      expect(
        fixturesOnlyItCatches.length,
        `${gate} catches nothing alone → redundant`
      ).toBeGreaterThan(0);
  });

  it('no gate fires on a good fixture', async () => {
    const matrix = await catchMatrix(gates, fixtures);
    for (const f of good) expect([...matrix[f]], `${f} should pass every gate`).toEqual([]);
  });
});

describe('night-fill gates (nightness, drift, lineColor, invented-shapes)', () => {
  let src;
  const gates = {
    nightness: async (fill) => {
      const r = await scoreNightness(fill, src);
      return r.bgFrac >= 0.04 && r.bgLuma > NIGHT_BG_LUMA_MAX_DEFAULT;
    },
    drift: async (fill) => (await scoreDrift(fill, src)).ratio > DRIFT_THRESHOLD_DEFAULT,
    lineColor: async (fill) => (await scoreLineColor(fill, src)).lineWhite < LINE_WHITE_MIN_DEFAULT,
    inventedShapes: async (fill) => (await detectInventedShapes(fill, src)).flagged.length > 0,
  };
  const fixtures = {
    daytime: F.nightFillDaytime, // broken → nightness
    driftSubBlob: F.nightFillDriftSubBlob, // broken → drift only
    driftStroke: F.nightFillDrift, // broken → drift + inventedShapes (overlap)
    reinked: F.nightFillReinked, // broken → lineColor
    foreignShape: F.nightFillForeignShape, // broken → inventedShapes
    good: F.nightFillGood, // good
  };
  const broken = ['daytime', 'driftSubBlob', 'driftStroke', 'reinked', 'foreignShape'];

  it('every gate is the sole catcher of ≥1 broken fixture', async () => {
    src = await F.nightSource();
    const matrix = await catchMatrix(gates, fixtures);
    const sole = loadBearing(gates, matrix, broken);
    for (const [gate, fixturesOnlyItCatches] of Object.entries(sole))
      expect(
        fixturesOnlyItCatches.length,
        `${gate} catches nothing alone → redundant`
      ).toBeGreaterThan(0);
  });

  it('no gate fires on the good night fill', async () => {
    src = await F.nightSource();
    const matrix = await catchMatrix(gates, fixtures);
    expect([...matrix.good]).toEqual([]);
  });

  it('pins the documented drift↔invented-shapes overlap on a thick white stroke', async () => {
    src = await F.nightSource();
    const matrix = await catchMatrix(gates, fixtures);
    // a thick invented white stroke is BOTH a drift outline and a foreign blob
    expect([...matrix.driftStroke].sort()).toEqual(['drift', 'inventedShapes']);
    // but each still has a fixture it alone owns: a sub-floor stroke (drift) and
    // a coloured blob (inventedShapes)
    expect([...matrix.driftSubBlob]).toEqual(['drift']);
    expect([...matrix.foreignShape]).toEqual(['inventedShapes']);
  });
});
