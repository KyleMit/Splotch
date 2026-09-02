import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { playwrightReportFolder } from '../../web/playwright.shared.ts';

// playwright.shared.ts pins the folder both Playwright reporters write to, and
// test.yml uploads it by a literal path YAML cannot import. This is the guard
// against the two drifting apart: a moved folder would leave every Playwright
// job uploading nothing (if-no-files-found: error) — or, worse, an old copy.

const repoRoot = join(import.meta.dirname, '..', '..');
const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'test.yml'), 'utf8');
const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8').split('\n');

const uploadPaths = [
  ...workflow.matchAll(/^\s+name: playwright-report-.*\n(?:.*\n)*?\s+path: (\S+)$/gm),
].map((match) => match[1]);

describe('Playwright report folder', () => {
  const folder = relative(repoRoot, playwrightReportFolder);

  it('is what every Playwright job in test.yml uploads', () => {
    expect(uploadPaths.length).toBeGreaterThan(0);
    for (const uploadPath of uploadPaths) expect(uploadPath).toBe(`${folder}/`);
  });

  it('is gitignored, so the per-run record never churns the working tree', () => {
    expect(gitignore).toContain(`/${folder}/`);
  });
});
