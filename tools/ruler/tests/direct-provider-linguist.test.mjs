import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DIRECT_PROVIDER_PATHS } from '../direct-provider-skills.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// check-attr needs file paths; a registered directory is probed through the
// SKILL.md its layout guarantees.
function probeFile(path) {
  return path.endsWith('.md') ? path : `${path}/SKILL.md`;
}

describe('direct provider packages are marked authored in .gitattributes', () => {
  it('overrides linguist-generated=false for every registered path', () => {
    const probes = DIRECT_PROVIDER_PATHS.map(probeFile);
    const output = execFileSync('git', ['check-attr', 'linguist-generated', '--', ...probes], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const misclassified = output
      .trim()
      .split('\n')
      .filter((line) => !line.endsWith(': linguist-generated: false'));
    expect(misclassified).toEqual([]);
  });
});
