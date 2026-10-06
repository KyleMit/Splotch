import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupFixtures,
  fixture,
  cliFixture,
  put,
  setSetting,
} from './fixtures/netlify-install.mjs';

afterEach(cleanupFixtures);

function ownedCacheCli(context, cache = join(context.root, 'cache')) {
  const cli = cliFixture(context);
  const copied = join(context.root, 'tools/lib/netlify-cache-config.mjs');
  const source = readFileSync(copied, 'utf8');
  const declaration = "const NETLIFY_CACHE_ROOT = '/opt/build/cache';";
  expect(source.split(declaration)).toHaveLength(2);
  writeFileSync(copied, source.replace(declaration, `const NETLIFY_CACHE_ROOT = '${cache}';`));
  if (cache !== context.root) mkdirSync(cache);
  return { cli, cache };
}

describe('Qualified Netlify cache configuration', () => {
  it.each([
    ['plain', 'storeDir: /opt/build/cache/qualified-store', '/opt/build/cache/qualified-store'],
    [
      'single-quoted',
      "storeDir: '/opt/build/cache/qualified-store'\n",
      '/opt/build/cache/qualified-store',
    ],
    [
      'double-quoted',
      'storeDir: "/opt/build/cache/qualified-store"\r\n',
      '/opt/build/cache/qualified-store',
    ],
    [
      'plain',
      'storeDir:\t/opt/build/cache/qualified-store/ \n',
      '/opt/build/cache/qualified-store/',
    ],
  ])(
    'qualifies a complete %s literal and preserves its exact named getter',
    (form, text, value) => {
      const context = fixture();
      context.env.NETLIFY = 'true';
      put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', text);
      setSetting(context, 'store-dir', value);
      context.run();
      const row = context.records.find(
        (event) => event.stage === 'second-production-install-qualified'
      );
      expect(row.ambient).toMatchObject({ kind: 'sole-netlify-cache-setting', scalarForm: form });
      expect(row.ambient.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(context.calls().at(-2)).toEqual(['config', 'get', '--json', 'store-dir']);
      expect(context.calls().at(-1)).toEqual(['ci', '--prod']);
      expect(JSON.stringify(context.records)).not.toContain(value);
    }
  );

  it.each([
    'storeDir: /opt/build/cache/store\n\n',
    'storeDir: /opt/build/cache/store\nstoreDir: /opt/build/cache/store\n',
    'storeDir: /opt/build/cache/store\nconfigDependencies: {}\n',
    'storeDir: /opt/build/cache/store # ignored\n',
    'storeDir: !tag /opt/build/cache/store\n',
    'storeDir: "${CACHE}/store"\n',
    'storeDir: "/opt/build/cache/sto\\u0072e"\n',
    'storeDir: /opt/build/cache/../store\n',
    'storeDir: /opt/build/cache/store//\n',
    'storeDir: /opt/build/cache//store\n',
    'storeDir: /opt/build/cache/\n',
    'storeDir: /outside/store\n',
    '\uFEFFstoreDir: /opt/build/cache/store\n',
    'storeDir: |\n  /opt/build/cache/store\n',
  ])('rejects unsupported complete global document before children: %s', (text) => {
    const context = fixture();
    context.env.NETLIFY = 'true';
    put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', text);
    put(context.root, 'node_modules/sentinel', 'untouched');
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.calls()).toEqual([]);
    expect(readFileSync(join(context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
    expect(JSON.stringify(context.records)).not.toContain('/opt/build/cache/');
  });

  it.each(['/different/store-secret', '/opt/build/cache/store/v11', false, null, 17])(
    'refuses getter type/value mismatch privately before ci: %s',
    (value) => {
      const context = fixture();
      context.env.NETLIFY = 'true';
      put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', 'storeDir: /opt/build/cache/store\n');
      setSetting(context, 'store-dir', value);
      expect(context.run).toThrow(
        'Effective pnpm store differs from the qualified ambient setting'
      );
      expect(context.calls().some((args) => args[0] === 'ci')).toBe(false);
      expect(JSON.stringify(context.records)).not.toContain('store-secret');
    }
  );

  it('refuses an absent getter for a qualified global file', () => {
    const context = fixture();
    context.env.NETLIFY = 'true';
    put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', 'storeDir: /opt/build/cache/store\n');
    expect(context.run).toThrow('Effective pnpm store differs from the qualified ambient setting');
    expect(context.calls().some((args) => args[0] === 'ci')).toBe(false);
  });

  it('refuses explicit store selection when the global file is absent', () => {
    const context = fixture();
    setSetting(context, 'store-dir', '/unreviewed/store-secret');
    expect(context.run).toThrow('Effective pnpm store differs from the qualified ambient setting');
    expect(context.calls().some((args) => args[0] === 'ci')).toBe(false);
    expect(JSON.stringify(context.records)).not.toContain('store-secret');
  });

  it.each(['--version', 'store-dir', '--prod'])(
    'detects global file mutation by actual %s child',
    (stage) => {
      const context = fixture();
      context.env.NETLIFY = 'true';
      put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', 'storeDir: /opt/build/cache/store\n');
      setSetting(context, 'store-dir', '/opt/build/cache/store');
      context.env.FIXTURE_AMBIENT_CHANGE_STAGE = stage;
      context.env.FIXTURE_AMBIENT_TEXT = 'configDependencies: {}\n';
      expect(context.run).toThrow('Ambient pnpm configuration or cache proof changed');
      const lastCall =
        stage === '--version'
          ? ['--version']
          : stage === 'store-dir'
            ? ['config', 'get', '--json', 'store-dir']
            : ['ci', '--prod'];
      expect(context.calls().at(-1)).toEqual(lastCall);
      expect(context.calls().some((args) => args[0] === 'ci')).toBe(stage === '--prod');
      expect(context.records.at(-1)?.stage).toBe(
        stage === '--prod' ? 'second-production-install-exit' : undefined
      );
      expect(
        context.records.some((event) => event.stage === 'second-production-install-accepted')
      ).toBe(false);
    }
  );

  it('detects an appearing global file immediately after the first child', () => {
    const context = fixture();
    context.env.FIXTURE_AMBIENT_CHANGE_STAGE = '--version';
    context.env.FIXTURE_AMBIENT_TEXT = 'configDependencies: {}\n';
    expect(context.run).toThrow('Ambient pnpm configuration or cache proof changed');
    expect(context.calls()).toEqual([['--version']]);
  });

  it.each([
    ['regular', 'store', true],
    ['linked', 'store', false],
    ['file', 'store', false],
    ['versioned', 'store/v11', true],
    ['versioned-trailing', 'store/v11/', false],
  ])(
    'checks actual %s store ancestors in an owned synthetic namespace',
    (kind, suffix, accepted) => {
      const context = fixture();
      const { cli, cache } = ownedCacheCli(context);
      put(context.root, 'node_modules/sentinel', 'untouched');
      if (kind === 'regular') mkdirSync(join(cache, 'store'));
      if (kind === 'linked') symlinkSync(join(context.root, 'node_modules'), join(cache, 'store'));
      if (kind === 'file') put(cache, 'store', 'regular-file');
      if (kind.startsWith('versioned')) put(cache, 'store/v11/v11', 'unrelated-file');
      context.env.NETLIFY = 'true';
      put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${cache}/${suffix}\n`);
      setSetting(context, 'store-dir', `${cache}/${suffix}`);
      const child = cli();
      expect(child.status === 0).toBe(accepted);
      expect(context.calls().some((args) => args[0] === 'ci')).toBe(accepted);
      expect(child.stderr.includes('Netlify cache store filesystem qualification failed')).toBe(
        !accepted
      );
      expect(readFileSync(join(context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
      expect(child.stdout + child.stderr).not.toContain(`${cache}/store`);
    }
  );

  it.each(['--version', '--prod'])(
    'refuses a real cache ancestor link introduced by the %s child',
    (stage) => {
      const context = fixture();
      const { cli, cache } = ownedCacheCli(context);
      put(context.root, 'node_modules/sentinel', 'untouched');
      context.env.NETLIFY = 'true';
      put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${cache}/store\n`);
      setSetting(context, 'store-dir', `${cache}/store`);
      context.env.FIXTURE_CACHE_LINK_STAGE = stage;
      context.env.FIXTURE_CACHE_STORE = `${cache}/store`;
      const child = cli();
      expect(child.status).not.toBe(0);
      expect(child.stderr).toContain('Ambient pnpm configuration or cache proof changed');
      expect(context.calls().at(-1)).toEqual(
        stage === '--version' ? ['--version'] : ['ci', '--prod']
      );
      expect(child.stdout.includes('second-production-install-exit')).toBe(stage === '--prod');
      expect(child.stdout).not.toContain('second-production-install-accepted');
      expect(child.stdout + child.stderr).not.toContain(`${cache}/store`);
      expect(readFileSync(join(context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
    }
  );

  it('refuses a literal store inside the actual cleaning root before any child', () => {
    const context = fixture();
    const { cli } = ownedCacheCli(context, context.root);
    put(context.root, 'node_modules/sentinel', 'untouched');
    context.env.NETLIFY = 'true';
    const store = join(context.root, 'node_modules');
    put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${store}\n`);
    setSetting(context, 'store-dir', store);
    const child = cli();
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain('Netlify cache store overlaps clean-install roots');
    expect(context.calls()).toEqual([]);
    expect(readFileSync(join(context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
    expect(child.stdout + child.stderr).not.toContain(store);
  });

  it('refuses an oversized global document without reading its value into diagnostics', () => {
    const context = fixture();
    context.env.NETLIFY = 'true';
    put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', 'private-size-marker'.repeat(512));
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.calls()).toEqual([]);
    expect(JSON.stringify(context.records)).not.toContain('private-size-marker');
  });
});
