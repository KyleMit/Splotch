import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { transformSync } from '@babel/core';
import { build } from 'vite';
import { afterEach, expect, it, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import origin from '../../mobile/api-origin.cjs';

const require = createRequire(import.meta.url);
const createBabelConfig = require(join(ROOT, 'babel.config.cjs'));
const BUNDLE_TIMEOUT_MS = 30_000;
const fixtures = [];
afterEach(() => {
  vi.unstubAllEnvs();
  fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

async function nativeOriginBundle(value) {
  vi.stubEnv('EXPO_PUBLIC_SPLOTCH_API_ORIGIN', value);
  const fixture = mkdtempSync(join(tmpdir(), 'native-origin-bundle-'));
  fixtures.push(fixture);
  const entry = join(fixture, 'entry.ts');
  writeFileSync(
    entry,
    [
      `export { AI_ORIGIN } from ${JSON.stringify(join(ROOT, 'src/ai/contract.ts'))};`,
      `export { nativeInviteAccessCode } from ${JSON.stringify(join(ROOT, 'src/ai/inviteLink.ts'))};`,
      `export { FEEDBACK_URL } from ${JSON.stringify(join(ROOT, 'src/feedback/feedbackTransport.ts'))};`,
      `export { approvedAssetUrl } from ${JSON.stringify(join(ROOT, 'src/offlineLibrary/manifest.ts'))};`,
    ].join('\n')
  );
  const result = await build({
    configFile: false,
    envDir: false,
    root: ROOT,
    logLevel: 'silent',
    plugins: [
      {
        name: 'native-origin-contract',
        enforce: 'pre',
        transform(source, id) {
          if (id !== join(ROOT, 'src/apiOrigin.ts')) return;
          return transformSync(source, {
            filename: id,
            configFile: false,
            babelrc: false,
            presets: [require.resolve('babel-preset-expo')],
            caller: { name: 'metro', bundler: 'metro', platform: 'android', isDev: false },
          }).code;
        },
      },
    ],
    build: { ssr: entry, write: false, minify: true },
  });
  return result.output
    .filter((chunk) => chunk.type === 'chunk')
    .map((chunk) => chunk.code)
    .join('\n');
}

function assertStoreOrigin(bundle) {
  const origins = [...new Set(bundle.match(/https:\/\/(?:[a-z0-9-]+\.)*splotch\.art/g))];
  assert.deepEqual(origins, ['https://splotch.art']);
  assert.doesNotMatch(bundle, /EXPO_PUBLIC_SPLOTCH_API_ORIGIN|process\.env/);
}

it(
  'bundles the actual native origin owners with only production in store configuration',
  async () => {
    const bundle = await nativeOriginBundle(undefined);
    expect(origin.readApiOrigin({}, true)).toBe('https://splotch.art');
    expect(() => assertStoreOrigin(bundle)).not.toThrow();
    expect(bundle).toContain('api/report');
    expect(bundle).toContain('coloring');
  },
  BUNDLE_TIMEOUT_MS
);

it(
  'inlines the test origin for a test release and fails the store guard on that real bundle',
  async () => {
    const bundle = await nativeOriginBundle('https://test.splotch.art');
    expect(bundle).toContain('https://test.splotch.art');
    expect(bundle).not.toMatch(/EXPO_PUBLIC_SPLOTCH_API_ORIGIN|process\.env/);
    expect(() => assertStoreOrigin(bundle)).toThrow();
    expect(() =>
      origin.readApiOrigin({ EXPO_PUBLIC_SPLOTCH_API_ORIGIN: 'https://test.splotch.art' }, true)
    ).toThrow('Store builds');
  },
  BUNDLE_TIMEOUT_MS
);

it.each([
  'http://test.splotch.art',
  'file:///tmp/x',
  'https://user:secret@test.splotch.art',
  'https://test.splotch.art/path',
  'https://test.splotch.art?redirect=evil',
])('rejects non-origin build input %s', (value) => {
  expect(() => origin.readApiOrigin({ EXPO_PUBLIC_SPLOTCH_API_ORIGIN: value })).toThrow(
    'HTTPS origin'
  );
});

it('keeps web API calls relative and routes every native network owner through the one setting', () => {
  const web = readFileSync(join(ROOT, 'src/apiOrigin.web.ts'), 'utf8');
  expect(web).not.toContain('EXPO_PUBLIC');
  expect(web).toContain('https://splotch.art');
  for (const path of [
    'src/ai/contract.ts',
    'src/feedback/feedbackTransport.ts',
    'src/offlineLibrary/manifest.ts',
  ]) {
    const source = readFileSync(join(ROOT, path), 'utf8');
    expect(source).toContain('../apiOrigin');
    expect(source).not.toContain('https://splotch.art');
  }
  expect(readFileSync(join(ROOT, 'src/platform/ai.web.ts'), 'utf8')).toContain('aiPath(');
});

it('rejects insecure origins through the real native Babel build configuration', () => {
  vi.stubEnv('EXPO_PUBLIC_SPLOTCH_API_ORIGIN', 'http://test.splotch.art');
  const api = (platform) => ({
    caller: (read) => read({ platform, isDev: false }),
    cache: { using: (read) => read() },
  });
  expect(() => createBabelConfig(api('android'))).toThrow('HTTPS origin');
  expect(() => createBabelConfig(api('ios'))).toThrow('HTTPS origin');
  expect(() => createBabelConfig(api('web'))).not.toThrow();
});
