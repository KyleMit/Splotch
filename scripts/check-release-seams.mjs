import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CLIENT_BUNDLE_DIR = join(ROOT, 'web/.svelte-kit/output/client/_app/immutable');
const RELEASE_SEAM_SOURCE_FILES = [
  'web/src/lib/boot/devHarnessSeam.ts',
  'web/src/lib/drawing/screenshot.ts',
  'web/src/lib/drawing/engine.ts',
  'web/src/lib/drawing/undoHistory.ts',
  'web/src/lib/drawing/emptyScan.ts',
];

export const RELEASE_ONLY_TOKENS = [
  ...new Set(
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
  ),
].sort();

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
