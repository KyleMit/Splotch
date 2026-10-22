import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8');
const packageJson = JSON.parse(read('package.json'));

describe('dev ports agree across their declarations', () => {
  // adb:reverse forwards device→desktop, so both sides of the pair are the same
  // port; a mismatched pair forwards to nothing and reads as a dead dev server.
  it('forwards the same port on both sides of adb:reverse', () => {
    const [device, desktop] = packageJson.scripts['adb:reverse'].match(/tcp:(\d+)/g);
    expect(device).toBe(desktop);
  });
});
