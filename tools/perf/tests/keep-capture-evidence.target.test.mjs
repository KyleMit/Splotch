import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import {
  corpusRootTarget,
  keepCaptureEvidence,
  promotionFallbackTarget,
  promotionTargetOf,
  unresolvedTargetProblem,
} from '../keep-capture-evidence.mjs';

const PRODUCT_COMMIT = 'c'.repeat(40);
const FRAME_COUNT = 120;
const BEAT_MS = 16.67;
const report = {
  meta: { schema: 2 },
  phases: [
    {
      key: 'blank',
      paper: 'blank',
      startedAt: 100,
      endedAt: 100 + FRAME_COUNT * BEAT_MS,
      contactMs: FRAME_COUNT * BEAT_MS,
      frames: FRAME_COUNT,
    },
  ],
  frames: Array.from({ length: FRAME_COUNT }, (_, index) => [100 + index * BEAT_MS, -1, 0]),
  events: [],
  measures: [],
  history: [],
  liftLatencies: [],
};
const passing = { passed: true, checks: { trustedTouch: true, cadence: true } };

describe('corpusRootTarget', () => {
  it('reads the target from a corpus root that is a target directory', () => {
    expect(corpusRootTarget('perf-profiles/2026-09-25-run/android-device-web')).toBe(
      'android-device-web'
    );
  });

  it('tolerates a trailing separator', () => {
    expect(corpusRootTarget('perf-profiles/run/mac-safari/')).toBe('mac-safari');
  });

  // The round-one review's reproduction: a target id ABOVE the root says where
  // the directory sits, not what it captured.
  it('ignores a target id above the corpus directory', () => {
    expect(corpusRootTarget('perf-profiles/mac-chrome/run-3')).toBeNull();
    expect(corpusRootTarget('perf-profiles/2026-09-25-run')).toBeNull();
  });
});

describe('promotionFallbackTarget', () => {
  it('derives the fallback from the corpus root when --target is omitted', () => {
    expect(promotionFallbackTarget({ corpus: 'perf-profiles/run/android-device-web' })).toEqual({
      fallback: 'android-device-web',
    });
  });

  it('uses an explicit --target when the corpus root names no target', () => {
    expect(
      promotionFallbackTarget({ corpus: 'perf-profiles/run', target: 'android-device-web' })
    ).toEqual({ fallback: 'android-device-web' });
  });

  it('accepts an explicit --target that agrees with the corpus root', () => {
    expect(
      promotionFallbackTarget({
        corpus: 'perf-profiles/run/android-device-web',
        target: 'android-device-web',
      })
    ).toEqual({ fallback: 'android-device-web' });
  });

  it('refuses a --target that contradicts the corpus root', () => {
    const { problem } = promotionFallbackTarget({
      corpus: 'perf-profiles/run/android-device-web',
      target: 'android-device-native',
    });
    expect(problem).toMatch(/--target=android-device-native contradicts/);
    expect(problem).toMatch(/android-device-web target directory/);
  });

  it('refuses a --target that is not a campaign target', () => {
    expect(promotionFallbackTarget({ corpus: 'perf-profiles/run', target: 'android' })).toEqual({
      problem: expect.stringMatching(/--target=android is not a campaign target/),
    });
  });

  it('leaves the fallback empty when neither names a target', () => {
    expect(promotionFallbackTarget({ corpus: 'perf-profiles/run' })).toEqual({ fallback: null });
  });
});

describe('promotionTargetOf', () => {
  it('prefers the artifact and in-corpus path over the run-wide fallback', () => {
    expect(promotionTargetOf({ targetId: 'mac-safari' }, 'x/pen.json', 'mac-chrome')).toBe(
      'mac-safari'
    );
    expect(promotionTargetOf({}, 'mac-firefox/portrait-light/pen.json', 'mac-chrome')).toBe(
      'mac-firefox'
    );
    expect(promotionTargetOf({}, 'portrait-light/pen.json', 'mac-chrome')).toBe('mac-chrome');
  });

  it('keeps a hand capture on its runtime label', () => {
    expect(
      promotionTargetOf({ handCapture: true, runtime: 'ios-capacitor-webview' }, 'hand.json', null)
    ).toBe('ios-capacitor-webview');
  });

  it('never relabels a hand capture with the run-wide fallback', () => {
    expect(
      promotionTargetOf(
        { handCapture: true, runtime: 'ios-capacitor-webview' },
        'hand.json',
        'ipad-device-web'
      )
    ).toBe('ios-capacitor-webview');
    expect(promotionTargetOf({ handCapture: true }, 'hand.json', 'ipad-device-web')).toBeNull();
  });

  it('returns null rather than a label when nothing resolves', () => {
    expect(promotionTargetOf({}, 'portrait-light/pen.json', null)).toBeNull();
    expect(promotionTargetOf({ handCapture: true }, 'hand.json', null)).toBeNull();
  });
});

describe('unresolvedTargetProblem', () => {
  it('passes when every capture resolved', () => {
    expect(unresolvedTargetProblem([])).toBeNull();
  });

  it('names --target and bounds the listed paths', () => {
    const paths = Array.from({ length: 7 }, (_, index) => `cell-${index}/pen.json`);
    const problem = unresolvedTargetProblem(paths);
    expect(problem).toMatch(/--target=<target-id>/);
    expect(problem).toMatch(/7 capture\(s\)/);
    expect(problem).toMatch(/and 2 more/);
    expect(problem).not.toMatch(/cell-5/);
  });
});

// The issue 2343 incident end to end: --corpus pointed at the target directory
// itself, so no corpus-relative path carried a target segment.
describe('promoting a corpus whose root is the target directory', () => {
  let campaignDir;
  let evidenceDir;
  let exit;
  let errors;
  let logs;

  beforeEach(() => {
    campaignDir = mkdtempSync(join(tmpdir(), 'splotch-root-target-'));
    evidenceDir = mkdtempSync(join(tmpdir(), 'splotch-root-target-evidence-'));
    exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    logs = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exit.mockRestore();
    errors.mockRestore();
    logs.mockRestore();
    rmSync(campaignDir, { recursive: true, force: true });
    rmSync(evidenceDir, { recursive: true, force: true });
  });

  const stage = (targetDir) => {
    const cellDir = join(campaignDir, targetDir, 'portrait-light');
    mkdirSync(cellDir, { recursive: true });
    writeFileSync(
      join(cellDir, 'crayon-real-screen.json'),
      JSON.stringify({
        brush: 'crayon',
        orientation: 'PORTRAIT',
        theme: 'light',
        fidelity: passing,
        report,
      })
    );
    return relative(ROOT, join(campaignDir, targetDir));
  };

  const stageHand = (targetDir, name, fields) => {
    mkdirSync(join(campaignDir, targetDir), { recursive: true });
    writeFileSync(
      join(campaignDir, targetDir, name),
      JSON.stringify({ handCapture: true, brush: 'pen', fidelity: passing, report, ...fields })
    );
    return relative(ROOT, join(campaignDir, targetDir));
  };

  const promote = (options) =>
    keepCaptureEvidence({
      campaign: 'root-target-test',
      productCommit: PRODUCT_COMMIT,
      evidenceRoot: relative(ROOT, evidenceDir),
      ...options,
    });

  const keptTargets = () =>
    JSON.parse(readFileSync(join(evidenceDir, 'root-target-test', 'index.json'), 'utf8')).kept.map(
      (entry) => entry.target
    );

  it('files each capture under the corpus root target without --target', async () => {
    const corpus = stage('android-device-web');
    await promote({ corpus });
    expect(keptTargets()).toEqual(['android-device-web']);
    expect(
      existsSync(join(evidenceDir, 'root-target-test', 'android-device-web-crayon.json'))
    ).toBe(true);
  });

  it('files under an explicit --target when the corpus root is not a target', async () => {
    const corpus = stage('run-3');
    await promote({ corpus, target: 'android-device-web' });
    expect(keptTargets()).toEqual(['android-device-web']);
  });

  it('refuses a --target that contradicts the corpus root and writes nothing', async () => {
    const corpus = stage('android-device-web');
    await expect(promote({ corpus, target: 'android-device-native' })).rejects.toThrow('exit');
    expect(errors.mock.calls.flat().join('\n')).toMatch(/contradicts/);
    expect(existsSync(join(evidenceDir, 'root-target-test'))).toBe(false);
  });

  it('refuses an unresolvable capture instead of filing it as unknown', async () => {
    const corpus = stage('run-3');
    await expect(promote({ corpus })).rejects.toThrow('exit');
    const message = errors.mock.calls.flat().join('\n');
    expect(message).toMatch(/no campaign target for 1 capture\(s\)/);
    expect(message).toMatch(/--target=<target-id>/);
    expect(existsSync(join(evidenceDir, 'root-target-test'))).toBe(false);
  });

  it('refuses rather than borrowing a target id from above the corpus root', async () => {
    const corpus = stage(join('mac-chrome', 'run-3'));
    await expect(promote({ corpus })).rejects.toThrow('exit');
    expect(errors.mock.calls.flat().join('\n')).toMatch(/no campaign target/);
  });

  it('accepts --target under a corpus whose parent names another target', async () => {
    const corpus = stage(join('mac-chrome', 'run-3'));
    await promote({ corpus, target: 'ipad-device-web' });
    expect(keptTargets()).toEqual(['ipad-device-web']);
  });

  it('keeps a hand capture on its runtime under a target-named corpus root', async () => {
    const corpus = stageHand('ipad-device-web', 'hand-pen.json', {
      runtime: 'ios-capacitor-webview',
    });
    await promote({ corpus });
    expect(keptTargets()).toEqual(['ios-capacitor-webview']);
  });

  it('refuses a hand capture with no runtime under a target-named corpus root', async () => {
    const corpus = stageHand('ipad-device-web', 'hand-pen.json', {});
    await expect(promote({ corpus })).rejects.toThrow('exit');
    expect(errors.mock.calls.flat().join('\n')).toMatch(/hand-pen\.json/);
    expect(existsSync(join(evidenceDir, 'root-target-test'))).toBe(false);
  });
});
