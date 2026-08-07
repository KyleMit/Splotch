import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditImages } from '../image-audit.mjs';

// The drift guard runs over a fixture tree instead of web/: its failure paths
// (an unparseable file, a stale ignore entry) can't be exercised against the
// real icons, and those paths are exactly what a CI-only guard never proves.
const UNOPTIMIZED = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
  <!-- a comment SVGO strips -->
  <g><rect x="0" y="0" width="10" height="10" fill="#ff0000"/></g>
</svg>
`;
const OPTIMIZED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="red" d="M0 0h10v10H0z"/></svg>';

// Both entries of the script's IGNORE set, which it requires to exist.
const GENERATOR_INPUTS = ['web/static/large-image.svg', 'web/static/styles/source.svg'];

let root;

function write(rel, contents) {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'image-audit-'));
  for (const rel of GENERATOR_INPUTS) write(rel, UNOPTIMIZED);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('auditImages', () => {
  it('passes when every SVG is already at its optimized form', () => {
    write('web/src/lib/icons/check.svg', OPTIMIZED);

    expect(auditImages({ check: true, root })).toMatchObject({
      exitCode: 0,
      changed: [],
      failed: [],
    });
  });

  it('fails the check on an unoptimized SVG without writing to it', () => {
    const path = write('web/src/lib/icons/check.svg', UNOPTIMIZED);

    const result = auditImages({ check: true, root });

    expect(result.exitCode).toBe(1);
    expect(result.changed).toEqual(['web/src/lib/icons/check.svg']);
    expect(readFileSync(path, 'utf8')).toBe(UNOPTIMIZED);
  });

  it('optimizes in place without --check, leaving the tree passing the check', () => {
    const path = write('web/src/lib/icons/check.svg', UNOPTIMIZED);

    expect(auditImages({ root }).exitCode).toBe(0);
    expect(readFileSync(path, 'utf8').length).toBeLessThan(UNOPTIMIZED.length);
    expect(auditImages({ check: true, root }).exitCode).toBe(0);
  });

  // The regression this suite exists for: an unparseable file used to throw out
  // of the loop, so every SVG sorted after it went unchecked while the run
  // still exited non-zero — a guard that had quietly stopped guarding.
  it('reports an unparseable SVG and keeps auditing the files after it', () => {
    write('web/src/lib/icons/a-broken.svg', 'not xml at all');
    write('web/src/lib/icons/z-unoptimized.svg', UNOPTIMIZED);

    const result = auditImages({ check: true, root });

    expect(result.exitCode).toBe(1);
    expect(result.failed).toEqual(['web/src/lib/icons/a-broken.svg']);
    expect(result.changed).toEqual(['web/src/lib/icons/z-unoptimized.svg']);
  });

  it('keeps already-written work when a later file fails', () => {
    const path = write('web/src/lib/icons/a-unoptimized.svg', UNOPTIMIZED);
    write('web/src/lib/icons/z-broken.svg', '<svg><g></svg>');

    const result = auditImages({ root });

    expect(result.exitCode).toBe(1);
    expect(result.failed).toEqual(['web/src/lib/icons/z-broken.svg']);
    expect(readFileSync(path, 'utf8').length).toBeLessThan(UNOPTIMIZED.length);
  });

  it('fails on an empty SVG instead of reading it as already optimal', () => {
    write('web/src/lib/icons/empty.svg', '');

    expect(auditImages({ check: true, root })).toMatchObject({
      exitCode: 1,
      failed: ['web/src/lib/icons/empty.svg'],
    });
  });

  it('never rewrites the generator-input SVGs it exempts', () => {
    expect(auditImages({ root }).exitCode).toBe(0);

    for (const rel of GENERATOR_INPUTS) {
      expect(readFileSync(join(root, rel), 'utf8'), rel).toBe(UNOPTIMIZED);
    }
  });

  it('fails loudly when an exempted path no longer exists', () => {
    rmSync(join(root, 'web/static/styles/source.svg'));
    write('web/src/lib/icons/check.svg', UNOPTIMIZED);

    const result = auditImages({ check: true, root });

    expect(result.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('web/static/styles/source.svg')
    );
    // The scan never ran, so the unoptimized icon isn't what failed it.
    expect(result.changed).toEqual([]);
  });

  it('skips build output and installed packages', () => {
    write('web/build/icons/check.svg', UNOPTIMIZED);
    write('web/node_modules/pkg/logo.svg', UNOPTIMIZED);

    expect(auditImages({ check: true, root }).exitCode).toBe(0);
  });
});
