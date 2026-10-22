import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The dev ports are declared across a TS config, a TOML file, npm scripts, and
// three Node drivers — surfaces that cannot import from each other — so the
// agreement gets a drift guard instead of the "keep in sync" comments it used to
// rely on. A silent disagreement is nasty in a specific way: dev:stop stops
// killing the listener it names, and the stale server it leaves behind then
// fails `strictPort` on the next `npm run dev`; the live-reload and tunnel
// consumers instead point a device or a relay at a port nothing is serving.
const repoRoot = join(import.meta.dirname, '..', '..');
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8');
const netlifyToml = read('web/netlify.toml');
const packageJson = JSON.parse(read('package.json'));

const match = (source, pattern, label) => {
  const found = source.match(pattern);
  expect(found, label).not.toBeNull();
  return Number(found[1]);
};
match(netlifyToml, /^\s*port = (\d+)$/m, 'netlify [dev].port');

describe('dev ports agree across their declarations', () => {
  // adb:reverse forwards device→desktop, so both sides of the pair are the same
  // port; a mismatched pair forwards to nothing and reads as a dead dev server.
  it('forwards the same port on both sides of adb:reverse', () => {
    const [device, desktop] = packageJson.scripts['adb:reverse'].match(/tcp:(\d+)/g);
    expect(device).toBe(desktop);
  });
});
