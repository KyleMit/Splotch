// Production-deploy staging for the web/ layout (ADR-0024). The Netlify site builds from the
// repo ROOT (that is where package.json + the lockfile live, so `npm ci` works), but the
// SvelteKit build runs with cwd=web/, so adapter-netlify writes its output under web/ —
// web/build (static) and web/.netlify (SSR function, server bundle, v1 config).
//
// Netlify, building from the root, looks for those at the root (build/ via `publish`, and the
// internal function at .netlify/functions-internal). So replicate the standard "app at root"
// layout by copying the adapter's web/ outputs up to the root. This mirrors exactly what
// Netlify expects from a root SvelteKit project, which is the most robust way to deploy without
// moving package.json out of the root.
//
// Runs as the tail of the Netlify build command (see the root netlify.toml). On Netlify CI the
// root targets do not pre-exist; locally they may, so each is replaced.
import { cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/utils.mjs';

for (const dir of ['build', '.netlify']) {
  const from = join(ROOT, 'web', dir);
  const to = join(ROOT, dir);
  if (!existsSync(from)) {
    console.error(`[stage-netlify] ${from} not found — did the SvelteKit build run?`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`[stage-netlify] ${from} -> ${to}`);
}
