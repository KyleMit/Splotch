import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { normalizeMatrix, renderMarkdown, renderReport } from '../gen-performance-matrix.mjs';
import {
  LOST_FRAME_DISPOSITIONS,
  LOST_FRAME_TIME_SHARE_GATE,
  lostFrameDispositionFor,
} from '../lib/drawing-gates.mjs';

const E5142FAB = 'e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3';
const LATER_COMMIT = '3928cd88edbf441530e473a4e3c0b6767926bfc6';
const CONTROL_CORPUS = 'perf-profiles/evidence/2026-09-22-issue-1715-driven-control';

function percent(share) {
  return `${(share * 100).toFixed(2)}%`;
}

function cell({
  share,
  paint = { p50: 8, p95: 16, p99: 24, max: 39 },
  productCommit = LATER_COMMIT,
  scoreable = true,
}) {
  const passed = share <= LOST_FRAME_TIME_SHARE_GATE && paint.p95 <= 20;
  return {
    aggregate: {
      runCount: 1,
      paint,
      lostFrameTimeShare: share,
      blankPassed: passed,
      allPhasesPassed: passed,
      scoreable,
    },
    gateShare: LOST_FRAME_TIME_SHARE_GATE,
    runs: [
      {
        productCommit,
        scoreable,
        phases: [{ phase: 'blank', paint, lostFrameTimeShare: share, passed }],
        passed,
      },
    ],
  };
}

// The generator's bands and commits are the ADR's own figures. If ADR-0174 is
// amended (issue 2233 asks how the pen band treats readings below it), this
// fails until the table and the record agree again.
describe('the recorded disposition table agrees with its ADRs', () => {
  for (const [key, disposition] of Object.entries(LOST_FRAME_DISPOSITIONS)) {
    const text = readFileSync(join(ROOT, disposition.adrPath), 'utf8');

    it(`${key} names an ADR whose file carries that number`, () => {
      const number = disposition.adr.replace('ADR-', '');
      expect(disposition.adrPath).toMatch(new RegExp(`^docs/adrs/${number}-`));
      expect(text.startsWith(`# ${disposition.adr}:`)).toBe(true);
    });

    it(`${key} uses the band ${disposition.adr} states`, () => {
      const { minShare, maxShare } = disposition.band;
      const band = `${(minShare * 100).toFixed(2)}–${(maxShare * 100).toFixed(2)}%`;
      expect(text.replace(/\s+/g, ' ')).toContain(band);
    });

    it(`${key} limits itself to product commits ${disposition.adr} names`, () => {
      for (const commit of disposition.productCommits ?? []) {
        expect(text).toContain(commit);
      }
    });
  }
});

describe('which drawing reds a recorded disposition explains', () => {
  it('explains a driven iPad web pen red inside the ADR-0174 band at any commit', () => {
    for (const share of [0.0122, 0.0127, 0.0137]) {
      expect(lostFrameDispositionFor('ipad-device-web', 'pen', cell({ share }))).toMatchObject({
        adr: 'ADR-0174',
      });
    }
  });

  // Readings below the band are an open question (issue 2233), so they stay
  // unexplained until the ADR says otherwise; readings above it need a finger
  // capture under the ADR's own terms.
  it('leaves a pen red outside the band open', () => {
    for (const share of [0.0113, 0.0121, 0.0138]) {
      expect(lostFrameDispositionFor('ipad-device-web', 'pen', cell({ share }))).toBeNull();
    }
  });

  it('explains nothing when a paint gate also failed', () => {
    for (const paint of [
      { p95: 21, p99: 24, max: 39 },
      { p95: 16, p99: 34, max: 39 },
      { p95: 16, p99: 24, max: 51 },
    ]) {
      expect(
        lostFrameDispositionFor('ipad-device-web', 'pen', cell({ share: 0.013, paint }))
      ).toBeNull();
    }
  });

  // The aggregate reports the worst run, so a cell folding an in-band red with an
  // out-of-band one would look covered if only the aggregate were read.
  it('leaves a cell open when any one of its failing readings is outside the band', () => {
    const phase = (share) => ({
      phase: 'blank',
      paint: { p95: 16, p99: 24, max: 39 },
      lostFrameTimeShare: share,
      passed: share <= LOST_FRAME_TIME_SHARE_GATE,
    });
    const folded = (phasesByRun) => {
      const base = cell({ share: 0.0127 });
      return {
        ...base,
        runs: phasesByRun.map((phases) => ({ ...base.runs[0], phases })),
      };
    };

    expect(
      lostFrameDispositionFor('ipad-device-web', 'pen', folded([[phase(0.0113)], [phase(0.0127)]]))
    ).toBeNull();
    expect(
      lostFrameDispositionFor('ipad-device-web', 'pen', folded([[phase(0.0127), phase(0.02)]]))
    ).toBeNull();
    expect(
      lostFrameDispositionFor('ipad-device-web', 'pen', folded([[phase(0.0127)], [phase(0.004)]]))
    ).toMatchObject({ adr: 'ADR-0174' });
  });

  it('explains eraser only at the e5142fab readings it was extended to', () => {
    const at = (share, productCommit) =>
      lostFrameDispositionFor('ipad-device-web', 'eraser', cell({ share, productCommit }));

    expect(at(0.0119, E5142FAB)).toMatchObject({ adr: 'ADR-0174' });
    expect(at(0.0125, E5142FAB)).toMatchObject({ adr: 'ADR-0174' });
    expect(at(0.0103, LATER_COMMIT)).toBeNull();
    expect(at(0.0122, LATER_COMMIT)).toBeNull();
    expect(at(0.0103, E5142FAB)).toBeNull();
  });

  it('explains no Magic, native, green, or unscoreable cell', () => {
    expect(lostFrameDispositionFor('ipad-device-web', 'magic', cell({ share: 0.013 }))).toBeNull();
    expect(lostFrameDispositionFor('ipad-device-native', 'pen', cell({ share: 0.013 }))).toBeNull();
    expect(lostFrameDispositionFor('android-device-web', 'pen', cell({ share: 0.013 }))).toBeNull();
    expect(lostFrameDispositionFor('ipad-device-web', 'pen', cell({ share: 0.009 }))).toBeNull();
    expect(
      lostFrameDispositionFor('ipad-device-web', 'pen', cell({ share: 0.013, scoreable: false }))
    ).toBeNull();
  });
});

// The 2026-09-22 control ADR-0174 cites is a real driven pen red inside the band,
// so normalizing it exercises the fold end to end.
describe('the ADR-0174 driven control in a matrix', () => {
  function controlMatrix() {
    const unavailable = [
      { id: 'portrait-dark', orientation: 'PORTRAIT', theme: 'dark' },
      { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' },
      { id: 'landscape-dark', orientation: 'LANDSCAPE', theme: 'dark' },
    ].map((spec) => ({ ...spec, status: 'unavailable', reason: 'not exercised' }));
    return normalizeMatrix(
      {
        schemaVersion: 3,
        recordedOn: '2026-09-22',
        productCommit: '3511b95ccdfb9677cfcf60b989fadb50ad074020',
        snapshotKind: 'test',
        architecture: 'test',
        sourceRoot: CONTROL_CORPUS,
        targets: [
          {
            id: 'ipad-device-web',
            number: 1,
            label: 'iPad physical · web',
            platform: 'iPadOS',
            deviceKind: 'physical',
            runtime: 'web',
            environment: 'test',
            fidelity: 'physical-safari-gated',
            modes: [
              {
                id: 'portrait-light',
                orientation: 'PORTRAIT',
                theme: 'light',
                status: 'captured',
                drawing: { pen: ['ipad-device-web-pen.json'] },
              },
              ...unavailable,
            ],
          },
        ],
      },
      ROOT
    );
  }

  it('annotates the red without changing its score or verdict', () => {
    const matrix = controlMatrix();
    const pen = matrix.targets[0].modes[0].drawing.pen;

    expect(pen.aggregate.blankPassed).toBe(false);
    expect(percent(pen.aggregate.lostFrameTimeShare)).toBe('1.27%');
    expect(pen.disposition).toEqual({
      adr: 'ADR-0174',
      adrPath: LOST_FRAME_DISPOSITIONS['ipad-device-web:pen'].adrPath,
    });
    expect(matrix.targets[0].modes[0].drawing.crayon.disposition).toBeUndefined();
  });

  it('renders the raw FAIL beside a link to the ADR, and counts it apart from open reds', () => {
    const matrix = controlMatrix();
    const adrLink = `https://github.com/KyleMit/Splotch/blob/main/${LOST_FRAME_DISPOSITIONS['ipad-device-web:pen'].adrPath}`;
    const markdown = renderMarkdown(matrix);
    const html = renderReport(matrix);

    expect(markdown).toContain(
      `**FAIL 16 / 25 / 41 · L1.3%**, red explained by a recorded disposition in [ADR-0174](${adrLink})`
    );
    expect(html).toMatch(
      new RegExp(`<a class="mx-cell num [a-z]+ failed explained" href="${adrLink}"`)
    );
    expect(html).toContain('FAIL · red explained by a recorded disposition in ADR-0174');
    for (const rendered of [markdown, html]) {
      expect(rendered).toContain(
        '1 of 1 brush aggregates over gate (0 open, 1 explained by a recorded disposition)'
      );
    }
  });

  it('lists every recorded disposition with its scope beside the gates', () => {
    const matrix = controlMatrix();
    const markdown = renderMarkdown(matrix);
    const html = renderReport(matrix);

    expect(markdown).toContain(
      '**Pen on `ipad-device-web`** — lost-frame reds from 1.22% to 1.37%, paint gates passing'
    );
    expect(markdown).toContain(
      '**Eraser on `ipad-device-web`** — lost-frame reds from 1.19% to 1.25% at e5142fab8ff2, paint gates passing'
    );
    expect(html).toContain('<b>Recorded dispositions.</b>');
  });
});
