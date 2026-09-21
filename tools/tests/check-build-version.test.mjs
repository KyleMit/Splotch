import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildVersionProblems } from '../check-build-version.mjs';

const fixtures = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root, path, contents) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

function writeBundle(root, bundle, version) {
  write(root, `${bundle}/version.json`, JSON.stringify({ version }));
  write(root, `${bundle}/coloring/manifest-${version}.json`, '{}');
  write(root, `${bundle}/chunks/manager.js`, `const APP_VERSION="${version}";`);
}

function buildOutput({ client = '1.6.896', server = client, serviceWorker = client } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-build-version-'));
  fixtures.push(root);
  writeBundle(root, 'client', client);
  writeBundle(root, 'server', server);
  if (serviceWorker) {
    write(
      root,
      'client/sw.js',
      `precacheAndRoute([{url:"index.css",revision:"a"},{url:"coloring/manifest-${serviceWorker}.json",revision:"b"}]);`
    );
  }
  return root;
}

describe('buildVersionProblems', () => {
  it('accepts a build whose every version surface agrees', () => {
    expect(buildVersionProblems(buildOutput())).toEqual([]);
  });

  it('accepts a native build, which ships no service worker', () => {
    expect(buildVersionProblems(buildOutput({ serviceWorker: null }))).toEqual([]);
  });

  it('reports an SSR bundle derived from a different commit than the client', () => {
    const problems = buildVersionProblems(buildOutput({ server: '1.6.895' }));

    expect(problems).toEqual([
      'Server version.json carries 1.6.895, not 1.6.896',
      'Server coloring manifests are [coloring/manifest-1.6.895.json], expected only coloring/manifest-1.6.896.json',
      'Server JavaScript never inlines __APP_VERSION__ 1.6.896',
    ]);
  });

  it('reports a service worker precaching another version’s coloring manifest', () => {
    expect(buildVersionProblems(buildOutput({ serviceWorker: '1.6.895' }))).toEqual([
      'sw.js precaches coloring manifests [coloring/manifest-1.6.895.json], expected only coloring/manifest-1.6.896.json',
    ]);
  });

  it('reports client chunks whose inlined version differs from version.json', () => {
    const root = buildOutput();
    write(root, 'client/chunks/manager.js', 'const APP_VERSION="1.6.897";');
    write(root, 'client/coloring/manifest-1.6.897.json', '{}');

    expect(buildVersionProblems(root)).toEqual([
      'Client coloring manifests are [coloring/manifest-1.6.896.json, coloring/manifest-1.6.897.json], expected only coloring/manifest-1.6.896.json',
      'Client JavaScript never inlines __APP_VERSION__ 1.6.896',
    ]);
  });

  it('reports a build with no client version.json', () => {
    const root = buildOutput();
    rmSync(join(root, 'client/version.json'));

    expect(buildVersionProblems(root)).toEqual(['Client version.json does not exist']);
  });
});
