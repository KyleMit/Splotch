// The paths the custom Netlify Functions claim through `config.path`, read from
// their source. Netlify itself reads `config` by static analysis, so it is always
// a literal; reading it the same way serves the places that cannot import the
// TypeScript modules: the production function staging
// (tools/stage-netlify-functions.mjs) and the local function host Vite loads
// (web/netlifyFunctionsHost.ts). tools/api-smoke/tests/wire-diff.test.mjs checks
// this reading against the module's real `config` export.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// `export const config = { path: '/x' };` or, as Prettier wraps a list,
// `export const config = {\n  path: [\n    '/x',\n    '/y',\n  ],\n};`
const ROUTED_CONFIG = /^export const config = \{\s*path: (\[[^\]]*\]|'[^']*'),?\s*\};$/m;
const PATH_LITERAL = /'(\/[^']*)'/g;

/** `[{ file, path }]` for every path a function in `dir` claims, sorted by path. */
export function netlifyFunctionRoutes(dir) {
  const routes = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.ts'))) {
    const file = join(dir, name);
    const source = readFileSync(file, 'utf8');
    const match = ROUTED_CONFIG.exec(source);
    const config = source.indexOf('export const config');
    if (match) {
      for (const [, path] of match[1].matchAll(PATH_LITERAL)) routes.push({ file, path });
    } else if (config >= 0 && /\bpath\s*:/.test(source.slice(config))) {
      throw new Error(`${name} claims a path in a config shape this reader does not parse`);
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}
