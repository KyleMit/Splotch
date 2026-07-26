import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ roots: null, pages: [] }));

const assertReadable = (buffer) => {
  if (buffer.toString() === 'corrupt') throw new Error('corrupt image');
};

vi.mock('../lib/paths.mjs', () => ({
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
  fail(message) {
    throw new Error(message);
  },
  resolveNightLineArt: async () => ({ source: null, chalk: null }),
}));

vi.mock('../lib/outline-targets.mjs', () => ({
  resolveOutlineTargets: async () => state.pages,
}));

vi.mock('../lib/outline-match.mjs', () => ({
  KEEP_THRESHOLD: 0.92,
  LOCAL_KEEP_THRESHOLD: 0.8,
  outlineMatch: async (source, fill) => {
    assertReadable(source);
    assertReadable(fill);
    return { keep: 1, localKeep: 1, worstTile: null, overlay: Buffer.alloc(0) };
  },
}));

vi.mock('../lib/solid-regions.mjs', () => ({
  SOLID_BLOB_MAX: 100,
  SOLID_INTERIOR_MAX: 60,
  scoreSolidity: async (buffer) => {
    assertReadable(buffer);
    return {
      darkPx: 1,
      solidPx: 0,
      interiorPx: 0,
      biggestBlob: 0,
      strokeWidth: 1,
      passes: true,
    };
  },
}));

vi.mock('../lib/eye-fill.mjs', () => ({
  EYE_RING_DEPTH_MAX: 5,
  scoreEyeRings: async (buffer) => {
    assertReadable(buffer);
    return { maxDepth: 0, passes: true };
  },
  scoreEyeFill: async (buffer) => {
    assertReadable(buffer);
    return { cores: [] };
  },
  judgeLightEyes: () => ({ passes: true }),
  judgeNightEyes: () => ({ passes: true }),
}));

vi.mock('../lib/composite-eye.mjs', () => ({
  scoreCompositeEyes: async () => ({ passes: true }),
}));

vi.mock('../lib/night-composite.mjs', () => ({
  compositeNight: async (buffer) => buffer,
}));

vi.mock('../lib/golden-catalog.mjs', () => ({
  GOLDEN_VERDICTS: [],
  diffGoldenPage: () => {},
  scoreGoldenNightEyes: async () => ({}),
}));

vi.mock('../lib/night-scores.mjs', () => ({
  DRIFT_THRESHOLD_DEFAULT: 0.1,
  NIGHT_BG_LUMA_MAX_DEFAULT: 50,
  LINE_WHITE_MIN_DEFAULT: 200,
  scoreDrift: async () => ({ ratio: 0 }),
  scoreNightness: async () => ({ bgLuma: 0 }),
  scoreLineColor: async () => ({ lineWhite: 255 }),
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let log;
let error;

const cliImports = {
  'check-coloring-drift.mjs': () => import('../bin/check-coloring-drift.mjs'),
  'audit-fill-eyes.mjs': () => import('../bin/audit-fill-eyes.mjs'),
  'audit-outline-solidity.mjs': () => import('../bin/audit-outline-solidity.mjs'),
  'audit-golden.mjs': () => import('../bin/audit-golden.mjs'),
};

const outputOf = (spy) => spy.mock.calls.map((args) => args.join(' ')).join('\n');

async function addPage(name, { corruptOutline = false, corruptFill = false } = {}) {
  const outline = join(state.roots.coloring, `test/${name}.outline.webp`);
  const fill = join(state.roots.fillSrc, `test/${name}.light.raw.webp`);
  await writeFile(outline, corruptOutline ? 'corrupt' : 'valid outline');
  await writeFile(fill, corruptFill ? 'corrupt' : 'valid fill');
  return outline;
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

test('coloring drift reports a corrupt fill, continues, and exits non-zero', async () => {
  state.pages = [await addPage('bad', { corruptFill: true }), await addPage('good')];

  await runCli('check-coloring-drift.mjs');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('test/good');
  expect(process.exitCode).toBe(1);
});

test('fill eyes reports a corrupt fill, continues, and exits non-zero', async () => {
  state.pages = [await addPage('bad', { corruptFill: true }), await addPage('good')];

  await runCli('audit-fill-eyes.mjs');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('test/good');
  expect(process.exitCode).toBe(1);
});

test('outline solidity reports a corrupt outline, continues, and exits non-zero', async () => {
  state.pages = [await addPage('bad', { corruptOutline: true }), await addPage('good')];

  await runCli('audit-outline-solidity.mjs');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('test/good');
  expect(process.exitCode).toBe(1);
});

test('golden diff reports a corrupt outline, retains successful pages, and exits non-zero', async () => {
  await addPage('bad', { corruptOutline: true });
  await addPage('good');
  await writeFile(
    join(state.roots.assetGen, 'golden/golden-scores.json'),
    JSON.stringify({ version: 2, pages: { 'test/bad': {}, 'test/good': {} } })
  );

  await runCli('audit-golden.mjs', '--diff');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('1 page(s) diffed vs golden');
  expect(process.exitCode).toBe(1);
});

test('golden freeze preserves the baseline when any page errors', async () => {
  await addPage('bad', { corruptOutline: true });
  await addPage('good');
  const goldenPath = join(state.roots.assetGen, 'golden/golden-scores.json');
  await writeFile(goldenPath, 'complete baseline\n');

  await runCli('audit-golden.mjs', '--freeze');

  expect(outputOf(error)).toContain('test/bad  ERROR (corrupt image)');
  expect(outputOf(log)).toContain('Skipped freeze after scoring 1 page(s)');
  await expect(readFile(goldenPath, 'utf8')).resolves.toBe('complete baseline\n');
  expect(process.exitCode).toBe(1);
});
