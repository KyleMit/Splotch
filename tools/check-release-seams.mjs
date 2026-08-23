import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CLIENT_BUNDLE_DIR = join(ROOT, 'web/.svelte-kit/output/client/_app/immutable');
const ENGINE_SOURCE_PATH = 'web/src/lib/drawing/engine.ts';
const TILED_RENDERER_SOURCE_PATH = 'web/src/lib/drawing/tiledRenderer.ts';
const RELEASE_SEAM_SOURCE_FILES = [
  'web/src/lib/boot/devHarnessSeam.ts',
  'web/src/lib/drawing/screenshot.ts',
  ENGINE_SOURCE_PATH,
  // Carries `engine.draw`, which moved out of the engine when the per-frame
  // raster queue was extracted. A measure in a file missing from this list is
  // not scanned, so the derived token list silently loses it.
  'web/src/lib/drawing/strokeRasterQueue.ts',
  'web/src/lib/drawing/undoHistory.ts',
  'web/src/lib/drawing/emptyScan.ts',
  'web/src/lib/storeCapture.ts',
];
const RELEASE_ONLY_DEBUG_PROPERTIES = [
  'backingMigrationPending',
  'baseRasterBytes',
  'inputOps',
  'liveSurfaceElements',
  'liveRasters',
  'maxLiveBackingBytes',
  'maxSurfaceVisitsPerOp',
  'pendingCommands',
  'rasterizedOps',
  'realizedCrayonBackings',
  'realizedNormalBackings',
  'totalLiveBackingBytes',
];

export const DEV_GATED_ENGINE_EXPORTS = [
  'setScreenAngleOverride',
  'getDrawingWorkDebug',
  'getUndoDebug',
  'setCrayonParams',
  'replayHarnessStroke',
];

export const RELEASE_ONLY_TOKENS = [
  ...new Set(
    RELEASE_ONLY_DEBUG_PROPERTIES.concat(
      RELEASE_SEAM_SOURCE_FILES.flatMap((relativePath) => {
        const source = readFileSync(join(ROOT, relativePath), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        return [
          ...[...source.matchAll(/window\.(__[A-Za-z0-9_]+)/g)].map((match) => match[1]),
          ...[...source.matchAll(/performance\.(?:mark|measure)\('(engine\.[A-Za-z]+)/g)].map(
            (match) => match[1]
          ),
        ];
      })
    )
  ),
].sort();

function exportedFunctionBody(source, name) {
  const declarationStart = source.indexOf(`export function ${name}`);
  if (declarationStart === -1) return null;
  const bodyStart = source.indexOf('{', declarationStart);
  if (bodyStart === -1) return null;

  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] !== '}') continue;
    depth--;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }
  return null;
}

export function engineDevGateProblems(
  source = readFileSync(join(ROOT, ENGINE_SOURCE_PATH), 'utf8')
) {
  return DEV_GATED_ENGINE_EXPORTS.flatMap((name) => {
    const body = exportedFunctionBody(source, name);
    if (body === null) return [`${name} export is missing from ${ENGINE_SOURCE_PATH}`];
    if (
      !/^if\s*\(\s*!dev\s*&&\s*!__DEV_HARNESS__(?:\s*&&\s*!PERF_MARKS)?\s*\)\s*(?:return\b|throw\b|\{\s*(?:return\b|throw\b))/.test(
        body.trimStart()
      )
    ) {
      return [`${name} must begin with the __DEV_HARNESS__ compile-time guard`];
    }
    return [];
  });
}

export function drawingWorkHotPathProblems(
  source = readFileSync(join(ROOT, TILED_RENDERER_SOURCE_PATH), 'utf8')
) {
  const guardedRanges = [];
  const guardedBlock = /if\s*\(\s*workCounters\s*\)\s*\{/g;
  for (const match of source.matchAll(guardedBlock)) {
    const start = match.index + match[0].lastIndexOf('{');
    let depth = 1;
    let end = start + 1;
    while (depth > 0 && end < source.length) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
      end++;
    }
    guardedRanges.push({ start, end });
  }
  for (const match of source.matchAll(
    /if\s*\(\s*workCounters\s*\)\s*surfaceVisits\s*(?:\+\+|\+=\s*[^;\n]+)\s*;/g
  )) {
    guardedRanges.push({ start: match.index, end: match.index + match[0].length });
  }

  return [...source.matchAll(/surfaceVisits\s*(?:\+\+|\+=\s*[^;\n]+)/g)].flatMap((match) => {
    const guarded = guardedRanges.some(
      ({ start, end }) => match.index > start && match.index < end
    );
    if (guarded) return [];
    const line = source.slice(0, match.index).split('\n').length;
    return [
      `${TILED_RENDERER_SOURCE_PATH}:${line}: surface-visit accounting must stay behind the compile-time workCounters gate`,
    ];
  });
}

function javascriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

export function releaseSeamProblems(dir) {
  if (!existsSync(dir)) return [`Client bundle directory does not exist: ${dir}`];
  const problems = [];
  for (const path of javascriptFiles(dir)) {
    const source = readFileSync(path, 'utf8');
    for (const token of RELEASE_ONLY_TOKENS) {
      if (source.includes(token)) problems.push(`${token} remains in ${path}`);
    }
  }
  return problems;
}

export async function checkReleaseSeams({
  dir = CLIENT_BUNDLE_DIR,
  env = process.env,
  log = console.log,
} = {}) {
  const sourceProblems = [...engineDevGateProblems(), ...drawingWorkHotPathProblems()];
  if (sourceProblems.length) throw new Error(sourceProblems.join('\n'));
  const instrumented = env.PERF_MARKS === 'true' || env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
  if (instrumented) {
    log('[release-seams] instrumented build: profiling seams retained');
    return;
  }
  const problems = releaseSeamProblems(dir);
  if (problems.length) throw new Error(problems.join('\n'));
  log('[release-seams] release client contains no profiling seams or engine marks');
}

if (isMain(import.meta.url)) runMain(checkReleaseSeams);
