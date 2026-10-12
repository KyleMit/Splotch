import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILD_PROVENANCE_FILE,
  buildProvenance,
  stampedBuildCommit,
} from '../lib/build-provenance.mjs';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function scratch() {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-provenance-'));
  directories.push(directory);
  return directory;
}

// Capture-time HEAD records the wrong commit whenever HEAD moves after the
// build: served and local bytes still agree (both are the old build), so the
// freshness guard passes while the artifact claims a commit whose product was
// never measured (Codex review of the distillation stack). Provenance is
// written by the build step, which is the thing that knows it.
describe('buildProvenance', () => {
  const git = (answers) => (args) => answers[args.join(' ')] ?? null;

  it('records the commit and a clean tree', () => {
    expect(buildProvenance(git({ 'rev-parse HEAD': 'abc123', 'status --porcelain': '' }))).toEqual({
      commit: 'abc123',
      dirty: false,
    });
  });

  it('flags a dirty tree, whose bytes no commit describes', () => {
    expect(
      buildProvenance(git({ 'rev-parse HEAD': 'abc123', 'status --porcelain': ' M web/src/a.ts' }))
    ).toEqual({ commit: 'abc123', dirty: true });
  });

  it('returns null when git does not answer', () => {
    expect(buildProvenance(git({}))).toBeNull();
  });
});

describe('stampedBuildCommit', () => {
  it('reads the commit from a clean stamp', () => {
    const buildDir = scratch();
    writeFileSync(
      join(buildDir, BUILD_PROVENANCE_FILE),
      JSON.stringify({ commit: 'abc123', dirty: false })
    );

    expect(stampedBuildCommit(buildDir)).toBe('abc123');
  });

  it('refuses a dirty-tree stamp', () => {
    const buildDir = scratch();
    writeFileSync(
      join(buildDir, BUILD_PROVENANCE_FILE),
      JSON.stringify({ commit: 'abc123', dirty: true })
    );

    expect(stampedBuildCommit(buildDir)).toBeNull();
  });

  it('records no commit for an unstamped build, however HEAD resolves', () => {
    expect(stampedBuildCommit(scratch())).toBeNull();
  });

  it('refuses a malformed stamp', () => {
    const buildDir = scratch();
    writeFileSync(join(buildDir, BUILD_PROVENANCE_FILE), '{"commit": 42, "dirty": false}');

    expect(stampedBuildCommit(buildDir)).toBeNull();
  });
});
