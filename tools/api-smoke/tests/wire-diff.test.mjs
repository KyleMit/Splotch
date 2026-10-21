import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { netlifyFunctionRoutes } from '../../lib/netlify-function-routes.mjs';
import { API_PATHS, applyWireEnv, driveWireCorpus } from '../lib/wire-corpus.mjs';

// The /api endpoints moved from SvelteKit routes to plain Netlify Functions with
// nothing allowed to change on the wire: installed Capacitor builds keep calling
// them. fixtures/wire-baseline.json is what SvelteKit's adapter-netlify function
// answered to the corpus (record-wire-baseline.mjs), and every function must
// answer it identically — status, every header but Date, and body.

// A deployed function reads runtimeMode's `dev` as false (runtimeMode.ts); Vitest
// would read true and open the writable in-memory stores the baseline never had.
vi.mock('../../../web/src/lib/server/runtimeMode.ts', () => ({ dev: false }));

const FUNCTIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'netlify', 'functions');
const baseline = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'wire-baseline.json'), 'utf8')
);

async function loadApiFunctions() {
  const byPath = new Map();
  for (const file of readdirSync(FUNCTIONS_DIR).filter((name) => name.startsWith('api-'))) {
    const module = await import(join(FUNCTIONS_DIR, file));
    expect(byPath.has(module.config.path), `${module.config.path} is claimed twice`).toBe(false);
    byPath.set(module.config.path, module.default);
  }
  return byPath;
}

// Netlify matches a function's config.path with or without a trailing slash.
function routeOf(request) {
  const { pathname } = new URL(request.url);
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

describe('the /api Netlify Functions', () => {
  let functions;
  let answers;
  beforeAll(async () => {
    applyWireEnv(process.env);
    // The corpus's uncaught-failure cases log on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    functions = await loadApiFunctions();
    answers = await driveWireCorpus((request, context) =>
      functions.get(routeOf(request))(request, context)
    );
  }, 60_000);

  it('claim every /api path SvelteKit served, each exactly once', () => {
    expect([...functions.keys()].sort()).toEqual([...API_PATHS].sort());
  });

  it('claim the paths the staging and the local host read from their source', () => {
    const read = netlifyFunctionRoutes(FUNCTIONS_DIR).map(({ path }) => path);
    expect(read).toEqual([...functions.keys()].sort());
  });

  it('answer the recorded corpus exactly as SvelteKit did', () => {
    expect(Object.keys(answers)).toEqual(Object.keys(baseline));
    for (const [name, expected] of Object.entries(baseline)) {
      expect(answers[name], name).toEqual(expected);
    }
  });
});
