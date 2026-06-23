// Production-deploy staging for the web/ layout (ADR-0024). The Netlify site builds from the
// repo ROOT (that is where package.json + the lockfile live, so `npm ci` works), but the
// SvelteKit build runs with cwd=web/, so adapter-netlify writes its output under web/.
//
// The static assets are published straight from web/build (root netlify.toml `publish`), so they
// need no copy. The ONE thing Netlify can't be pointed at is the adapter's internal SSR function:
// it is always loaded from `<base>/.netlify/functions-internal`, i.e. the repo root. adapter-netlify
// wrote it to web/.netlify, so copy that single tree up to the root. The build/_redirects catch-all
// (`/* -> /.netlify/functions/sveltekit-render`) then resolves to it at runtime.
//
// This is the irreducible cost of keeping one package.json at the root (Capacitor needs it there)
// while the app lives in web/. The alternative — Netlify base = web — would make `npm ci` run in
// web/, which has no package.json. See ADR-0024.
//
// Runs as the tail of the Netlify build command (root netlify.toml). On Netlify CI the root
// .netlify does not pre-exist; locally it may, so it is replaced.
import { cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/utils.mjs';

const from = join(ROOT, 'web', '.netlify');
const to = join(ROOT, '.netlify');
if (!existsSync(from)) {
  console.error(`[stage-netlify] ${from} not found — did the SvelteKit build run?`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`[stage-netlify] ${from} -> ${to}`);
