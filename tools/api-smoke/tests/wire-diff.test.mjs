import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { netlifyFunctionRoutes } from '../../lib/netlify-function-routes.mjs';
import { API_PATHS, applyWireEnv, driveWireCorpus } from '../lib/wire-corpus.mjs';

// The /api endpoints moved from SvelteKit routes to a plain Netlify Function with
// nothing allowed to change on the wire: installed Capacitor builds keep calling
// them. fixtures/wire-baseline.json is what SvelteKit's adapter-netlify function
// answered to the corpus (record-wire-baseline.mjs), and the function must answer
// it identically — status, every header but Date, and body.

// A deployed function reads runtimeMode's `dev` as false (runtimeMode.ts); Vitest
// would read true and open the writable in-memory stores the baseline never had.
vi.mock('../../../web/src/lib/server/runtimeMode.ts', () => ({ dev: false }));

const FUNCTIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'netlify', 'functions');
const baseline = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'wire-baseline.json'), 'utf8')
);
const routes = netlifyFunctionRoutes(FUNCTIONS_DIR);

// Netlify matches a function's config.path with or without a trailing slash.
function routeOf(request) {
  const { pathname } = new URL(request.url);
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

describe('the /api Netlify Function', () => {
  let modules;
  let answers;
  beforeAll(async () => {
    applyWireEnv(process.env);
    // The corpus's uncaught-failure cases log on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = [...new Set(routes.map(({ file }) => file))];
    modules = new Map(await Promise.all(files.map(async (file) => [file, await import(file)])));
    const handlerFor = new Map(routes.map(({ file, path }) => [path, modules.get(file).default]));
    answers = await driveWireCorpus((request, context) =>
      handlerFor.get(routeOf(request))(request, context)
    );
  }, 60_000);

  it('claims every /api path SvelteKit served, each exactly once', () => {
    expect(routes.map(({ path }) => path)).toEqual([...API_PATHS].sort());
  });

  it('claims them from one function, whose one instance holds the shared rate-limit buckets', () => {
    // On Netlify a separate function would be a separate instance with its own
    // buckets, and the corpus — driven in one module graph here — could not see it.
    expect(new Set(routes.map(({ file }) => file)).size).toBe(1);
  });

  it('declares exactly the paths the staging and the local host read from its source', () => {
    for (const module of modules.values()) {
      expect([...module.config.path].sort()).toEqual(routes.map(({ path }) => path));
    }
  });

  it('answers the recorded corpus exactly as SvelteKit did', () => {
    expect(Object.keys(answers)).toEqual(Object.keys(baseline));
    for (const [name, expected] of Object.entries(baseline)) {
      expect(answers[name], name).toEqual(expected);
    }
  });
});
