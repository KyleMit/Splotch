// Runs the web app's toolchain (vite, svelte-kit, vitest, playwright) from web/, where the
// app source lives. package.json + node_modules stay at the repo root, so a single install
// serves both the web app and the Capacitor wrapper; Node resolves node_modules upward from
// web/. The app moved under web/ so `netlify dev --cwd web` watches only that subtree, keeping
// the large android/ios native trees out of netlify-cli's per-directory file watcher.
//
// `node scripts/web.mjs vite dev`      -> the dev server (syncs .svelte-kit first only if missing)
// `node scripts/web.mjs <bin> [args]`  -> any web bin (vite, svelte-check, vitest, playwright)
//
// Bins are resolved by prepending the root node_modules/.bin to the child's PATH — the .bin
// shims aren't on PATH when netlify-cli invokes this script directly (rather than via npm), so we
// add them here. This is what npm itself does for a script's bins; going through `npx` instead
// costs ~250ms of package-resolution overhead per invocation, on every dev boot / check / test.
import { join, delimiter } from 'node:path';
import { existsSync } from 'node:fs';
import { run, ROOT } from './lib/proc.mjs';

const web = join(ROOT, 'web');
process.env.PATH = `${join(ROOT, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`;

const [cmd, ...args] = process.argv.slice(2);

if (!cmd) {
  console.error('usage: node scripts/web.mjs <bin> [args...]');
  process.exit(1);
}

// Commands that need .svelte-kit/tsconfig.json (generated types + path aliases) to already exist:
//
// `vite dev` regenerates it itself on startup via the SvelteKit vite plugin, so pre-syncing on
// every boot is redundant — it just doubles the work and adds ~1.5s to a warm `npm run dev`. It is
// synced anyway when absent (a fresh clone) so types resolve for the editor even before the first
// dev server finishes booting.
//
// `playwright` needs it up front: specs import app modules through the `$lib` alias, which
// Playwright maps by reading web/tsconfig.json (it extends the generated one). That resolution
// happens as specs are collected — before, and independently of, the webServer's `vite build`, so
// letting the build generate the file is too late and collection dies with "Cannot find package
// '$lib'". A job that runs Playwright without a preceding vitest run (which syncs via the
// SvelteKit plugin) has nothing else to generate it — the CI WebKit smoke job is exactly that.
const needsGeneratedTsconfig = (cmd === 'vite' && args[0] === 'dev') || cmd === 'playwright';
if (needsGeneratedTsconfig && !existsSync(join(web, '.svelte-kit', 'tsconfig.json'))) {
  run('svelte-kit', ['sync'], { cwd: web });
}

run(cmd, args, { cwd: web });
