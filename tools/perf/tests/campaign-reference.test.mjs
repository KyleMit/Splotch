import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      const position = Object.keys(shareByPosition).find(
        (candidate) => output.endsWith(`/${candidate}.json`) && output.includes('/references/')
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
  const campaignArgs = (root, mode = 'portrait-light') => [
    '--target=ipad-device-web',
    `--modes=${mode}`,
    '--items=pen-undo,crayon',
    `--output-root=${root}/out`,
    `--ledger=${root}/ledger.tsv`,
    '--url=http://127.0.0.1:4173/',
    '--capabilities-file=/tmp/caps.json',
    '--max-attempts=1',
  ];

  it('captures start, middle, and end references and records a threshold warning beside the instrument', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-reference-'));
    roots.push(root);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCampaign(campaignArgs(root));

    expect(capture.calls.map((path) => path.replace(`${root}/out/ipad-device-web/`, ''))).toEqual([
      'references/portrait-light/start.json',
      'portrait-light/pen-real-screen.json',
      'references/portrait-light/middle.json',
      'portrait-light/crayon-real-screen.json',
      'references/portrait-light/end.json',
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
    expect(report.captureSessions).toEqual({ scope: 'single', count: 1 });
    expect(report.measurements.every(({ capturedAt }) => capturedAt !== null)).toBe(true);
    expect(new Set(report.measurements.map(({ captureSession }) => captureSession)).size).toBe(1);
    expect(log.mock.calls.flat().join('\n')).toContain(
      'WARN  reference drift reached 0.61 percentage points, beyond the 0.50-point evidence threshold'
    );
    expect(log.mock.calls.flat().filter((line) => line.startsWith('WARN  '))).toHaveLength(1);
    expect(readFileSync(join(root, 'instrument.json'), 'utf8')).toContain('fingerprint');
  });

  it('captures fresh mode-scoped references when a campaign root is reused for another mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-reference-modes-'));
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCampaign(campaignArgs(root));
    capture.calls.length = 0;
    await runCampaign(campaignArgs(root, 'landscape-dark'));

    expect(capture.calls.map((path) => path.replace(`${root}/out/ipad-device-web/`, ''))).toEqual([
      'references/landscape-dark/start.json',
      'landscape-dark/pen-real-screen.json',
      'references/landscape-dark/middle.json',
      'landscape-dark/crayon-real-screen.json',
      'references/landscape-dark/end.json',
    ]);
    const report = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8'));
    expect(report.referenceCell.mode).toBe('landscape-dark');
    expect(report.measurements.every(({ artifact }) => artifact.includes('/landscape-dark/'))).toBe(
      true
    );

    capture.calls.length = 0;
    await runCampaign(campaignArgs(root));
    const revisited = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8'));
    expect(capture.calls).toEqual([]);
    expect(revisited.captureSessions).toEqual({ scope: 'unknown', count: 0 });
  });

  it('marks references resumed across capture invocations as mixed-session evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-reference-resume-'));
    roots.push(root);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCampaign(campaignArgs(root));
    rmSync(`${root}/out/ipad-device-web/references/portrait-light/end.json`);
    capture.calls.length = 0;
    log.mockClear();
    await runCampaign(campaignArgs(root));

    const report = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8'));
    expect(report.captureSessions).toEqual({ scope: 'mixed', count: 2 });
    expect(capture.calls).toEqual([
      `${root}/out/ipad-device-web/references/portrait-light/end.json`,
    ]);
    expect(log.mock.calls.flat().join('\n')).toContain(
      'reference captures span 2 campaign sessions; their spread is not within-session drift'
    );
    expect(log.mock.calls.flat().filter((line) => line.startsWith('WARN  '))).toHaveLength(1);
  });

  it('keeps product and reference instruments separate for an action-only campaign', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-reference-instrument-'));
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCampaign(
      campaignArgs(root).map((arg) => (arg === '--items=pen-undo,crayon' ? '--items=actions' : arg))
    );

    const productInstrument = JSON.parse(readFileSync(join(root, 'instrument.json'), 'utf8'));
    const referenceInstrument = JSON.parse(
      readFileSync(join(root, 'references.json'), 'utf8')
    ).instrument;
    expect(Object.keys(productInstrument.files)).toContain('tools/perf/probes/action-probe.js');
    expect(Object.keys(productInstrument.files)).not.toContain(
      'tools/perf/probes/real-screen-probe.js'
    );
    expect(Object.keys(referenceInstrument.files)).toContain(
      'tools/perf/probes/real-screen-probe.js'
    );
  });
});

describe('campaign instrument resume guard', () => {
  it('refuses a widened no-reference campaign when a shared banked instrument file changed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-campaign-instrument-widened-'));
    roots.push(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const args = [
      '--target=ipad-simulator-web',
      '--modes=portrait-light',
      '--items=crayon',
      `--output-root=${root}/out`,
      `--ledger=${root}/ledger.tsv`,
      '--url=http://127.0.0.1:4173/',
      '--capabilities-file=/tmp/caps.json',
      '--max-attempts=1',
    ];

    await runCampaign(args);
    const instrumentPath = join(root, 'instrument.json');
    const bankedInstrument = JSON.parse(readFileSync(instrumentPath, 'utf8'));
    const screenFile = 'tools/perf/ios/capture-xcuitest-screen.mjs';
    bankedInstrument.files[screenFile] = 'banked-before-screen-change';
    bankedInstrument.fingerprint = createHash('sha256')
      .update(JSON.stringify(bankedInstrument.files))
      .digest('hex');
    writeFileSync(instrumentPath, `${JSON.stringify(bankedInstrument, null, 2)}\n`);
    capture.calls.length = 0;
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('blocked resume');
    });

    await expect(
      runCampaign(args.map((arg) => (arg === '--items=crayon' ? '--items=crayon,actions' : arg)))
    ).rejects.toThrow('blocked resume');
    expect(error.mock.calls.flat().join('\n')).toContain(screenFile);
    expect(capture.calls).toEqual([]);
  });
});
