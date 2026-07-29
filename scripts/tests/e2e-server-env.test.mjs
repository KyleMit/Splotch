import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { commonWebServer } from '../../web/playwright.shared.ts';

// The Playwright web server must declare every private env var the app reads,
// never inherit it. Vite gives process.env precedence over web/.env, so a name
// missing from commonWebServer.env silently picks up whatever a developer put
// in their dotenv: that is how an ambient GITHUB_ISSUE_TOKEN turned the
// /feedback failure-path spec into six real issues in the tracker (#646), and
// it is also how a spec can pass locally on a credential CI doesn't have.
const repoRoot = join(import.meta.dirname, '..', '..');
const appDir = join(repoRoot, 'web', 'src');
const PRIVATE_ENV_IMPORT = "from '$env/dynamic/private'";

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

const privateEnvNames = new Set(
  sourceFiles(appDir)
    .map((path) => readFileSync(path, 'utf8'))
    .filter((source) => source.includes(PRIVATE_ENV_IMPORT))
    .flatMap((source) => [...source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)].map((m) => m[1]))
);

describe('Playwright web server env', () => {
  it('finds the private env reads to check', () => {
    expect(privateEnvNames.size).toBeGreaterThan(0);
  });

  for (const name of privateEnvNames) {
    it(`declares ${name} instead of inheriting it`, () => {
      expect(Object.keys(commonWebServer.env)).toContain(name);
    });
  }

  it('leaves the outbound-write credentials unconfigured', () => {
    expect(commonWebServer.env.GITHUB_ISSUE_TOKEN).toBe('');
    expect(commonWebServer.env.GEMINI_API_KEY).toBe('');
  });
});
