// The engine's user-timing names, read back by perf tools that cannot import
// them: page-injected probes poll getEntriesByName, and Node scripts filter
// trace and Web Inspector entries by name. A mark renamed in the engine passes
// every other check; the tool then waits out its timeout on a physical-device
// capture, aggregates an empty set, or drops a row from its report.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { UNDO_INK_MOTION_MEASURE_NAME, UNDO_MEASURE_NAME } from '../lib/undo-driver.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EMITTER_DIR = 'web/src/lib/drawing';
const CONSUMER_DIR = 'tools';
const NOT_CONSUMERS = new Set(['node_modules', 'tests', 'fixtures']);

// Names no current build emits, kept by analyze-web-inspector.mjs so Web
// Inspector exports recorded against the snapshot/blob renderer stay readable.
const ARCHIVED_NAMES = new Set(['engine.snapshot', 'engine.encode', 'engine.reinflate']);

function sourceFiles(dir, keep) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return NOT_CONSUMERS.has(entry.name) ? [] : sourceFiles(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const namesIn = (source, pattern) => new Set([...source.matchAll(pattern)].map((m) => m[1]));

const emitterSource = sourceFiles(EMITTER_DIR, (name) => /(?<!\.test)\.ts$/.test(name))
  .map((path) => readFileSync(join(ROOT, path), 'utf8'))
  .join('\n');
const emittedMeasures = namesIn(emitterSource, /performance\.measure\(\s*'(engine\.[^']+)'/g);
const emittedMarks = namesIn(emitterSource, /performance\.mark\(\s*'(engine\.[^']+)'/g);

// Quoted literals only: a template like `${name}:start` is built from a name
// that appears quoted elsewhere, and backticked names live in prose.
const CONSUMED_NAME = /(['"])(engine\.[A-Za-z][A-Za-z.]*(?::(?:start|end))?)\1/g;

function consumedNames() {
  const consumers = new Map();
  for (const path of sourceFiles(CONSUMER_DIR, (name) => /\.m?js$/.test(name))) {
    const source = withoutComments(readFileSync(join(ROOT, path), 'utf8'));
    for (const [, , name] of source.matchAll(CONSUMED_NAME)) {
      consumers.set(name, [...(consumers.get(name) ?? []), relative(CONSUMER_DIR, path)]);
    }
  }
  return consumers;
}

const isMark = (name) => /:(start|end)$/.test(name);
const baseName = (name) => name.replace(/:(start|end)$/, '');
const isEmitted = (name) => (isMark(name) ? emittedMarks : emittedMeasures).has(name);

describe('engine measure names the perf tools consume', () => {
  const consumers = consumedNames();
  const current = [...consumers.keys()].filter((name) => !ARCHIVED_NAMES.has(baseName(name)));

  it('finds the page-injected probes and the Node-side readers', () => {
    const files = new Set([...consumers.values()].flat());
    for (const file of [
      'perf/probes/engine-gates.js',
      'perf/probes/paced-crayon-session.js',
      'perf/lib/undo-driver.mjs',
      'perf/lib/commit-contract.mjs',
      'perf/analyze-web-inspector.mjs',
    ]) {
      expect(files).toContain(file);
    }
    expect(emittedMeasures.size).toBeGreaterThan(0);
  });

  it.each(current)('%s is emitted under web/src/lib/drawing', (name) => {
    expect(isEmitted(name), `${name}, read by ${consumers.get(name).join(', ')}`).toBe(true);
  });

  it.each([UNDO_MEASURE_NAME, UNDO_INK_MOTION_MEASURE_NAME])(
    'the exported %s constant is emitted',
    (name) => {
      expect(emittedMeasures).toContain(name);
    }
  );

  it.each([...ARCHIVED_NAMES])('archived %s is still read and no longer emitted', (name) => {
    expect([...consumers.keys()].map(baseName)).toContain(name);
    expect(emittedMeasures).not.toContain(name);
    expect(emittedMarks).not.toContain(`${name}:start`);
  });
});
