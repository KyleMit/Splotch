import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CLIENT_BUNDLE_DIR = join(ROOT, 'web/.svelte-kit/output/client/_app/immutable');
const RELEASE_ONLY_TOKENS = [
  '__committedBrushMode',
  '__drawingDebug',
  '__screenshotSaveSink',
  'engine.commit',
  'engine.draw',
  'engine.undo',
];

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

export async function checkReleaseSeams() {
  const instrumented =
    process.env.PERF_MARKS === 'true' || process.env.PUBLIC_ENABLE_DEV_HARNESS === 'true';
  if (instrumented) {
    console.log('[release-seams] instrumented build: profiling seams retained');
    return;
  }
  const problems = releaseSeamProblems(CLIENT_BUNDLE_DIR);
  if (problems.length) throw new Error(problems.join('\n'));
  console.log('[release-seams] release client contains no profiling seams or engine marks');
}

if (isMain(import.meta.url)) runMain(checkReleaseSeams);
