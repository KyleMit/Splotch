import { E2E_SERVER_ENV } from '../../e2e/server/serverEnv.ts';
import { contractServerEnv } from '../api-smoke/lib/server-env.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Both local hosts declare every private server read and the build-time API mode, so an ambient
// credential cannot reach a smoke and a spec cannot pass on a secret CI does not hold. An ambient
// GitHub token previously turned a feedback failure case into real issues (issue 646).
const repoRoot = join(import.meta.dirname, '..', '..');
const appDir = join(repoRoot, 'netlify', 'server');
// The private env is netlify/server/privateEnv.ts's `env`, imported by a
// relative path so the /api Netlify Functions can bundle its readers.
const PRIVATE_ENV_IMPORT = /from '(?:\.\.?\/)+(?:server\/)?privateEnv'/;
// Only the bound `env` identifier. `process.env.X` and `import.meta.env.X` are
// different objects that happen to end in the same characters, and demanding
// one of those names be declared would have a harness blank a Node or Vite var
// (NODE_ENV, NETLIFY, DEV) in the server it starts.
const PRIVATE_ENV_READ = /(?<![.\w])env\.([A-Z][A-Z0-9_]*)\b/g;
// A read the scan above cannot see is a name it can hold no server to, so the
// shape itself is rejected rather than passed over: `$env/static/private` names
// arrive as bindings with no `env.` in sight, and destructuring the dynamic env
// hides them the same way.
const STATIC_PRIVATE_IMPORT = /from '\$env\/static\/private'/;
const DESTRUCTURED_PRIVATE_ENV = /\{[^}]*\}\s*=\s*env\b/;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

const sources = sourceFiles(appDir).map((path) => ({
  path: relative(repoRoot, path),
  text: readFileSync(path, 'utf8'),
}));

const privateEnvNames = new Set(
  sources
    .filter(({ text }) => PRIVATE_ENV_IMPORT.test(text))
    .flatMap(({ text }) => [...text.matchAll(PRIVATE_ENV_READ)].map((match) => match[1]))
);

const unscannableReads = sources
  .filter(
    ({ text }) =>
      STATIC_PRIVATE_IMPORT.test(text) ||
      (PRIVATE_ENV_IMPORT.test(text) && DESTRUCTURED_PRIVATE_ENV.test(text))
  )
  .map(({ path }) => path);

function missingEnvironmentNames(candidate) {
  return [...privateEnvNames, 'SPLOTCH_API_MODE'].filter((name) => !Object.hasOwn(candidate, name));
}

describe('throwaway server env', () => {
  it('declares every private read and build-time API mode in both hosts', () => {
    expect(missingEnvironmentNames(E2E_SERVER_ENV)).toEqual([]);
    expect(missingEnvironmentNames(contractServerEnv('test-admin'))).toEqual([]);
  });

  it('detects an omitted API mode as a negative control', () => {
    const candidate = { ...E2E_SERVER_ENV };
    delete candidate.SPLOTCH_API_MODE;
    expect(missingEnvironmentNames(candidate)).toContain('SPLOTCH_API_MODE');
  });

  it('finds the private env reads to check', () => {
    expect(privateEnvNames.size).toBeGreaterThan(0);
  });

  it('finds every private env read in a shape it can scan', () => {
    expect(
      unscannableReads,
      'read private env as `env.NAME` off netlify/server/privateEnv; hidden names bypass host isolation'
    ).toEqual([]);
  });
});
