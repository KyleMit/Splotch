import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  roots: null,
  pages: [],
  overlayRequests: 0,
  lightVerdict: { passes: true, gated: true },
}));

// The fixture files carry their meaning in their bytes: addPage writes one of
// these, and the mocked decoders below recognise it. Named so a typo at either
// end is a reference error instead of a test that passes vacuously — a
// "corrupt" page that quietly scores clean.
const CORRUPT_BYTES = 'corrupt';
const DRIFT_FILL_BYTES = 'drift fill';
const WARP_FILL_BYTES = 'warp fill';

const assertReadable = (buffer) => {
  if (buffer.toString() === CORRUPT_BYTES) throw new Error('corrupt image');
};

vi.mock('../lib/asset-paths.mjs', () => ({
  get ASSET_GEN_DIR() {
    return state.roots.assetGen;
  },
  get REPO_ROOT() {
    return state.roots.root;
  },
  get COLORING_DIR() {
    return state.roots.coloring;
  },
  get FILL_SRC_DIR() {
    return state.roots.fillSrc;
  },
  get SAMPLES_DIR() {
    return state.roots.samples;
  },
  resolveNightLineArt: async (_path, pen) => ({ source: pen, chalk: null }),
  toPosix(rel) {
    return rel.replaceAll('\\', '/');
  },
}));
vi.mock('../lib/asset-cli.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  fail(message) {
    throw new Error(message);
  },
}));

vi.mock('../lib/outline-targets.mjs', () => ({
  resolveOutlineTargets: async () => state.pages,
}));

vi.mock('../lib/outline-analysis.mjs', () => ({
  prepareOutlineAnalysis: async (buffer) => {
    assertReadable(buffer);
    return buffer;
  },
}));

vi.mock('../lib/outline-match.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  outlineMatch: async (source, fill, { overlay = false } = {}) => {
    assertReadable(source);
    assertReadable(fill);
    if (overlay) state.overlayRequests++;
    const drifted = fill.toString() === DRIFT_FILL_BYTES;
    return {
      keep: drifted ? 0.5 : 1,
      localKeep: drifted ? 0.4 : 1,
      worstTile: null,
      overlay: overlay ? Buffer.from('overlay') : null,
    };
  },
}));

vi.mock('../lib/local-warp.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  localWarp: async (source, fill) => {
    assertReadable(source);
    assertReadable(fill);
    const warped = fill.toString() === WARP_FILL_BYTES;
    return {
      localWarpMax: warped ? 8 : 0,
      globalDx: 0,
      globalDy: 0,
      warnedTiles: warped ? 1 : 0,
      worstTile: warped ? { x: 1, y: 2, confidence: 'strong-gain' } : null,
    };
  },
  prepareLocalWarpSource: async (source) => source,
  scoreLocalWarp: async (_source, fill) => ({
    localWarpMax: fill.toString() === WARP_FILL_BYTES ? 8 : 0,
    globalDx: 0,
    globalDy: 0,
    warnedTiles: fill.toString() === WARP_FILL_BYTES ? 1 : 0,
  }),
}));

vi.mock('../lib/solid-regions.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  scoreSolidity: async (buffer) => {
    assertReadable(buffer);
    const passes = !buffer.toString().includes('solid');
    return {
      darkPx: 1,
      solidPx: passes ? 0 : 101,
      interiorPx: passes ? 0 : 61,
      biggestBlob: passes ? 0 : 101,
      strokeWidth: 1,
      passes,
    };
  },
}));

vi.mock('../lib/eye-fill.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  scoreEyeRings: async (buffer) => {
    assertReadable(buffer);
    const passes = !buffer.toString().includes('ring');
    return { maxDepth: passes ? 0 : 6, passes };
  },
  scoreEyeFill: async (buffer) => {
    assertReadable(buffer);
    return { cores: [] };
  },
  judgeLightEyes: () => state.lightVerdict,
  judgeNightEyes: () => ({ passes: true }),
}));

vi.mock('../lib/composite-eye.mjs', () => ({
  scoreCompositeEyes: async () => ({ passes: true }),
}));

vi.mock('../lib/outline-frame.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  scoreOutlineFrame: async (buffer) => {
    assertReadable(buffer);
    const passes = !buffer.toString().includes('frame');
    return { sideCoverage: passes ? 0 : 0.7, ghostCoverage: 0, passes };
  },
}));

vi.mock('../lib/night-composite.mjs', () => ({
  compositeNight: async (buffer) => buffer,
}));

vi.mock('../lib/golden-catalog.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  GOLDEN_VERDICTS: [],
  diffGoldenPage: () => {},
  scoreGoldenNightEyes: async () => ({}),
}));

vi.mock('../lib/night-scores.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  scoreDrift: async () => ({ ratio: 0 }),
  scoreNightness: async () => ({ bgLuma: 0 }),
  scoreLineColor: async () => ({ lineWhite: 255 }),
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let log;
let error;

const cliImports = {
  'check-fill-drift.mjs': () => import('../coloring/check-fill-drift.mjs'),
  'check-fill-eyes.mjs': () => import('../coloring/check-fill-eyes.mjs'),
  'check-outline-quality.mjs': () => import('../coloring/check-outline-quality.mjs'),
  'check-golden-scores.mjs': () => import('../coloring/check-golden-scores.mjs'),
};

const outputOf = (spy) => spy.mock.calls.map((args) => args.join(' ')).join('\n');

async function addPage(
  name,
  {
    corruptOutline = false,
    corruptFill = false,
    drifted = false,
    warped = false,
    night = false,
    outlineIssues = [],
  } = {}
) {
  const outline = join(state.roots.coloring, `test/${name}.outline.webp`);
  const fill = join(state.roots.fillSrc, `test/${name}.light.raw.webp`);
  await writeFile(
    outline,
    corruptOutline ? CORRUPT_BYTES : `valid outline ${outlineIssues.join(' ')}`
  );
  await writeFile(
    fill,
    corruptFill
      ? CORRUPT_BYTES
      : drifted
        ? DRIFT_FILL_BYTES
        : warped
          ? WARP_FILL_BYTES
          : 'valid fill'
  );
  if (night)
    await writeFile(join(state.roots.fillSrc, `test/${name}.night.raw.webp`), WARP_FILL_BYTES);
  return outline;
}

async function addWarpNotes(name, max) {
  await writeFile(
    join(state.roots.fillSrc, 'test/notes.json'),
    JSON.stringify({
      [name]: { light: { flags: { 'warp-max': max } }, night: { flags: { 'warp-max': max } } },
    })
  );
}

async function runCli(script, ...args) {
  process.argv = ['node', script, ...args];
  vi.resetModules();
  await cliImports[script]();
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'splotch-audit-cli-'));
  state.roots = {
    root,
    assetGen: join(root, 'asset-gen'),
    coloring: join(root, 'coloring'),
    fillSrc: join(root, 'fill-src'),
    samples: join(root, 'samples'),
  };
  await Promise.all([
    mkdir(join(state.roots.assetGen, 'golden'), { recursive: true }),
    mkdir(join(state.roots.coloring, 'test'), { recursive: true }),
    mkdir(join(state.roots.fillSrc, 'test'), { recursive: true }),
  ]);
  state.pages = [];
  state.overlayRequests = 0;
  state.lightVerdict = { passes: true, gated: true };
  process.exitCode = undefined;
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  await rm(state.roots.root, { recursive: true, force: true });
});

it('coloring drift reports a corrupt fill, continues, and exits non-zero', async () => {
  state.pages = [await addPage('bad', { corruptFill: true }), await addPage('good')];

  await runCli('check-fill-drift.mjs');

  expect(outputOf(error)).toContain('test/bad light  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('test/good');
  expect(process.exitCode).toBe(1);
});

it('coloring drift only renders requested overlays for failed pages', async () => {
  state.pages = [await addPage('bad', { drifted: true }), await addPage('good')];

  await runCli('check-fill-drift.mjs', '--overlay');

  await expect(
    readFile(join(state.roots.samples, 'drift/test-bad.overlay.png'), 'utf8')
  ).resolves.toBe('overlay');
  expect(state.overlayRequests).toBe(1);
});

it('coloring drift fails a confident local warp and reports residual shift separately', async () => {
  state.pages = [await addPage('warped', { warped: true }), await addPage('good')];

  await runCli('check-fill-drift.mjs');

  expect(outputOf(log)).toContain('test/warped');
  expect(outputOf(log)).toContain('8.0px');
  expect(outputOf(log)).toContain('LOCAL WARP');
  expect(outputOf(log)).toContain('npm run gen:coloring-fills -- test/warped --apply');
  expect(process.exitCode).toBe(1);
});

it('coloring drift accepts a reviewed page ceiling but an explicit CLI ceiling still fails', async () => {
  state.pages = [await addPage('warped', { warped: true, night: true })];
  await addWarpNotes('warped', 8.5);

  await runCli('check-fill-drift.mjs');

  expect(outputOf(log)).toContain('baseline exception (notes.json 8.5px)');
  expect(process.exitCode).toBeUndefined();

  log.mockClear();
  await runCli('check-fill-drift.mjs', '--warp-max', '7.5');

  const output = outputOf(log);
  expect(output).toContain('LOCAL WARP');
  expect(output).toContain('npm run gen:coloring-fills -- test/warped --apply');
  expect(output).toContain(
    'node --experimental-strip-types --disable-warning=ExperimentalWarning tools/asset-gen/coloring/gen-night-fills.mjs test/warped --apply'
  );
  expect(process.exitCode).toBe(1);
});

it('coloring drift reports an obsolete loose notes ceiling without failing an improved page', async () => {
  state.pages = [await addPage('improved')];
  await addWarpNotes('improved', 8.5);

  await runCli('check-fill-drift.mjs');

  expect(outputOf(log)).toContain('stale warp ceiling (notes.json 8.5px)');
  expect(process.exitCode).toBeUndefined();
});

it('coloring drift sorts a failed outline ahead of a larger non-failing baseline warp', async () => {
  state.pages = [
    await addPage('baseline', { warped: true }),
    await addPage('outline-failure', { drifted: true }),
  ];
  await addWarpNotes('baseline', 8.5);

  await runCli('check-fill-drift.mjs');

  const output = outputOf(log);
  expect(output.indexOf('test/outline-failure')).toBeLessThan(output.indexOf('test/baseline'));
});

it('fill eyes reports a corrupt fill, continues, and exits non-zero', async () => {
  state.pages = [await addPage('bad', { corruptFill: true }), await addPage('good')];

  await runCli('check-fill-eyes.mjs');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('test/good');
  expect(process.exitCode).toBe(1);
});

it('fill eyes reports an accepted unmeasurable page as ungated', async () => {
  state.pages = [await addPage('ungated')];
  state.lightVerdict = { passes: true, gated: false };

  await runCli('check-fill-eyes.mjs');

  expect(outputOf(log)).toContain('test/ungated');
  expect(outputOf(log)).toMatch(/test\/ungated\s+0\s+0\s+n\/a/);
  expect(process.exitCode).toBeUndefined();
});

it('outline solidity reports a corrupt outline, continues, and exits non-zero', async () => {
  state.pages = [await addPage('bad', { corruptOutline: true }), await addPage('good')];

  await runCli('check-outline-quality.mjs');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('test/good');
  expect(process.exitCode).toBe(1);
});

it.each([
  {
    name: 'solid-only',
    issues: ['solid'],
    summary: '1 solid · 0 over-ringed · 0 page frame(s)',
    normalize: true,
    fresh: false,
  },
  {
    name: 'ring-only',
    issues: ['ring'],
    summary: '0 solid · 1 over-ringed · 0 page frame(s)',
    normalize: true,
    fresh: false,
  },
  {
    name: 'frame-only',
    issues: ['frame'],
    summary: '0 solid · 0 over-ringed · 1 page frame(s)',
    normalize: false,
    fresh: true,
  },
  {
    name: 'mixed',
    issues: ['solid', 'ring', 'frame'],
    summary: '1 solid · 1 over-ringed · 1 page frame(s)',
    normalize: true,
    fresh: true,
  },
])('outline audit prints the right remediation for $name failures', async (scenario) => {
  state.pages = [await addPage('bad', { outlineIssues: scenario.issues })];

  await runCli('check-outline-quality.mjs');

  const output = outputOf(log);
  expect(output).toContain(scenario.summary);
  expect(output.includes('gen:coloring-outlines:normalize')).toBe(scenario.normalize);
  expect(output.includes('gen:coloring-outlines:fresh')).toBe(scenario.fresh);
  expect(output.includes('--scene "<description>"')).toBe(scenario.fresh);
});

it('golden diff reports a corrupt outline, retains successful pages, and exits non-zero', async () => {
  await addPage('bad', { corruptOutline: true });
  await addPage('good');
  await writeFile(
    join(state.roots.assetGen, 'golden/golden-scores.json'),
    JSON.stringify({ version: 5, pages: { 'test/bad': {}, 'test/good': {} } })
  );

  await runCli('check-golden-scores.mjs', '--diff');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('1 page(s) diffed vs golden');
  expect(outputOf(log)).toContain('0 regression(s)');
  expect(outputOf(log)).not.toContain('test/bad  page missing');
  expect(process.exitCode).toBe(1);
});

it('golden freeze preserves the baseline when any page errors', async () => {
  await addPage('bad', { corruptOutline: true });
  await addPage('good');
  const goldenPath = join(state.roots.assetGen, 'golden/golden-scores.json');
  await writeFile(goldenPath, 'complete baseline\n');

  await runCli('check-golden-scores.mjs', '--freeze');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('Skipped freeze after scoring 1 page(s)');
  await expect(readFile(goldenPath, 'utf8')).resolves.toBe('complete baseline\n');
  expect(process.exitCode).toBe(1);
});
