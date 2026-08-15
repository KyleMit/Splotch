import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two configs enumerate the tools/ capability folders by hand, and both fail
// silently when a new one is forgotten: knip stops covering it (lint:dead keeps
// passing over code nothing reaches), and Netlify stops rebuilding on it (or,
// before the ':(glob)' fix, rebuilt on everything). ADR-0108 chose enumeration
// deliberately in both places — knip cannot re-include a path under a negated
// glob, and a blanket `tools` in the deploy filter would trigger rebuilds on
// asset-gen/perf/vectorize changes that never triggered them before — so this
// is the drift guard those enumerations require instead of a prose instruction.
const repoRoot = join(import.meta.dirname, '..', '..');

// Capabilities correctly absent from the enumerations below, for two different
// reasons. asset-gen and vectorize carry their own explicit knip entry/project
// globs and their own test suites. store-drawings has neither: it is outside
// knip's analysis entirely, because its shipped surface is
// generated/store-drawings.mjs — a generated catalog that exports every drawing
// whether or not each has a caller, so covering it would red `lint:dead` on
// output no human wrote.
const SEPARATELY_CONFIGURED = new Set(['asset-gen', 'store-drawings', 'vectorize']);

// Tracked files, not a directory listing: tools/node_modules (asset-gen's
// dependency alias) is on disk but is not a capability.
const capabilityFolders = [
  ...new Set(
    execFileSync('git', ['ls-files', 'tools'], { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((path) => path.split('/'))
      .filter((segments) => segments.length > 2 && !segments[1].startsWith('.'))
      .map((segments) => segments[1])
  ),
].filter((name) => !SEPARATELY_CONFIGURED.has(name));

/** The names inside the first `tools/{a,b,c}/…` brace list in knip's project globs. */
function knipEnumeratedFolders() {
  const knip = JSON.parse(readFileSync(join(repoRoot, 'knip.json'), 'utf8'));
  const braced = knip.project.find((glob) => glob.startsWith('tools/{'));
  return braced.slice('tools/{'.length, braced.indexOf('}')).split(',');
}

describe('knip project enumeration', () => {
  it('lists every tools/ capability folder', () => {
    expect(knipEnumeratedFolders().slice().sort()).toEqual(capabilityFolders.slice().sort());
  });
});

describe('netlify deploy-skip filter', () => {
  const ignore = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8')
    .split('\n')
    .find((line) => line.trimStart().startsWith('ignore ='));

  // A plain Git pathspec's '*' crosses directory separators, so an unmagicked
  // 'tools/*.mjs' silently matches every .mjs under tools/ and rebuilds on any
  // capability change — the regression this pins.
  it('selects only the flat entry points, not every .mjs under tools/', () => {
    const matched = execFileSync('git', ['ls-files', '--', ':(glob)tools/*.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');

    expect(matched.every((path) => path.split('/').length === 2)).toBe(true);
    expect(ignore).toContain("':(glob)tools/*.mjs'");
  });

  it('watches every tools/ path the production build actually runs', () => {
    const { scripts } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

    // The build phases delegate through `npm run <name>`, so a literal scan of
    // prebuild/build/postbuild misses everything they call. Expand transitively.
    const expand = (name, seen = new Set()) => {
      if (seen.has(name) || !scripts[name]) return '';
      seen.add(name);
      const body = scripts[name];
      const nested = [...body.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);
      return [body, ...nested.map((child) => expand(child, seen))].join(' ');
    };

    const buildPhase = ['prebuild', 'build', 'postbuild'].map((name) => expand(name)).join(' ');

    // Walk the import graph too: the build reaches tools/lib/ only through the
    // entry points' imports, so a text scan alone would let a shared-helper
    // change ship without a rebuild.
    const folders = new Set();
    const queue = [...buildPhase.matchAll(/(tools\/[\w./-]+\.mjs)/g)].map((m) => m[1]);
    const visited = new Set();
    while (queue.length > 0) {
      const file = queue.pop();
      if (visited.has(file) || !existsSync(join(repoRoot, file))) continue;
      visited.add(file);
      const segments = file.split('/');
      if (segments.length > 2) folders.add(segments[1]);
      const source = readFileSync(join(repoRoot, file), 'utf8');
      for (const [, spec] of source.matchAll(/from\s*'(\.[^']*\.mjs)'/g)) {
        queue.push(
          relative(repoRoot, resolve(repoRoot, dirname(file), spec)).replaceAll('\\', '/')
        );
      }
    }

    expect(folders.size).toBeGreaterThan(0);
    for (const folder of folders) {
      expect(ignore, `build runs tools/${folder}/ but the deploy filter ignores it`).toContain(
        `tools/${folder}`
      );
    }
  });
});
