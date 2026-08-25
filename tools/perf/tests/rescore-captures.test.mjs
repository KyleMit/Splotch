import { describe, expect, it, vi } from 'vitest';
import {
  brushOf,
  evidenceIndexUnattributable,
  rawReportOf,
  rescoreCapture,
  rescoreCaptures,
} from '../rescore-captures.mjs';
import { relative } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { LOST_FRAME_TIME_SHARE_EXCEPTIONS } from '../lib/drawing-gates.mjs';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  destinationBlocked,
  evidenceFileName,
  modeOf,
  selectEvidence,
} from '../keep-capture-evidence.mjs';
import { evidenceIndexTargets, targetOf } from '../rescore-captures.mjs';
import { buildDirHoldsNativeExport } from '../lib/build-variant.mjs';
import { WEB_ONLY_STATIC_FILES } from '../../mobile/lib/static-export.mjs';

// The real frame table is a tuple stream, not a record list, and phases are
// declared separately — a fixture that gets that wrong scores as an empty run
// and every assertion about the score becomes vacuous.
const FRAME_COUNT = 120;
const BEAT_MS = 16.67;
const frames = Array.from({ length: FRAME_COUNT }, (_, index) => [100 + index * BEAT_MS, -1, 0]);
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
  frames,
  events: [],
  measures: [],
  history: [],
  liftLatencies: [],
};

describe('rawReportOf', () => {
  // Three envelopes reach this tool — the split transport's artifact, the Appium
  // runner's, and a bare uploaded probe report — and re-scoring has to read the
  // same raw table out of all of them.
  it('reads the raw table out of every capture envelope', () => {
    expect(rawReportOf({ report })).toEqual(report);
    expect(rawReportOf(report)).toEqual(report);
  });

  it('reports nothing for a capture carrying only precomputed summaries', () => {
    expect(rawReportOf({ summaries: { phases: [] } })).toBeNull();
    expect(rawReportOf(null)).toBeNull();
  });
});

describe('brushOf', () => {
  it('prefers the artifact field over the filename', () => {
    expect(brushOf({ brush: 'crayon' }, 'landscape-light/pen-real-screen')).toBe('crayon');
  });

  // A corpus predating the field is exactly the corpus most worth re-scoring.
  it('falls back to the filename', () => {
    expect(brushOf({}, 'abase.1-eraser')).toBe('eraser');
    expect(brushOf({}, 'base-android-magic')).toBe('magic');
  });

  it('defaults to pen when nothing names a brush', () => {
    expect(brushOf({}, 'capture-001')).toBe('pen');
  });
});

describe('rescoreCapture', () => {
  it('returns nothing for a capture with no raw frames rather than throwing', () => {
    expect(rescoreCapture({ summaries: {} }, { name: 'x' })).toBeNull();
  });

  // Scoring a cell against the wrong target silently applies the wrong gate, and
  // the exception table is keyed <targetId>:<brush>.
  it('applies the per-target gate exception the brush earns', () => {
    const capture = { brush: 'crayon', report };
    const excepted = rescoreCapture(capture, { name: 'c', targetId: 'ipad-device-web' });
    const plain = rescoreCapture(capture, { name: 'c', targetId: 'mac-chrome' });

    expect(excepted?.gateShare).toBe(
      LOST_FRAME_TIME_SHARE_EXCEPTIONS['ipad-device-web:crayon'].share
    );
    expect(plain?.gateShare).toBe(0.01);
  });

  // A whole-corpus rescore of mixed-target evidence cannot agree with the gates if
  // target identity is one global flag: the same capture reported the 1.5%
  // exception with --target=ipad-device-web and silently fell back to 1% without.
  it('gates each capture by its own target in one mixed-target pass', () => {
    const corpus = [
      { file: 'ipad-device-web-crayon', target: 'ipad-device-web' },
      { file: 'mac-chrome-crayon', target: 'mac-chrome' },
    ];

    const gates = corpus.map(
      (entry) =>
        rescoreCapture({ brush: 'crayon', report }, { name: entry.file, targetId: entry.target })
          ?.gateShare
    );

    expect(gates).toEqual([LOST_FRAME_TIME_SHARE_EXCEPTIONS['ipad-device-web:crayon'].share, 0.01]);
  });

  // An unknown target must not quietly take the plain gate: a cell carrying an
  // exception would be scored against a threshold it was excused from, and the
  // table would read PASS or FAIL either way.
  it('refuses to apply any gate when the target is unknown', () => {
    const scored = rescoreCapture({ brush: 'crayon', report }, { name: 'c', targetId: null });

    expect(scored?.gateShare).toBeNull();
  });
});

describe('evidenceIndexTargets', () => {
  it('reads per-file target identity out of a flat evidence corpus', () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-evidence-'));
    writeFileSync(
      join(dir, 'index.json'),
      JSON.stringify({
        kept: [
          { file: 'ipad-device-web-crayon.json', target: 'ipad-device-web' },
          { file: 'mac-chrome-crayon.json', target: 'mac-chrome' },
        ],
      })
    );

    const targets = evidenceIndexTargets(dir);

    expect(targets.get('ipad-device-web-crayon.json')).toBe('ipad-device-web');
    expect(targets.get('mac-chrome-crayon.json')).toBe('mac-chrome');
  });

  it('reports nothing for a corpus with no index', () => {
    expect(evidenceIndexTargets(mkdtempSync(join(tmpdir(), 'splotch-noindex-'))).size).toBe(0);
  });
});

// Issue 1298 closing issue 1315's loop: the corpus index marks contaminated
// captures where tools can read the marking, and this is the tool that reads
// it. A capture whose frame tables belong to another cell re-scores cleanly
// and answers wrongly, so the rescorer refuses it by default and re-admits it
// only on an explicit flag.
describe('the rescorer honours cellAttributable', () => {
  const corpusWith = (index) => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-unattributable-'));
    writeFileSync(join(dir, 'index.json'), JSON.stringify(index));
    return dir;
  };

  it('reads exactly the entries an index marks unattributable, with their nonces', () => {
    const dir = corpusWith({
      kept: [
        { file: 'clean.json', target: 'ipad-device-web' },
        {
          file: 'contaminated.json',
          target: 'ipad-device-web',
          cellAttributable: false,
          reportNonce: 'other-cell-1-2',
        },
        { file: 'explicitly-clean.json', cellAttributable: true },
      ],
    });

    const marked = evidenceIndexUnattributable(dir);

    expect([...marked.keys()]).toEqual(['contaminated.json']);
    expect(marked.get('contaminated.json')).toEqual({ reportNonce: 'other-cell-1-2' });
    expect(evidenceIndexUnattributable(mkdtempSync(join(tmpdir(), 'splotch-clean-'))).size).toBe(0);
  });

  it('refuses a marked capture by default and re-admits it only on the flag', async () => {
    const dir = corpusWith({
      kept: [
        { file: 'clean.json', target: 'ipad-device-web' },
        {
          file: 'contaminated.json',
          target: 'ipad-device-web',
          cellAttributable: false,
          reportNonce: 'other-cell-1-2',
        },
      ],
    });
    writeFileSync(join(dir, 'clean.json'), JSON.stringify({ brush: 'crayon', report }));
    writeFileSync(join(dir, 'contaminated.json'), JSON.stringify({ brush: 'crayon', report }));
    const corpus = relative(ROOT, dir);
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
    const quietTable = vi.spyOn(console, 'table').mockImplementation(() => {});

    try {
      const refusedRun = await rescoreCaptures({ corpus });
      expect(refusedRun.refused).toEqual([{ name: 'contaminated', reportNonce: 'other-cell-1-2' }]);
      expect(refusedRun.scored.map((entry) => entry.name)).toEqual(['clean']);

      const includedRun = await rescoreCaptures({ corpus, includeUnattributable: true });
      expect(includedRun.refused).toEqual([]);
      expect(includedRun.scored.map((entry) => entry.name).sort()).toEqual([
        'clean',
        'contaminated',
      ]);
    } finally {
      quiet.mockRestore();
      quietTable.mockRestore();
    }
  });
});

describe('keep-capture-evidence', () => {
  it('reads the target from the campaign tree layout', () => {
    expect(targetOf({}, 'android-device-web/landscape-light/crayon-real-screen')).toBe(
      'android-device-web'
    );
    expect(targetOf({ targetId: 'ipad-device-web' }, 'anything/else')).toBe('ipad-device-web');
  });

  // Taking the filename for a flat corpus makes every capture its own target,
  // which silently turns "one per target x brush" into "keep everything".
  // Returning null rather than a placeholder is what lets the rescorer refuse to
  // apply any gate; callers that want a display label supply their own fallback.
  it('does not invent a target from a flat corpus filename', () => {
    expect(targetOf({}, 'abase.1-crayon')).toBeNull();
    expect(targetOf({}, 'abase.1-crayon', 'ipad-device-web')).toBe('ipad-device-web');
  });

  // The Appium envelope uses `mode` for its automation mode and records the real
  // orientation under `automation`, so reading `mode` first labels an iPad capture
  // with its run label instead of its cell.
  it('labels the mode from whichever shape the capture records it in', () => {
    expect(modeOf({ orientation: 'LANDSCAPE', theme: 'dark' })).toBe('LANDSCAPE-dark');
    expect(
      modeOf({
        mode: 'xcuitest:ipad-device-web-landscape-dark-crayon',
        theme: 'dark',
        automation: { orientation: 'LANDSCAPE' },
      })
    ).toBe('LANDSCAPE-dark');
    expect(modeOf({ mode: 'landscape-dark' })).toBe('landscape-dark');
    expect(modeOf({})).toBe('unknown');
  });

  it('keeps one capture per target and brush', () => {
    const kept = selectEvidence([
      { target: 'a', brush: 'pen', file: '1' },
      { target: 'a', brush: 'pen', file: '2' },
      { target: 'a', brush: 'crayon', file: '3' },
      { target: 'b', brush: 'pen', file: '4' },
    ]);

    expect(kept.map((entry) => entry.file)).toEqual(['1', '3', '4']);
  });

  // Two hand captures of different runtimes both resolved to the unknown target
  // and collided on `unknown:pen`, so promoting a hand corpus silently dropped
  // one platform's calibration — the capture a person had already paid for.
  it('keeps every hand capture instead of deduping to one per target and brush', () => {
    const kept = selectEvidence([
      {
        target: 'android-capacitor-webview',
        brush: 'pen',
        handCapture: true,
        relativePath: 'a.json',
      },
      { target: 'ios-capacitor-webview', brush: 'pen', handCapture: true, relativePath: 'b.json' },
      { target: 'ios-capacitor-webview', brush: 'pen', handCapture: true, relativePath: 'c.json' },
    ]);

    expect(kept.map((entry) => entry.relativePath)).toEqual(['a.json', 'b.json', 'c.json']);
  });

  it('files hand captures injectively, including delimiter-bearing path segments', () => {
    const name = (relativePath) => evidenceFileName({ handCapture: true, relativePath });

    expect(name('runA/hand-pen.json')).not.toBe(name('runB/hand-pen.json'));
    // The review's reproduced collision: a separator-join flattening mapped
    // both of these to one name and silently dropped a paid-for capture.
    expect(name('run--a/hand.json')).not.toBe(name('run/a--hand.json'));
    expect(name('runA/hand-pen.json')).toMatch(/^hand-pen--[0-9a-f]{8}\.json$/);
    expect(evidenceFileName({ target: 'ipad-device-web', brush: 'pen' })).toBe(
      'ipad-device-web-pen.json'
    );
  });
});

describe('buildDirHoldsNativeExport', () => {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-build-'));

  // `build:cap` writes the native export into the same web/build the web build
  // uses, so a native build silently replaces what the preview server serves —
  // and a capture against the export hangs rather than failing.
  it('recognises the native export by the web-only files it drops', () => {
    writeFileSync(join(dir, 'index.html'), '');

    expect(buildDirHoldsNativeExport(dir)).toBe(true);
  });

  it('accepts a build that kept them', () => {
    for (const file of WEB_ONLY_STATIC_FILES) writeFileSync(join(dir, file), '');

    expect(buildDirHoldsNativeExport(dir)).toBe(false);
  });

  it('says nothing about a directory with no build in it', () => {
    expect(buildDirHoldsNativeExport(join(dir, 'absent'))).toBe(false);
  });
});

describe('promoting into an existing campaign name', () => {
  // Reusing a campaign name overwrote only the files the second run selected. The
  // earlier captures stayed beside a rewritten index that no longer named them,
  // and perf:rescore walks the directory rather than treating the index as an
  // allowlist — so they scored as current evidence.
  it('refuses a destination that already exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-evidence-root-'));
    mkdirSync(join(root, 'existing'), { recursive: true });
    writeFileSync(join(root, 'existing', 'stale.json'), '{}');

    expect(existsSync(join(root, 'existing'))).toBe(true);
    expect(destinationBlocked(join(root, 'existing'), { force: false })).toBe(true);
  });

  it('replaces it whole when forced, so nothing unselected survives', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-evidence-root-'));
    const destination = join(root, 'existing');
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, 'stale.json'), '{}');

    expect(destinationBlocked(destination, { force: true })).toBe(false);
    expect(existsSync(join(destination, 'stale.json'))).toBe(false);
  });
});

describe('the served build is re-checked per capture', () => {
  // The incident this guards overwrote web/build while a long-lived preview was
  // already serving it. A start-time check cannot see that: the server stays up,
  // the manifest still resolves, and the entry is still present, because the
  // native strip removes the web-only files and leaves the chunks. Campaign cells
  // go through --url and never re-enter runPerfServe, so a start-time check alone
  // leaves every later cell reaching the export.
  it('reports a native export even when the entry is still in place', () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-poststart-'));
    writeFileSync(join(dir, 'index.html'), '');
    writeFileSync(join(dir, 'start.abc.js'), '');
    for (const file of WEB_ONLY_STATIC_FILES) writeFileSync(join(dir, file), '');

    expect(buildDirHoldsNativeExport(dir)).toBe(false);

    // The real strip: web-only files removed, every chunk left in place.
    for (const file of WEB_ONLY_STATIC_FILES) rmSync(join(dir, file));

    expect(buildDirHoldsNativeExport(dir)).toBe(true);
    expect(existsSync(join(dir, 'start.abc.js'))).toBe(true);
  });
});

describe('a nested evidence corpus', () => {
  const nested = () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-nested-'));
    for (const [campaign, file, target] of [
      ['2026-08-23-ipad-main', 'ipad-device-web-crayon.json', 'ipad-device-web'],
      ['2026-08-23-desktop-main', 'mac-chrome-crayon.json', 'mac-chrome'],
    ]) {
      mkdirSync(join(root, campaign), { recursive: true });
      writeFileSync(join(root, campaign, file), '{}');
      writeFileSync(
        join(root, campaign, 'index.json'),
        JSON.stringify({ kept: [{ file, target, brush: 'crayon' }] })
      );
    }
    return root;
  };

  // The regression this covers: the corpus nests one directory per promotion, each
  // with its own index, and only `<root>/index.json` was read. The documented
  // whole-corpus command then fell through to the first path segment and reported
  // the CAMPAIGN NAME as the target — so an iPad-web crayon capture at 1.1% lost
  // was scored against the default 1% and rendered FAIL, when the gate it is held
  // to is the 1.5% exception.
  it('resolves each capture against its nearest index', () => {
    const root = nested();

    const targets = evidenceIndexTargets(root);

    expect(targets.get('2026-08-23-ipad-main/ipad-device-web-crayon.json')).toBe('ipad-device-web');
    expect(targets.get('2026-08-23-desktop-main/mac-chrome-crayon.json')).toBe('mac-chrome');
  });

  // A campaign directory name is not a target, and treating it as one is what
  // applied the wrong gate.
  it('refuses a path segment that is not a known target', () => {
    expect(targetOf({}, '2026-08-23-ipad-main/ipad-device-web-crayon')).toBeNull();
    expect(targetOf({}, 'ipad-device-web/landscape-light/crayon-real-screen')).toBe(
      'ipad-device-web'
    );
  });

  it('refuses an unknown declared target rather than gating on it', () => {
    expect(targetOf({ targetId: 'not-a-real-target' }, 'x/y')).toBeNull();
    expect(targetOf({ targetId: 'mac-safari' }, 'x/y')).toBe('mac-safari');
  });
});
