import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { commonWebServer } from '../../web/playwright.shared.ts';

// Both throwaway servers that boot this app — the Playwright web server and the
// one tools/api-smoke/run-local-contract.mjs spawns — must declare every private env
// var the app reads, never inherit it. Vite gives process.env precedence over
// web/.env, so a
// name missing from either object silently picks up whatever a developer put in
// their dotenv: that is how an ambient GITHUB_ISSUE_TOKEN turned the /feedback
// failure-path spec into six real issues in the tracker (#646), and it is also
// how a spec can pass locally on a credential CI doesn't have.
const repoRoot = join(import.meta.dirname, '..', '..');
const appDir = join(repoRoot, 'web', 'src');
const apiSmokePath = join(repoRoot, 'tools', 'api-smoke', 'run-local-contract.mjs');
const PRIVATE_ENV_IMPORT = "from '$env/dynamic/private'";
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
    .filter(({ text }) => text.includes(PRIVATE_ENV_IMPORT))
    .flatMap(({ text }) => [...text.matchAll(PRIVATE_ENV_READ)].map((match) => match[1]))
);

const unscannableReads = sources
  .filter(
    ({ text }) =>
      STATIC_PRIVATE_IMPORT.test(text) ||
      (text.includes(PRIVATE_ENV_IMPORT) && DESTRUCTURED_PRIVATE_ENV.test(text))
  )
  .map(({ path }) => path);

/** The object literal `spawnViteServer` is handed, sliced out at its braces. */
function apiSmokeEnvLiteral(source) {
  const open = source.indexOf('{', source.indexOf('env: {', source.indexOf('spawnViteServer(')));
  let depth = 0;
  let cursor = open;
  do {
    if (source[cursor] === '{') depth++;
    if (source[cursor] === '}') depth--;
    cursor++;
  } while (depth > 0 && cursor < source.length);
  return source.slice(open, cursor);
}

// run-local-contract.mjs is a CLI that boots its server as a side effect of loading, so
// its declaration is read from the source instead of imported. A value that
// isn't a string literal (ADMIN_SECRET, SEED_TOKENS) reads as null — the name is
// declared, which is all this file checks of it.
function apiSmokeServerEnv() {
  const assignments = apiSmokeEnvLiteral(readFileSync(apiSmokePath, 'utf8')).matchAll(
    /^\s*([A-Z][A-Z0-9_]*):\s*(.*?),\s*$/gm
  );
  return Object.fromEntries(
    [...assignments].map(([, name, value]) => [name, value.match(/^'(.*)'$/)?.[1] ?? null])
  );
}

const servers = [
  { name: 'the Playwright web server', env: commonWebServer.env },
  { name: 'the api-smoke server', env: apiSmokeServerEnv() },
];

describe('throwaway server env', () => {
  it('finds the private env reads to check', () => {
    expect(privateEnvNames.size).toBeGreaterThan(0);
  });

  it('finds every private env read in a shape it can scan', () => {
    expect(
      unscannableReads,
      'read private env as `env.NAME` off $env/dynamic/private — the other shapes hide the name ' +
        'from this guard, leaving it to arrive from a developer web/.env'
    ).toEqual([]);
  });

  for (const { name, env } of servers) {
    // eslint-disable-next-line vitest/valid-title -- parametrized suite named by the discovered server
    describe(name, () => {
      it('declares an env at all', () => {
        expect(Object.keys(env).length).toBeGreaterThan(0);
      });

      for (const privateName of privateEnvNames) {
        it(`declares ${privateName} instead of inheriting it`, () => {
          expect(Object.keys(env)).toContain(privateName);
        });
      }

      // Only the token forces the graceful-503 branch, so only it has to be
      // exactly blank. The model key is declared but deliberately unusable
      // rather than empty — an empty one makes the managed-code path 500 before
      // the guards the generate-image cases exercise.
      it('leaves reporting unconfigured', () => {
        expect(env.GITHUB_ISSUE_TOKEN).toBe('');
      });
    });
  }

  // One is TypeScript the other can't import, so the repo they each hard-code
  // has to be checked against the other rather than shared.
  it('points both feedback flows at the same nonexistent repo', () => {
    expect(servers[1].env.GITHUB_ISSUE_REPO).toBe(servers[0].env.GITHUB_ISSUE_REPO);
  });
});
