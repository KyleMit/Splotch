import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({ calls: [] }));

vi.mock('node:child_process', async () => {
  const { mkdirSync: makeDirectory, writeFileSync: writeFile } = await vi.importActual('node:fs');
  const { dirname: directoryName } = await vi.importActual('node:path');
  return {
    spawnSync(_command, args) {
      const output = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
      const shareByPosition = {
        start: 0.0003,
        middle: 0.003,
        end: 0.0064,
      };
      const position = Object.keys(shareByPosition).find((candidate) =>
        output.includes(`/references/${candidate}.json`)
      );
      const lostFrameTimeShare = position ? shareByPosition[position] : 0.001;
      makeDirectory(directoryName(output), { recursive: true });
      writeFile(
        output,
        JSON.stringify({
          transport: 'browser',
          fidelity: { passed: true },
          gesturePlan: 'fixed-geometry',
          automation: { gestureRepeats: 10 },
          summaries: {
            intervalMs: 16.7,
            phases: [
              {
                key: 'blank',
                input: {
                  kinds: 'touch',
                  trust: { share: 1 },
                  movesPerSecond: 116,
                  movesPerFrame: 1.9,
                  moveGapP95Ms: 9,
                  pressure: { p50: 0 },
                  contactWidth: { p50: 74 },
                  contactHeight: { p50: 74 },
                },
                starvation: { inContact: { lostFrameTimeShare } },
              },
            ],
          },
        })
      );
      capture.calls.push(output);
      return { status: 0 };
    },
  };
});

const { runCampaign } = await import('../run-campaign.mjs');

const roots = [];

afterEach(() => {
  capture.calls.length = 0;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('physical-device campaign drift references', () => {
  it('captures start, middle, and end references and records a threshold warning beside the instrument', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-reference-'));
    roots.push(root);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCampaign([
      '--target=ipad-device-web',
      '--modes=portrait-light',
      '--items=pen-undo,crayon',
      `--output-root=${root}/out`,
      `--ledger=${root}/ledger.tsv`,
      '--url=http://127.0.0.1:4173/',
      '--capabilities-file=/tmp/caps.json',
      '--max-attempts=1',
    ]);

    expect(capture.calls.map((path) => path.replace(`${root}/out/ipad-device-web/`, ''))).toEqual([
      'references/start.json',
      'portrait-light/pen-real-screen.json',
      'references/middle.json',
      'portrait-light/crayon-real-screen.json',
      'references/end.json',
    ]);
    const report = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8'));
    expect(report.referenceCell).toEqual({
      target: 'ipad-device-web',
      mode: 'portrait-light',
      brush: 'crayon',
    });
    expect(
      report.measurements.map(({ position, lostFrameTimePercentage }) => [
        position,
        lostFrameTimePercentage,
      ])
    ).toEqual([
      ['start', 0.03],
      ['middle', 0.3],
      ['end', 0.64],
    ]);
    expect(report.drift).toEqual({
      lostFrameTimeShare: 0.0061,
      percentagePoints: 0.61,
      exceedsWarningThreshold: true,
    });
    expect(log.mock.calls.flat().join('\n')).toContain(
      'WARN  reference drift reached 0.61 percentage points, beyond the 0.50-point evidence threshold'
    );
    expect(readFileSync(join(root, 'instrument.json'), 'utf8')).toContain('fingerprint');
  });
});
