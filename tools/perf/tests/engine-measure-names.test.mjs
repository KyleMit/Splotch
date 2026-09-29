// The engine's user-timing names, read back by perf tools that cannot import
// them: page-injected probes poll getEntriesByName, and Node scripts filter
// trace and Web Inspector entries by name. A mark renamed in the engine passes
// every other check; the tool then waits out its timeout on a physical-device
// capture, aggregates an empty set, or drops a row from its report.
//
// Both sides are parsed rather than pattern-matched, so a commented-out
// emitter does not count as emitted and a template-literal reader is still read.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { UNDO_INK_MOTION_MEASURE_NAME, UNDO_MEASURE_NAME } from '../lib/undo-driver.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EMITTER_DIR = 'web/src/lib/drawing';
const CONSUMER_DIR = 'tools';
const SKIPPED_DIRS = new Set(['node_modules', 'tests', 'fixtures']);
const ENGINE_NAME = /^engine\.[A-Za-z][A-Za-z.]*(?::(?:start|end))?$/;

// Names no current build emits, kept by analyze-web-inspector.mjs so Web
// Inspector exports recorded against the snapshot/blob renderer stay readable.
const ARCHIVED_NAMES = new Set(['engine.snapshot', 'engine.encode', 'engine.reinflate']);

function sourceFiles(dir, keep) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

function* syntaxNodes(path) {
  const kind = path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = readFileSync(join(ROOT, path), 'utf8');
  const pending = [ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, kind)];
  while (pending.length) {
    const node = pending.pop();
    yield node;
    ts.forEachChild(node, (child) => void pending.push(child));
  }
}

const isStaticString = (node) =>
  node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

function emitted() {
  const found = { measure: new Set(), mark: new Set() };
  for (const path of sourceFiles(EMITTER_DIR, (name) => /(?<!\.test)\.ts$/.test(name))) {
    for (const node of syntaxNodes(path)) {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) continue;
      const { expression: target, name: method } = node.expression;
      const [first] = node.arguments;
      if (ts.isIdentifier(target) && target.text === 'performance' && isStaticString(first)) {
        found[method.text]?.add(first.text);
      }
    }
  }
  return found;
}

function consumed() {
  const readers = new Map();
  for (const path of sourceFiles(CONSUMER_DIR, (name) => /\.m?js$/.test(name))) {
    for (const node of syntaxNodes(path)) {
      if (!isStaticString(node) || !ENGINE_NAME.test(node.text)) continue;
      const files = readers.get(node.text) ?? new Set();
      readers.set(node.text, files.add(relative(CONSUMER_DIR, path)));
    }
  }
  return readers;
}

const isMark = (name) => /:(start|end)$/.test(name);
const baseName = (name) => name.replace(/:(start|end)$/, '');

describe('engine measure names the perf tools consume', () => {
  const { measure: measures, mark: marks } = emitted();
  const readers = consumed();
  const current = [...readers.keys()].filter((name) => !ARCHIVED_NAMES.has(baseName(name)));

  it('finds the page-injected probes and the Node-side readers', () => {
    const files = new Set([...readers.values()].flatMap((set) => [...set]));
    for (const file of [
      'perf/probes/engine-gates.js',
      'perf/probes/paced-crayon-session.js',
      'perf/lib/undo-driver.mjs',
      'perf/lib/commit-contract.mjs',
      'perf/analyze-web-inspector.mjs',
    ]) {
      expect(files).toContain(file);
    }
    expect(measures.size).toBeGreaterThan(0);
  });

  it.each(current)('%s is emitted under web/src/lib/drawing', (name) => {
    const emittedAs = isMark(name) ? marks : measures;
    expect(emittedAs.has(name), `${name}, read by ${[...readers.get(name)].join(', ')}`).toBe(true);
  });

  it.each([UNDO_MEASURE_NAME, UNDO_INK_MOTION_MEASURE_NAME])(
    'the exported %s constant is emitted',
    (name) => {
      expect(measures).toContain(name);
    }
  );

  it.each([...ARCHIVED_NAMES])('archived %s is still read and no longer emitted', (name) => {
    expect([...readers.keys()].map(baseName)).toContain(name);
    expect(measures).not.toContain(name);
    expect(marks).not.toContain(`${name}:start`);
  });
});
