import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertDprintPlugins,
  dprintPluginPackages,
  satisfiesRange,
} from '../check-dprint-plugins.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const roots = [];

// A checkout stands in for the real one: dprint.json's plugin list and the
// package.json ranges are the repo's, only the installed versions are staged.
function makeCheckout({ installed }) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-dprint-plugins-'));
  roots.push(root);
  writeFileSync(join(root, 'dprint.json'), readFileSync(join(repoRoot, 'dprint.json')));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ devDependencies: declaredRanges() }, null, 2)
  );
  for (const [name, version] of Object.entries(installed)) {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
  }
  return root;
}

function declaredRanges() {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const declared = { ...manifest.devDependencies, ...manifest.dependencies };
  return Object.fromEntries(repoPlugins().map((name) => [name, declared[name]]));
}

function repoPlugins() {
  const config = readFileSync(join(repoRoot, 'dprint.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return dprintPluginPackages(JSON.parse(config));
}

function satisfyingVersions() {
  return Object.fromEntries(
    Object.entries(declaredRanges()).map(([name, range]) => [name, range.replace('^', '')])
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('dprint plugin packages', () => {
  it('reads every plugin dprint.json loads from node_modules', () => {
    expect(repoPlugins()).toContain('@dprint/markdown');
    expect(repoPlugins().every((name) => name.startsWith('@dprint/'))).toBe(true);
  });

  it('ignores a plugin loaded from anywhere but node_modules', () => {
    expect(
      dprintPluginPackages({ plugins: ['https://plugins.dprint.dev/markdown-0.24.0.wasm'] })
    ).toEqual([]);
  });
});

describe('caret satisfaction', () => {
  // The 0.x caret is the case the guard exists for: ^0.24.0 must reject the
  // 0.22.1 a stale worktree still has installed, while admitting 0.24.x.
  it('holds the minor for a 0.x range', () => {
    expect(satisfiesRange('^0.24.0', '0.22.1')).toBe(false);
    expect(satisfiesRange('^0.24.0', '0.24.0')).toBe(true);
    expect(satisfiesRange('^0.24.0', '0.24.7')).toBe(true);
    expect(satisfiesRange('^0.24.0', '0.25.0')).toBe(false);
  });

  it('holds the major for a 1.x range', () => {
    expect(satisfiesRange('^1.2.3', '1.2.2')).toBe(false);
    expect(satisfiesRange('^1.2.3', '1.9.0')).toBe(true);
    expect(satisfiesRange('^1.2.3', '2.0.0')).toBe(false);
  });

  it('matches an exact pin exactly', () => {
    expect(satisfiesRange('0.24.0', '0.24.0')).toBe(true);
    expect(satisfiesRange('0.24.0', '0.24.1')).toBe(false);
  });

  // A pin this guard cannot read must stop the run rather than pass it: a range
  // syntax silently treated as satisfied is a guard that has stopped guarding.
  it('rejects a range syntax it does not implement', () => {
    expect(() => satisfiesRange('~0.24.0', '0.24.0')).toThrow('unsupported version pin');
    expect(() => satisfiesRange('^0.24.0', '0.24.0-alpha.1')).toThrow('unsupported version pin');
  });
});

describe('assertDprintPlugins', () => {
  it('passes the checkout it is committed in', () => {
    expect(() => assertDprintPlugins(repoRoot)).not.toThrow();
  });

  it('passes a checkout installed at the declared versions', () => {
    expect(() =>
      assertDprintPlugins(makeCheckout({ installed: satisfyingVersions() }))
    ).not.toThrow();
  });

  // The failure a stale worktree hits: main bumped the plugin and the config
  // option that came with it, the install stayed behind, and dprint reported the
  // option rather than the version.
  it('names the version gap and the install command for a stale plugin', () => {
    const installed = { ...satisfyingVersions(), '@dprint/markdown': '0.22.1' };
    const range = declaredRanges()['@dprint/markdown'];

    expect(() => assertDprintPlugins(makeCheckout({ installed }))).toThrow(
      `@dprint/markdown 0.22.1 is installed but package.json wants ${range}.`
    );
    expect(() => assertDprintPlugins(makeCheckout({ installed }))).toThrow(
      'pnpm install --frozen-lockfile'
    );
  });

  it('names a plugin the checkout never installed', () => {
    const { '@dprint/markdown': _absent, ...installed } = satisfyingVersions();

    expect(() => assertDprintPlugins(makeCheckout({ installed }))).toThrow(
      '@dprint/markdown is not installed'
    );
  });

  it('names a plugin package.json does not declare', () => {
    const root = makeCheckout({ installed: satisfyingVersions() });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: {} }));

    expect(() => assertDprintPlugins(root)).toThrow(
      '@dprint/markdown is a dprint.json plugin that package.json does not declare'
    );
  });
});
