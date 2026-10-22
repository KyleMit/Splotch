import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const CHILD_TIMEOUT_MS = 10_000;
const SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><path d="M0 0L10 10"/></g></svg>';
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-svg-guard-'));
  fixtures.push(root);
  for (const path of ['tools/optimize-svg-assets.mjs', 'tools/lib/proc.mjs']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(root, path));
  }
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'));
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), SOURCE);
  }
  return root;
}
const run = (root, args) =>
  spawnSync(process.execPath, [join(root, 'tools/optimize-svg-assets.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS,
  });

it.each(['assets/icons/probe.svg', 'assets/static/coloring/probe.svg'])(
  'rejects an unoptimized shipped SVG at %s without rewriting it',
  (path) => {
    const root = fixture([path]);
    const result = run(root, ['--check']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`NEEDS OPT  ${path}`);
    expect(readFileSync(join(root, path), 'utf8')).toBe(SOURCE);
  }
);

it('optimizes both moved owners and accepts their canonical bytes', () => {
  const root = fixture(['assets/icons/probe.svg', 'assets/static/coloring/probe.svg']);
  expect(run(root, []).status).toBe(0);
  const result = run(root, ['--check']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('2 SVG(s) already optimal');
});

it('fails the check when its shipped SVG scan is empty', () => {
  const result = run(fixture([]), ['--check']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No SVGs found');
});
