import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  checkReleaseSeams,
  CLIENT_SOURCE_EXTENSIONS,
  DEV_GATED_EXPORTS,
  devGateProblems,
  drawingWorkHotPathProblems,
  engineMeasureNames,
  magicWitnessMeasureNames,
  RELEASE_ONLY_TOKENS,
  RELEASE_SEAM_SOURCE_FILES,
  releaseSeamProblems,
} from '../check-release-seams.mjs';
import { ROOT } from '../lib/proc.mjs';

const fixtures = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-release-seams-'));
  fixtures.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('accepts a client bundle without profiling seams', () => {
  const dir = fixture();
  writeFileSync(join(dir, 'app.js'), 'console.log("release")');

  expect(releaseSeamProblems(dir)).toEqual([]);
});

it.each(RELEASE_ONLY_TOKENS)('finds release-only token %s recursively', (token) => {
  const nested = join(fixture(), 'nodes');
  mkdirSync(nested);
  writeFileSync(join(nested, 'drawing.js'), JSON.stringify(token));

  expect(releaseSeamProblems(dirname(nested))).toEqual([
    expect.stringContaining(`${token} remains in`),
  ]);
});

it('derives every current window seam and engine measure family', () => {
  expect(RELEASE_ONLY_TOKENS).toEqual([
    '__aiGenerate',
    '__bundledCaptureReport',
    '__committedBrushMode',
    '__drawingDebug',
    '__prepareRefusedAiKeyForget',
    '__probe',
    '__replayStroke',
    '__screenshotSaveSink',
    '__storeCapture',
    'backingMigrationPending',
    'baseRasterBytes',
    'engine.commit',
    'engine.crayonShadow',
    'engine.draw',
    'engine.fold',
    'engine.resize',
    'engine.scanEmpty',
    'engine.undo',
    'engine.undoInkMotion',
    'engine.undoPatchCapture',
    'engine.undoPatchCrop',
    'historyRepaints',
    'inputOps',
    'liveRasters',
    'liveSurfaceElements',
    'magicBrushState',
    'magicBrushWorkerRequests',
    'magicDeferredFill',
    'magicEngineFacts',
    'magicEnsureOutcomes',
    'magicFillUrl',
    'magicGradientSelections',
    'magicHeldGradient',
    'magicInitialPosts',
    'magicMainAttempts',
    'magicMainCauses',
    'magicMainOrigins',
    'magicMainOutcomes',
    'magicMainPaints',
    'magicMainStaleAttempts',
    'magicPaperSize',
    'magicPendingFillRaster',
    'magicPendingGradientRaster',
    'magicPendingLoad',
    'magicPoolBuilds',
    'magicPoolExists',
    'magicRecodeChanges',
    'magicRecodeCompletedDelegations',
    'magicRecodeInvocations',
    'magicRecodeNoChanges',
    'magicRecodeNoContext',
    'magicRecodeNoSnapshot',
    'magicRecodeThrows',
    'magicRecodes',
    'magicRejectedRequests',
    'magicResolvedRequests',
    'magicRetryPosts',
    'magicSheetBounds',
    'magicSheetGeometryStale',
    'magicSheetOrigin',
    'magicSheetReady',
    'magicSheetSourceUrl',
    'magicSourceKind',
    'magicSupersededDisposals',
    'magicWitness.ensure',
    'magicWitness.mainRaster',
    'magicWitness.publish',
    'magicWitness.recode',
    'magicWitness.workerCreate',
    'magicWitness.workerRequest',
    'magicWitnessRevision',
    'magicWorkCounts',
    'magicWorkerAcquisitions',
    'magicWorkerConstructed',
    'magicWorkerConstructionAttempts',
    'magicWorkerExists',
    'magicWorkerFailures',
    'magicWorkerNextRequestId',
    'magicWorkerPending',
    'magicWorkerPublications',
    'magicWorkerRequests',
    'magicWorkerRetirements',
    'magicWorkerState',
    'magicWorkerSupported',
    'maxLiveBackingBytes',
    'maxSurfaceVisitsPerOp',
    'pendingCommands',
    'rasterizedOps',
    'realizedCrayonBackings',
    'realizedNormalBackings',
    'totalLiveBackingBytes',
  ]);
});

it('matches a token whole, so engine.undo does not report engine.undoInkMotion', () => {
  const dir = fixture();
  writeFileSync(join(dir, 'undo.js'), JSON.stringify('engine.undoInkMotion'));

  expect(releaseSeamProblems(dir)).toEqual([
    expect.stringContaining('engine.undoInkMotion remains in'),
  ]);
});

function sourceFilesEmittingEngineMeasures(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesEmittingEngineMeasures(path);
    if (!CLIENT_SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) return [];
    if (entry.name.includes('.test.')) return [];
    const source = readFileSync(path, 'utf8');
    return engineMeasureNames(source).length + magicWitnessMeasureNames(source).length > 0
      ? [path]
      : [];
  });
}

it('lexes a measure whose string Prettier wrapped onto the next line', () => {
  expect(engineMeasureNames("performance.measure(\n  'engine.wrapped',\n  { start }\n);")).toEqual([
    'engine.wrapped',
  ]);
  expect(engineMeasureNames("// performance.mark('engine.commented:start')")).toEqual([]);
});

it('finds a wrapped-only emitter in a Svelte source', () => {
  const dir = fixture();
  writeFileSync(
    join(dir, 'Cue.svelte'),
    '<script lang="ts">\n  performance.measure(\n    \'engine.cue\',\n    { start }\n  );\n</script>\n'
  );
  writeFileSync(join(dir, 'quiet.ts'), 'export const quiet = true;');

  expect(sourceFilesEmittingEngineMeasures(dir)).toEqual([join(dir, 'Cue.svelte')]);
});

it('scans every source file that emits an engine measure', () => {
  const emitters = sourceFilesEmittingEngineMeasures(join(ROOT, 'web/src')).map((path) =>
    relative(ROOT, path)
  );

  expect(emitters.length).toBeGreaterThan(0);
  expect(emitters.filter((path) => !RELEASE_SEAM_SOURCE_FILES.includes(path))).toEqual([]);
});

it('requires every dev-only export to start behind the compile-time gate', () => {
  expect(devGateProblems()).toEqual([]);
});

it.each(DEV_GATED_EXPORTS)('rejects an ungated $name export', ({ name, sourcePath }) => {
  const readSource = (path) =>
    DEV_GATED_EXPORTS.filter((entry) => entry.sourcePath === path)
      .map(
        ({ name: exportName }) =>
          `export ${exportName === 'prepareRefusedAiKeyForget' ? 'async ' : ''}function ${exportName}() { ${exportName === name && path === sourcePath ? '' : 'if (!dev && !__DEV_HARNESS__) return;'} }`
      )
      .join('\n');

  expect(devGateProblems(readSource)).toContain(
    `${name} in ${sourcePath} must begin with the __DEV_HARNESS__ compile-time guard`
  );
});

it('ignores commented-out dev guards when checking the live export', () => {
  const target = DEV_GATED_EXPORTS.find(({ name }) => name === 'prepareRefusedAiKeyForget');
  const readSource = (path) =>
    DEV_GATED_EXPORTS.filter((entry) => entry.sourcePath === path)
      .map(({ name }) => {
        if (name !== target.name) {
          return `export function ${name}() { if (!dev && !__DEV_HARNESS__) return; }`;
        }
        return [
          `// export async function ${name}() { if (!dev && !__DEV_HARNESS__) return; }`,
          `export async function ${name}() { await persistCredential(); }`,
        ].join('\n');
      })
      .join('\n');

  expect(devGateProblems(readSource)).toContain(
    `${target.name} in ${target.sourcePath} must begin with the __DEV_HARNESS__ compile-time guard`
  );
});

it('requires surface-visit accounting to stay behind the compile-time gate', () => {
  expect(drawingWorkHotPathProblems()).toEqual([]);
  expect(drawingWorkHotPathProblems('const untouched = true;\nsurfaceVisits += 1;')).toEqual([
    'web/src/lib/drawing/tiledRenderer.ts:2: surface-visit accounting must stay behind the compile-time workCounters gate',
  ]);
  expect(drawingWorkHotPathProblems('if (workCounters) surfaceVisits++;')).toEqual([]);
  expect(drawingWorkHotPathProblems('if (workCounters) {\n  surfaceVisits += visited;\n}')).toEqual(
    []
  );
});

it.each([{ PERF_MARKS: 'true' }, { PUBLIC_ENABLE_DEV_HARNESS: 'true' }])(
  'skips an explicitly instrumented build before reading its bundle: %j',
  async (env) => {
    const log = vi.fn();

    await expect(
      checkReleaseSeams({
        dir: join(fixture(), 'missing'),
        env,
        log,
      })
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      '[release-seams] instrumented build: profiling seams retained'
    );
  }
);

it('reports a missing release client directory', async () => {
  const missing = join(fixture(), 'missing');

  await expect(checkReleaseSeams({ dir: missing, env: {}, log: vi.fn() })).rejects.toThrow(
    `Client bundle directory does not exist: ${missing}`
  );
});

it('lexes wrapped Magic witness emitters and rejects inline and block comments', () => {
  expect(
    magicWitnessMeasureNames("performance.measure(\n 'magicWitness.ensure', { start });")
  ).toEqual(['magicWitness.ensure']);
  expect(
    magicWitnessMeasureNames(
      "const done = true; // performance.measure('magicWitness.recode', { start });"
    )
  ).toEqual([]);
  expect(
    magicWitnessMeasureNames("/* performance.measure('magicWitness.publish', { start }); */")
  ).toEqual([]);
});

it('accepts retained Magic host and private decision plumbing in release output', () => {
  const dir = fixture();
  const retained = [
    'magicActive',
    'fill-direct',
    'unsupported',
    'no-bounds',
    'source-unavailable',
    'worker-failed',
    'ensure',
    'eager-resize',
    'fill-load',
    'fill-load-error',
    'remove-fill',
    'worker-rejection',
    'no-context',
    'no-snapshot',
    'apply-fill',
    'host-repaint',
  ];
  writeFileSync(join(dir, 'magic.js'), JSON.stringify(retained));
  expect(releaseSeamProblems(dir)).toEqual([]);
});

it('retains the whole Magic namespace name for invalid extra emitters', () => {
  expect(
    magicWitnessMeasureNames(`performance.measure("magicWitness.extra2.nested", { start });`)
  ).toEqual(['magicWitness.extra2.nested']);
  expect(magicWitnessMeasureNames("performance.measure('magicWitness.', { start });")).toEqual([
    'magicWitness.',
  ]);
});
