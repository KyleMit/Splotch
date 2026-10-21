// The paths the custom Netlify Functions claim through `config.path`, read from
// their source. Netlify itself reads `config` by static analysis, so it is always
// a literal; reading it the same way serves the places that cannot import the
// TypeScript modules: the production function staging
// (tools/stage-netlify-functions.mjs) and the local function host Vite loads
// (web/netlifyFunctionsHost.ts). tools/api-smoke/tests/wire-diff.test.mjs checks
// this reading against every module's real `config` export.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTED_CONFIG = /^export const config = \{ path: '(\/[^']*)' \};$/m;

/** `[{ file, path }]` for every function in `dir` that claims a URL path, sorted by path. */
export function netlifyFunctionRoutes(dir) {
  const routes = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.ts'))) {
    const file = join(dir, name);
    const source = readFileSync(file, 'utf8');
    const match = ROUTED_CONFIG.exec(source);
    const config = source.indexOf('export const config');
    if (match) {
      routes.push({ file, path: match[1] });
    } else if (config >= 0 && /\bpath\s*:/.test(source.slice(config))) {
      throw new Error(`${name} claims a path in a config shape this reader does not parse`);
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}
