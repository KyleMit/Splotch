import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { releaseSeamProblems } from '../check-release-seams.mjs';

const fixtures = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-release-seams-'));
  fixtures.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('accepts a client bundle without profiling seams', () => {
  const dir = fixture();
  writeFileSync(join(dir, 'app.js'), 'console.log("release")');

  expect(releaseSeamProblems(dir)).toEqual([]);
});

it('finds profiling seams and engine marks recursively', () => {
  const dir = fixture();
  const nested = join(dir, 'nodes');
  mkdirSync(nested);
  writeFileSync(
    join(nested, 'drawing.js'),
    'window.__drawingDebug = {}; performance.mark("engine.undo")'
  );

  expect(releaseSeamProblems(dir)).toEqual([
    expect.stringContaining('__drawingDebug remains in'),
    expect.stringContaining('engine.undo remains in'),
  ]);
});
