// Production-deploy staging for the web/ layout (ADR-0024). The Netlify site builds from the
// repo ROOT (that is where package.json + the lockfile live, so the install works), but the
// SvelteKit build runs with cwd=web/, so adapter-netlify writes its output under web/.
//
// The static assets are published straight from web/build (root netlify.toml `publish`), so they
// need no copy. The ONE thing Netlify can't be pointed at is the adapter's internal SSR function:
// it is always loaded from `<base>/.netlify/functions-internal`, i.e. the repo root. adapter-netlify
// wrote it to web/.netlify, so copy that single tree up to the root. The function's own catch-all
// route (adapter-netlify v6 V2 function: `export const config = { path: ["/*"] }`) then resolves
// every dynamic request to it at runtime, except the paths the functions in netlify/functions claim
// (see the end of this file).
//
// This is the irreducible cost of keeping one package.json at the root (Capacitor needs it there)
// while the app lives in web/. The alternative — Netlify base = web — would run the install in
// web/, which has no package.json. See ADR-0024.
//
// Runs as the tail of the Netlify build command (root netlify.toml). On Netlify CI the root
// .netlify does not pre-exist; locally it may, so it is replaced.
import { cpSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { netlifyFunctionRoutes } from './lib/netlify-function-routes.mjs';
import { ROOT } from './lib/proc.mjs';
import { excludeFunctionRoutes } from './lib/sveltekit-function-config.mjs';

const from = join(ROOT, 'web', '.netlify');
const to = join(ROOT, '.netlify');
if (!existsSync(from)) {
  console.error(`[stage-netlify-functions] ${from} not found — did the SvelteKit build run?`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`[stage-netlify-functions] ${from} -> ${to}`);

// Every /api endpoint is served by netlify/functions/api.ts at a path in its config.path, and
// SvelteKit's catch-all `/*` matches the same paths. Netlify's docs order neither of two matching
// functions ahead of the other, so the SvelteKit function is told to leave those paths alone:
// whatever the platform's precedence, exactly one function answers each.
const internal = join(to, 'functions-internal');
const paths = netlifyFunctionRoutes(join(ROOT, 'netlify', 'functions')).map(({ path }) => path);
for (const name of readdirSync(internal).filter((file) => file.endsWith('.mjs'))) {
  const file = join(internal, name);
  writeFileSync(file, excludeFunctionRoutes(readFileSync(file, 'utf8'), paths));
  console.log(`[stage-netlify-functions] ${name} leaves ${paths.length} function paths alone`);
}
