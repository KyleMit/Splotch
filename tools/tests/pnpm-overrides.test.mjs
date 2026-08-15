import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// pnpm-workspace.yaml forces @capacitor/assets' transitive sharp up to the version
// package.json declares, so the asset CLI uses sharp's prebuilt @img/* binaries
// instead of its own sharp@0.32.6, whose install script downloads libvips from
// GitHub releases and 403s behind the cloud sessions' egress proxy. The two ranges
// are written out twice on purpose (ADR-0119): pnpm's `$sharp` back-reference is
// deprecated in pnpm 11 and warns on every command, and the `catalog:` protocol it
// points at would move the range out of package.json, where Dependabot reads it.
// Duplicated agreement needs a drift guard rather than a "keep in sync" comment —
// bumping sharp and leaving the override behind silently reintroduces the download.
const repoRoot = join(import.meta.dirname, '..', '..');

const SHARP_OVERRIDE_KEY = '@capacitor/assets>sharp';

/** The override map from pnpm-workspace.yaml, read without a YAML dependency. */
function pnpmOverrides() {
  const lines = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8').split('\n');
  const start = lines.findIndex((line) => line === 'overrides:');
  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    // Dedented back to column 0 — the overrides block has ended.
    if (!line.startsWith('  ')) break;
    // Either quote style: Prettier owns this file's formatting and normalizes a
    // quoted key to single quotes, which is what broke the first draft of this parser.
    const [, key, value] = line.match(/^ {2}['"]?([^'":]+)['"]?:\s*(\S+)$/) ?? [];
    if (key) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

describe('pnpm overrides', () => {
  const overrides = pnpmOverrides();
  const { devDependencies } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

  it('parses the block it is guarding', () => {
    expect(Object.keys(overrides)).toContain(SHARP_OVERRIDE_KEY);
  });

  it('pins @capacitor/assets to the sharp range package.json declares', () => {
    expect(overrides[SHARP_OVERRIDE_KEY]).toBe(devDependencies.sharp);
  });
});
