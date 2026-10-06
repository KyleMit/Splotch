import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupFixtures,
  cliFixture,
  fixture,
  put,
  setSetting,
} from './fixtures/netlify-install.mjs';

afterEach(cleanupFixtures);

const HOME_DECLARATION = "const NETLIFY_HOME_ROOT = '/opt/buildhome';";
const QUERY_STAGES = [
  ['--version', ['--version'], false],
  ['store-dir', ['config', 'get', '--json', 'store-dir'], false],
  ['--prod', ['ci', '--prod'], true],
];

function replaceOwned(path, from, to) {
  const source = readFileSync(path, 'utf8');
  expect(source.split(from)).toHaveLength(2);
  writeFileSync(path, source.replace(from, to));
}

function homeFixture() {
  const context = fixture();
  const cli = cliFixture(context);
  const home = join(context.root, 'home');
  const store = join(home, '.pnpm-store');
  const version = join(store, 'v11');
  const helper = join(context.root, 'tools/lib/netlify-cache-config.mjs');
  mkdirSync(home);
  replaceOwned(helper, HOME_DECLARATION, `const NETLIFY_HOME_ROOT = ${JSON.stringify(home)};`);
  context.env.HOME = home;
  context.env.NETLIFY = 'true';
  put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${store}\n`);
  put(context.root, 'node_modules/sentinel', 'untouched');
  setSetting(context, 'store-dir', store);
  return { context, cli, home, store, version, helper };
}

function events(child) {
  return child.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function expectBeforeChild(value, message) {
  const child = value.cli();
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stderr).toContain(message);
  expect(value.context.calls()).toEqual([]);
  expect(readFileSync(join(value.context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
  expect(child.stdout + child.stderr).not.toContain(value.home);
  return child;
}

function changeByChild(value, stage, body) {
  const marker = 'const args = process.argv.slice(2);';
  replaceOwned(
    join(value.context.root, 'bin/pnpm'),
    marker,
    `${marker}\nif (args.at(-1) === ${JSON.stringify(stage)}) { ${body} }`
  );
}

function expectProofRefusal(value, lastCall, installRan) {
  const child = value.cli();
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stderr).toContain('Ambient pnpm configuration or cache proof changed');
  expect(value.context.calls().at(-1)).toEqual(lastCall);
  expect(value.context.calls().some((args) => args[0] === 'ci')).toBe(installRan);
  const rows = events(child);
  expect(rows.some((event) => event.stage === 'second-production-install-exit')).toBe(installRan);
  expect(rows.some((event) => event.stage === 'second-production-install-accepted')).toBe(false);
  expect(child.stdout + child.stderr).not.toContain(value.home);
  expect(readFileSync(join(value.context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
  return rows;
}

describe('Exact Netlify image home store', () => {
  it.each([
    ['plain', (store) => `storeDir: ${store}\n`],
    ['single-quoted', (store) => `storeDir: '${store}'\n`],
    ['double-quoted', (store) => `storeDir: "${store}"\r\n`],
  ])('qualifies the complete %s literal and emits both home-family labels', (form, document) => {
    const value = homeFixture();
    put(value.context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', document(value.store));
    const child = value.cli();
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const qualified = events(child).find(
      (event) => event.stage === 'second-production-install-qualified'
    );
    expect(qualified.ambient).toMatchObject({
      kind: 'sole-netlify-home-store-setting',
      scalarForm: form,
    });
    expect(qualified.settings.find((row) => row.key === 'store-dir')).toEqual({
      key: 'store-dir',
      disposition: 'qualified-netlify-home-store-literal',
    });
    expect(value.context.calls().at(-2)).toEqual(['config', 'get', '--json', 'store-dir']);
    expect(value.context.calls().at(-1)).toEqual(['ci', '--prod']);
    expect(child.stdout + child.stderr).not.toContain(value.home);
  });

  it('reads the actual host-platform default config path without XDG selection', () => {
    const value = homeFixture();
    delete value.context.env.XDG_CONFIG_HOME;
    const path =
      process.platform === 'darwin'
        ? 'Library/Preferences/pnpm/config.yaml'
        : '.config/pnpm/config.yaml';
    put(value.home, path, `storeDir: ${value.store}\n`);
    const child = value.cli();
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(
      events(child).find((event) => event.stage === 'second-production-install-qualified').ambient
        .kind
    ).toBe('sole-netlify-home-store-setting');
    expect(value.context.calls().at(-1)).toEqual(['ci', '--prod']);
    expect(child.stdout + child.stderr).not.toContain(value.home);
  });

  it.each([undefined, 'TRUE', 'false'])(
    'refuses the home literal without exact NETLIFY true: %s',
    (flag) => {
      const value = homeFixture();
      value.context.env.NETLIFY = flag;
      const child = expectBeforeChild(value, 'Ambient pnpm settings need separate review');
      expect(events(child)[0]).toMatchObject({
        storeDirValueClass: 'netlify-home-store-path',
        matchesFixedHomeStore: true,
        processHomeMatchesFixed: true,
        storeMatchesProcessHome: true,
        childHomeMatchesFixed: true,
      });
    }
  );

  it('refuses a nonstring NETLIFY flag in the actual passed environment', () => {
    const value = homeFixture();
    const entry = join(value.context.root, 'tools/netlify-production-install.mjs');
    replaceOwned(
      entry,
      '{ env: process.env, nodeVersion: process.version },',
      '{ env: { ...process.env, NETLIFY: true }, nodeVersion: process.version },'
    );
    const child = expectBeforeChild(value, 'Ambient pnpm settings need separate review');
    expect(events(child)[0]).toMatchObject({
      matchesFixedHomeStore: true,
      processHomeMatchesFixed: true,
      storeMatchesProcessHome: true,
      childHomeMatchesFixed: true,
    });
  });

  it.each([
    (store) => `storeDir: ${store}\nprivateSetting: private-value\n`,
    (store) => `storeDir: ${store}\nstoreDir: ${store}\n`,
    (store) => `storeDir: ${store} # private-comment\n`,
    (store) => `storeDir: !tag ${store}\n`,
    (store) => `storeDir: "${store.replace('home', 'ho\\u006de')}"\n`,
  ])('keeps complete-document grammar for a home-shaped setting: %s', (document) => {
    const value = homeFixture();
    put(value.context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', document(value.store));
    const child = expectBeforeChild(value, 'Ambient pnpm settings need separate review');
    expect(events(child)[0].soleStoreDirForm).toBe('unrecognized');
    expect(child.stdout + child.stderr).not.toContain('private-value');
    expect(child.stdout + child.stderr).not.toContain('private-comment');
  });

  it('refuses a different actual process home with finite facts before children', () => {
    const value = homeFixture();
    const other = join(value.context.root, 'other-home');
    mkdirSync(other);
    value.context.env.HOME = other;
    const child = expectBeforeChild(value, 'Ambient pnpm settings need separate review');
    expect(events(child)[0]).toMatchObject({
      matchesFixedHomeStore: true,
      processHomeMatchesFixed: false,
      storeMatchesProcessHome: false,
      childHomeMatchesFixed: false,
    });
    expect(child.stdout + child.stderr).not.toContain(other);
  });

  it('refuses a passed environment HOME that differs from the actual process home', () => {
    const value = homeFixture();
    const entry = join(value.context.root, 'tools/netlify-production-install.mjs');
    replaceOwned(
      entry,
      '{ env: process.env, nodeVersion: process.version },',
      `{ env: { ...process.env, HOME: ${JSON.stringify(join(value.context.root, 'other-home'))} }, nodeVersion: process.version },`
    );
    const child = expectBeforeChild(value, 'Ambient pnpm settings need separate review');
    expect(events(child)[0]).toMatchObject({
      matchesFixedHomeStore: true,
      processHomeMatchesFixed: true,
      storeMatchesProcessHome: true,
      childHomeMatchesFixed: false,
    });
  });

  it.each([
    (home) => home,
    (home) => join(home, 'other-store'),
    (home) => `${home}/.pnpm-store/child`,
    (home) => `${home}/.pnpm-store/v11`,
    (home) => `${home}/.pnpm-store/`,
    (home) => `${home}/./.pnpm-store`,
    (home) => `${home}//.pnpm-store`,
    (home) => `${home}/../home/.pnpm-store`,
  ])('refuses an unsupported home-store spelling: %s', (spelling) => {
    const value = homeFixture();
    const raw = spelling(value.home);
    put(value.context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${raw}\n`);
    setSetting(value.context, 'store-dir', raw);
    const child = expectBeforeChild(value, 'Ambient pnpm settings need separate review');
    expect(events(child)[0]).toMatchObject({
      matchesFixedHomeStore: false,
      processHomeMatchesFixed: true,
      storeMatchesProcessHome: false,
      childHomeMatchesFixed: true,
    });
  });

  it.each([
    ['home', 'missing'],
    ['home', 'file'],
    ['home', 'link'],
    ['store', 'file'],
    ['store', 'link'],
    ['version', 'file'],
    ['version', 'link'],
  ])('records the finite %s/%s filesystem refusal before children', (role, kind) => {
    const value = homeFixture();
    const path = value[role];
    if (role === 'home') rmSync(path, { recursive: true });
    if (role === 'version') mkdirSync(value.store);
    if (kind === 'file') writeFileSync(path, 'private-file-value');
    if (kind === 'link') symlinkSync(join(value.context.root, 'node_modules'), path, 'dir');
    const child = expectBeforeChild(value, 'Netlify home store filesystem qualification failed');
    expect(events(child).at(-1)).toEqual({
      stage: 'ambient-pnpm-home-filesystem-refused',
      role,
      kind,
    });
    expect(child.stdout + child.stderr).not.toContain('private-file-value');
  });

  it('records the finite ancestor/link filesystem refusal before children', () => {
    const value = homeFixture();
    const ancestor = join(value.context.root, 'linked-home-parent');
    const target = join(value.context.root, 'owned-home-parent');
    const home = join(ancestor, 'home');
    mkdirSync(join(target, 'home'), { recursive: true });
    symlinkSync(target, ancestor, 'dir');
    replaceOwned(
      value.helper,
      `const NETLIFY_HOME_ROOT = ${JSON.stringify(value.home)};`,
      `const NETLIFY_HOME_ROOT = ${JSON.stringify(home)};`
    );
    value.home = home;
    value.context.env.HOME = home;
    const store = join(home, '.pnpm-store');
    put(value.context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${store}\n`);
    setSetting(value.context, 'store-dir', store);
    const child = expectBeforeChild(value, 'Netlify home store filesystem qualification failed');
    expect(events(child).at(-1)).toEqual({
      stage: 'ambient-pnpm-home-filesystem-refused',
      role: 'ancestor',
      kind: 'link',
    });
    expect(child.stdout + child.stderr).not.toContain(ancestor);
    expect(child.stdout + child.stderr).not.toContain(target);
  });

  it.each(['noncanonical', 'inspection'])(
    'records a private %s home inspection failure',
    (kind) => {
      const value = homeFixture();
      const from =
        kind === 'noncanonical'
          ? 'const canonical = realpathSync(current);'
          : 'const entry = optionalEntry(current);';
      const to =
        kind === 'noncanonical'
          ? "const canonical = current === NETLIFY_HOME_ROOT ? current + '/private-canonical-marker' : realpathSync(current);"
          : "if (current === NETLIFY_HOME_ROOT) throw new Error('private-inspection-marker'); const entry = optionalEntry(current);";
      replaceOwned(value.helper, from, to);
      const child = expectBeforeChild(value, 'Netlify home store filesystem qualification failed');
      expect(events(child).at(-1)).toEqual({
        stage: 'ambient-pnpm-home-filesystem-refused',
        role: 'home',
        kind,
      });
      expect(child.stdout + child.stderr).not.toContain('private-inspection-marker');
      expect(child.stdout + child.stderr).not.toContain('private-canonical-marker');
    }
  );

  it('accepts absent store/version directories and their normal appearance during ci', () => {
    const value = homeFixture();
    changeByChild(
      value,
      '--prod',
      `fs.mkdirSync(${JSON.stringify(value.version)}, { recursive: true });`
    );
    const child = value.cli();
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(events(child).at(-1).stage).toBe('second-production-install-accepted');
    expect(value.context.calls().at(-1)).toEqual(['ci', '--prod']);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['boolean', false],
    ['number', 17],
    ['physical', (value) => value.version],
    ['other', () => '/different/private-store'],
  ])('refuses the %s effective store without substituting a default', (label, setting) => {
    const value = homeFixture();
    if (label === 'absent') {
      delete value.context.settings['store-dir'];
      value.context.env.FIXTURE_SETTINGS = JSON.stringify(value.context.settings);
    } else
      setSetting(
        value.context,
        'store-dir',
        typeof setting === 'function' ? setting(value) : setting
      );
    const child = value.cli();
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toContain(
      'Effective pnpm store differs from the qualified ambient setting'
    );
    expect(value.context.calls().some((args) => args[0] === 'ci')).toBe(false);
    expect(child.stdout + child.stderr).not.toContain(value.home);
    expect(child.stdout + child.stderr).not.toContain('/different/private-store');
  });

  it.each(QUERY_STAGES)('rechecks the global file after %s', (stage, lastCall, installRan) => {
    const value = homeFixture();
    value.context.env.FIXTURE_AMBIENT_CHANGE_STAGE = stage;
    value.context.env.FIXTURE_AMBIENT_TEXT = 'configDependencies: {}\n';
    expectProofRefusal(value, lastCall, installRan);
  });

  it.each(
    QUERY_STAGES.flatMap(([stage, lastCall, installRan]) => [
      { stage, lastCall, installRan, owner: 'passed', processMatches: true, childMatches: false },
      { stage, lastCall, installRan, owner: 'process', processMatches: false, childMatches: true },
    ])
  )(
    'rechecks the $owner HOME owner after $stage',
    ({ stage, lastCall, installRan, owner, processMatches, childMatches }) => {
      const value = homeFixture();
      const other = join(value.context.root, 'other-home');
      mkdirSync(other);
      const assignment = owner === 'passed' ? 'options.env.HOME' : 'process.env.HOME';
      replaceOwned(
        join(value.context.root, 'tools/netlify-production-install.mjs'),
        'runChild: spawnSync,',
        `runChild: (path, argv, options) => { const result = spawnSync(path, argv, options); if (argv.at(-1) === ${JSON.stringify(stage)}) ${assignment} = ${JSON.stringify(other)}; return result; },`
      );
      const rows = expectProofRefusal(value, lastCall, installRan);
      expect(rows.find((event) => event.stage === 'ambient-pnpm-home-owner-refused')).toEqual({
        stage: 'ambient-pnpm-home-owner-refused',
        matchesFixedHomeStore: true,
        processHomeMatchesFixed: processMatches,
        storeMatchesProcessHome: processMatches,
        childHomeMatchesFixed: childMatches,
      });
    }
  );

  it.each(
    QUERY_STAGES.flatMap(([stage, lastCall, installRan]) => [
      { stage, lastCall, installRan, role: 'home', kind: 'identity-changed' },
      { stage, lastCall, installRan, role: 'store', kind: 'link' },
      { stage, lastCall, installRan, role: 'version', kind: 'file' },
    ])
  )('rechecks the $role owner after $stage', ({ stage, lastCall, installRan, role, kind }) => {
    const value = homeFixture();
    mkdirSync(value.version, { recursive: true });
    const path = value[role];
    const body =
      role === 'home'
        ? `fs.renameSync(${JSON.stringify(path)}, ${JSON.stringify(path + '-prior')}); fs.mkdirSync(${JSON.stringify(path)});`
        : role === 'store'
          ? `fs.rmSync(${JSON.stringify(path)}, { recursive: true }); fs.symlinkSync(${JSON.stringify(join(value.context.root, 'node_modules'))}, ${JSON.stringify(path)}, 'dir');`
          : `fs.rmSync(${JSON.stringify(path)}, { recursive: true }); fs.writeFileSync(${JSON.stringify(path)}, 'private-version-file');`;
    changeByChild(value, stage, body);
    const rows = expectProofRefusal(value, lastCall, installRan);
    expect(rows.find((event) => event.stage === 'ambient-pnpm-home-filesystem-refused')).toEqual({
      stage: 'ambient-pnpm-home-filesystem-refused',
      role,
      kind,
    });
  });

  it.each(['root', 'candidate'])(
    'keeps the home store disjoint from the %s cleaning root',
    (project) => {
      const value = homeFixture();
      const home =
        project === 'root'
          ? join(value.context.root, 'node_modules')
          : join(value.context.root, 'experiments/native-architecture/node_modules');
      mkdirSync(home, { recursive: true });
      replaceOwned(
        value.helper,
        `const NETLIFY_HOME_ROOT = ${JSON.stringify(value.home)};`,
        `const NETLIFY_HOME_ROOT = ${JSON.stringify(home)};`
      );
      value.context.env.HOME = home;
      const store = join(home, '.pnpm-store');
      put(value.context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', `storeDir: ${store}\n`);
      setSetting(value.context, 'store-dir', store);
      const child = expectBeforeChild(value, 'Netlify cache store overlaps clean-install roots');
      expect(events(child).at(-1)).toEqual({
        stage: 'ambient-pnpm-home-filesystem-refused',
        role: 'version',
        kind: 'cleanup-overlap',
      });
      expect(child.stdout + child.stderr).not.toContain(home);
    }
  );

  it('proves removing the actual passed-HOME predicate accepts the otherwise refused CLI fixture', () => {
    const value = homeFixture();
    const entry = join(value.context.root, 'tools/netlify-production-install.mjs');
    replaceOwned(
      entry,
      '{ env: process.env, nodeVersion: process.version },',
      `{ env: { ...process.env, HOME: ${JSON.stringify(join(value.context.root, 'other-home'))} }, nodeVersion: process.version },`
    );
    expectBeforeChild(value, 'Ambient pnpm settings need separate review');
    replaceOwned(
      value.helper,
      'childHomeMatchesFixed: env.HOME === NETLIFY_HOME_ROOT,',
      'childHomeMatchesFixed: true,'
    );
    const child = value.cli();
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(events(child).at(-1).stage).toBe('second-production-install-accepted');
    expect(value.context.calls().at(-1)).toEqual(['ci', '--prod']);
  });
});
