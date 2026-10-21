import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { netlifyFunctionRoutes } from '../lib/netlify-function-routes.mjs';
import { excludeFunctionRoutes } from '../lib/sveltekit-function-config.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

// The config adapter-netlify writes, verbatim from its generate_config_export.
const ADAPTER_CONFIG = `export default init({});

export const config = {
\tpath: ["/*"],
\texcludedPath: ["/.netlify/*"],
\tpreferStatic: true
};
`;

describe('staging the SvelteKit function beside the /api functions', () => {
  it('leaves every function path out of the SvelteKit catch-all', () => {
    const staged = excludeFunctionRoutes(ADAPTER_CONFIG, ['/api/report', '/api/verify-key']);
    expect(staged).toContain(
      '\texcludedPath: ["/.netlify/*", "/api/report", "/api/verify-key"],\n\tpreferStatic: true'
    );
    expect(staged.replace(/excludedPath: .*/, '')).toBe(
      ADAPTER_CONFIG.replace(/excludedPath: .*/, '')
    );
  });

  it('refuses a SvelteKit function whose excludedPath list it cannot find', () => {
    expect(() =>
      excludeFunctionRoutes('export const config = { path: ["/*"] };', ['/api/report'])
    ).toThrow(/excludedPath/);
  });

  it('reads the installed adapter-netlify config shape', () => {
    const adapter = readFileSync(
      join(ROOT, 'node_modules', '@sveltejs', 'adapter-netlify', 'index.js'),
      'utf8'
    );
    expect(adapter).toContain(
      "\texcludedPath: [${['/.netlify/*', ...exclude].map((s) => JSON.stringify(s)).join(', ')}],"
    );
  });

  it('finds every /api function, and only those claim a path', () => {
    const routes = netlifyFunctionRoutes(join(ROOT, 'netlify', 'functions'));
    expect(routes.length).toBeGreaterThan(0);
    for (const { path } of routes) expect(path).toMatch(/^\/api\//);
  });
});
