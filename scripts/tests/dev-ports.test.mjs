import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The dev ports are declared across a TS config, a TOML file, npm scripts, and
// two Node drivers — surfaces that cannot import from each other — so the
// agreement gets a drift guard instead of the "keep in sync" comments it used to
// rely on. A silent disagreement is nasty in a specific way: dev:kill stops
// killing the listener it names, and the stale server it leaves behind then
// fails `strictPort` on the next `npm run dev`; the live-reload and tunnel
// consumers instead point a device or a relay at a port nothing is serving.
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
const netlifyPort = match(netlifyToml, /^\s*port = (\d+)$/m, 'netlify [dev].port');
const killedPorts = (packageJson.scripts['dev:kill'].match(/\d+/g) ?? []).map(Number);

// Every executable consumer of the vite dev port — anything that would send a
// device, a tunnel, or a process at the wrong place if the port moved. Prose
// (scripts-info, comments) is deliberately not in here: it is covered separately
// below, and only for the ports a description actually names.
const vitePortConsumers = [
  ['netlify [dev].targetPort', () => match(netlifyToml, /^\s*targetPort = (\d+)$/m)],
  [
    'cloud-tunnel.mjs PORT',
    () => match(read('scripts/cloud-tunnel.mjs'), /^const PORT = (\d+);$/m),
  ],
  [
    'android-emulator.mjs --port',
    () => match(read('scripts/android-emulator.mjs'), /'--port',\s*'(\d+)'/),
  ],
  ['ios:live --port', () => Number(packageJson.scripts['ios:live'].match(/--port (\d+)/)[1])],
  [
    'adb:reverse tcp forward',
    () => Number(packageJson.scripts['adb:reverse'].match(/tcp:(\d+)/)[1]),
  ],
];

describe('dev ports agree across their declarations', () => {
  it.each(vitePortConsumers)('%s targets the vite dev server', (_label, extract) => {
    expect(extract()).toBe(vitePort);
  });

  // adb:reverse forwards device→desktop, so both sides of the pair are the same
  // port; a mismatched pair forwards to nothing and reads as a dead dev server.
  it('forwards the same port on both sides of adb:reverse', () => {
    const [device, desktop] = packageJson.scripts['adb:reverse'].match(/tcp:(\d+)/g);
    expect(device).toBe(desktop);
  });

  it('kills every port a dev session listens on', () => {
    expect([...killedPorts].sort()).toEqual([vitePort, netlifyPort].sort());
  });

  it('describes the killed ports accurately in scripts-info', () => {
    const description = packageJson['scripts-info']['dev:kill'];
    for (const port of killedPorts) expect(description).toContain(String(port));
  });
});
