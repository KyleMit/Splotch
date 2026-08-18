import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  checkReleaseSeams,
  DEV_GATED_ENGINE_EXPORTS,
  drawingWorkHotPathProblems,
  engineDevGateProblems,
  RELEASE_ONLY_TOKENS,
  releaseSeamProblems,
} from '../check-release-seams.mjs';

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
    '__committedBrushMode',
    '__drawingDebug',
    '__screenshotSaveSink',
    '__storeCapture',
    'backingMigrationPending',
    'baseRasterBytes',
    'engine.commit',
    'engine.draw',
    'engine.resize',
    'engine.scanEmpty',
    'engine.undo',
    'inputOps',
    'liveRasters',
    'liveSurfaceElements',
    'maxLiveBackingBytes',
    'maxSurfaceVisitsPerOp',
    'pendingCommands',
    'rasterizedOps',
    'realizedCrayonBackings',
    'realizedNormalBackings',
    'totalLiveBackingBytes',
  ]);
});

it('requires every engine dev export to start behind the compile-time gate', () => {
  expect(engineDevGateProblems()).toEqual([]);
});

it.each(DEV_GATED_ENGINE_EXPORTS)('rejects an ungated %s export', (name) => {
  const source = DEV_GATED_ENGINE_EXPORTS.map(
    (exportName) =>
      `export function ${exportName}() { ${exportName === name ? '' : 'if (!dev && !__DEV_HARNESS__) return;'} }`
  ).join('\n');

  expect(engineDevGateProblems(source)).toContain(
    `${name} must begin with the __DEV_HARNESS__ compile-time guard`
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

it('skips an explicitly instrumented build before reading its bundle', async () => {
  const log = vi.fn();

  await expect(
    checkReleaseSeams({
      dir: join(fixture(), 'missing'),
      env: { PERF_MARKS: 'true' },
      log,
    })
  ).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith('[release-seams] instrumented build: profiling seams retained');
});

it('reports a missing release client directory', async () => {
  const missing = join(fixture(), 'missing');

  await expect(checkReleaseSeams({ dir: missing, env: {}, log: vi.fn() })).rejects.toThrow(
    `Client bundle directory does not exist: ${missing}`
  );
});
