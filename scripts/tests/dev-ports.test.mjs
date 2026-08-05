import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The dev ports are declared in three places that cannot import from each other
// — a TS config, a TOML file, and an npm script — so the agreement gets a drift
// guard instead of the "keep in sync" comments it used to rely on. A silent
// disagreement is nasty in a specific way: dev:kill stops killing the listener
// it names, and the stale server it leaves behind then fails `strictPort` on the
// next `npm run dev`.
const repoRoot = join(import.meta.dirname, '..', '..');
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8');

const viteConfig = read('web/vite.config.ts');
const netlifyToml = read('web/netlify.toml');
const packageJson = JSON.parse(read('package.json'));

const match = (source, pattern, label) => {
  const found = source.match(pattern);
  expect(found, label).not.toBeNull();
  return Number(found[1]);
};

const vitePort = match(viteConfig, /^\s*port: (\d+),$/m, 'vite server.port');
const targetPort = match(netlifyToml, /^\s*targetPort = (\d+)$/m, 'netlify [dev].targetPort');
const netlifyPort = match(netlifyToml, /^\s*port = (\d+)$/m, 'netlify [dev].port');
const killedPorts = (packageJson.scripts['dev:kill'].match(/\d+/g) ?? []).map(Number);

describe('dev ports agree across their declarations', () => {
  it('points netlify dev at the vite dev server', () => {
    expect(targetPort).toBe(vitePort);
  });

  it('kills every port a dev session listens on', () => {
    expect([...killedPorts].sort()).toEqual([vitePort, netlifyPort].sort());
  });

  it('describes the killed ports accurately in scripts-info', () => {
    const description = packageJson['scripts-info']['dev:kill'];
    for (const port of killedPorts) expect(description).toContain(String(port));
  });
});
