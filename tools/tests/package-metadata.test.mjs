import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The licence is declared twice: `LICENSE` is what GitHub and humans read, and
// `package.json#license` is what `pnpm licenses`, SBOM generators, and
// dependency-licence scanners read. Neither validates the other, so a change
// to one would leave the package advertising a different licence from the repo.
const repoRoot = join(import.meta.dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const licenseHeading = readFileSync(join(repoRoot, 'LICENSE'), 'utf8').split('\n')[0].trim();

describe('package.json metadata', () => {
  it('declares the same licence as the LICENSE file', () => {
    expect(licenseHeading).toBe(`${manifest.license} License`);
  });

  it('is marked private so an accidental npm publish is refused', () => {
    expect(manifest.private).toBe(true);
  });

  it('points repository and bugs at the GitHub remote', () => {
    const origin = 'https://github.com/KyleMit/Splotch';
    expect(manifest.repository).toEqual({ type: 'git', url: `git+${origin}.git` });
    expect(manifest.bugs).toEqual({ url: `${origin}/issues` });
  });
});
