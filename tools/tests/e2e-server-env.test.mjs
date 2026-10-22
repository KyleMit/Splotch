import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every throwaway server that boots this app — the SvelteKit Playwright web
// server, the RN web E2E server (e2e/server/serve.ts) and the function host
// tools/api-smoke/run-local-contract.mjs starts — must declare every private env
// var the app reads, never inherit it. Each server reads process.env,
// and the Playwright one fills its gaps from web/.env, so a name missing from
// either object silently picks up whatever a developer exported or put in
// their dotenv: that is how an ambient GITHUB_ISSUE_TOKEN turned the /feedback
// failure-path spec into six real issues in the tracker (#646), and it is also
// how a spec can pass locally on a credential CI doesn't have.
const repoRoot = join(import.meta.dirname, '..', '..');
const appDir = join(repoRoot, 'web', 'src');
join(repoRoot, 'tools', 'api-smoke', 'run-local-contract.mjs');
// The private env is web/src/lib/server/privateEnv.ts's `env`, imported by a
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

describe('throwaway server env', () => {
  it('finds the private env reads to check', () => {
    expect(privateEnvNames.size).toBeGreaterThan(0);
  });

  it('finds every private env read in a shape it can scan', () => {
    expect(
      unscannableReads,
      'read private env as `env.NAME` off lib/server/privateEnv — the other shapes hide the name ' +
        'from this guard, leaving it to arrive from a developer web/.env'
    ).toEqual([]);
  });
});
