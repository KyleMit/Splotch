import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateOutputAtomically } from '../gen-page-inventory.mjs';

const fixtures = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-page-inventory-'));
  fixtures.push(root);
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('page inventory output', () => {
  it('preserves the complete baseline and removes staging when generation fails', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    mkdirSync(join(out, 'assets'), { recursive: true });
    writeFileSync(join(out, 'index.html'), 'baseline report\n');
    writeFileSync(join(out, 'assets', 'baseline.webp'), 'baseline snapshot\n');

    await expect(
      generateOutputAtomically(out, async (staging) => {
        mkdirSync(join(staging, 'assets'));
        writeFileSync(join(staging, 'assets', 'partial.webp'), 'partial snapshot\n');
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');

    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('baseline report\n');
    expect(readFileSync(join(out, 'assets', 'baseline.webp'), 'utf8')).toBe('baseline snapshot\n');
    expect(existsSync(join(out, 'assets', 'partial.webp'))).toBe(false);
    expect(readdirSync(root)).toEqual(['page-inventory']);
  });
});
