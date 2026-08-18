// Locks the fail-loudly seams of the viewBox rebase (ADR-0125): every
// coordinate-bearing construct is either transformed correctly or rejected —
// never left on the old grid to slip under the pixel gate — and sources whose
// preserveAspectRatio the verifier cannot model are refused outright.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rebaseIcon } from '../rebase-icon-viewbox.mjs';

let dir;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rebase-icon-viewbox-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeIcon(name, svg) {
  const file = join(dir, `${name}.svg`);
  await writeFile(file, svg);
  return file;
}

const attr = (svg, name) => svg.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe('rebase-icon-viewbox geometry coverage', () => {
  it('transforms <polygon> points onto the canonical grid (the silent-triangle repro)', async () => {
    const file = await writeIcon(
      'triangle',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon fill="#1f1f1f" points="2,2 22,2 12,20"/></svg>'
    );
    const result = await rebaseIcon(file);
    expect(result.changed).toBe(true);
    const out = await readFile(file, 'utf8');
    expect(attr(out, 'viewBox')).toBe('0 0 1000 1000');
    const points = attr(out, 'points')
      .split(/[\s,]+/)
      .map(Number);
    // 24-grid → 1000-grid is ×41.67: (2,2) (22,2) (12,20) land scaled, not stranded.
    expect(points).toEqual([83.33, 83.33, 916.67, 83.33, 500, 833.33]);
  });

  it('transforms <polyline> and <line> coordinates', async () => {
    const file = await writeIcon(
      'wires',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polyline fill="none" stroke="#1f1f1f" stroke-width="4" points="10 10 50 90 90 10"/><line stroke="#1f1f1f" stroke-width="4" x1="10" y1="50" x2="90" y2="50"/></svg>'
    );
    await rebaseIcon(file);
    const out = await readFile(file, 'utf8');
    expect(attr(out, 'points')).toBe('100,100 500,900 900,100');
    expect(attr(out, 'x1')).toBe('100');
    expect(attr(out, 'y2')).toBe('500');
    // user-space strokes scale with the coordinates (×10)
    expect(out.match(/stroke-width="40"/g)).toHaveLength(2);
  });

  it('rejects elements the transform pass never visits instead of trusting the pixel gate', async () => {
    const file = await writeIcon(
      'labeled',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#1f1f1f"/><text x="4" y="12">hi</text></svg>'
    );
    await expect(rebaseIcon(file)).rejects.toThrow(/unsupported element <text>/);
  });

  it('rejects non-default preserveAspectRatio the verifier cannot model', async () => {
    const file = await writeIcon(
      'left-aligned',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20" preserveAspectRatio="xMinYMid meet"><rect width="10" height="20" fill="#1f1f1f"/></svg>'
    );
    await expect(rebaseIcon(file)).rejects.toThrow(/preserveAspectRatio="xMinYMid meet"/);
  });

  it('accepts an explicit spelling of the default alignment', async () => {
    const file = await writeIcon(
      'default-aligned',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20" preserveAspectRatio="xMidYMid meet"><rect width="10" height="20" fill="#1f1f1f"/></svg>'
    );
    const result = await rebaseIcon(file);
    expect(result.changed).toBe(true);
    expect(attr(await readFile(file, 'utf8'), 'viewBox')).toBe('0 0 1000 1000');
  });

  it('is a no-op on a file already on the canonical grid', async () => {
    const file = await writeIcon(
      'canonical',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="400" fill="#1f1f1f"/></svg>'
    );
    expect(await rebaseIcon(file)).toEqual({ changed: false });
  });
});
