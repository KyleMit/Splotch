// Runs the web app's toolchain (vite, svelte-kit, vitest, playwright) from web/, where the
// app source lives. package.json + node_modules stay at the repo root, so a single install
// serves both the web app and the Capacitor wrapper; Node resolves node_modules upward from
// web/. The app moved under web/ so `netlify dev --cwd web` watches only that subtree, keeping
// the large android/ios native trees out of netlify-cli's per-directory file watcher.
//
// `node scripts/web.mjs dev`           -> svelte-kit sync + vite dev (the dev server)
// `node scripts/web.mjs <bin> [args]`  -> any web bin (vite, svelte-check, vitest, playwright)
//
// npx resolves each bin from the root node_modules whether or not .bin is on PATH (it is not
// when netlify-cli runs this command directly rather than via npm).
import { join } from 'node:path';
import { run, ROOT } from './lib/utils.mjs';

const web = join(ROOT, 'web');
const [cmd, ...args] = process.argv.slice(2);

if (!cmd) {
  console.error('usage: node scripts/web.mjs <dev|bin> [args...]');
  process.exit(1);
}

if (cmd === 'dev') {
  run('npx', ['svelte-kit', 'sync'], { cwd: web });
  run('npx', ['vite', 'dev', ...args], { cwd: web });
} else {
  run('npx', [cmd, ...args], { cwd: web });
}
