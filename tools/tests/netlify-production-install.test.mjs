import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installNetlifyProductionDependencies } from '../netlify-production-install.mjs';
import { ROOT } from '../lib/proc.mjs';
import { CANDIDATE_DIRECTORY } from '../lib/native-candidate.mjs';

const CHILD_TIMEOUT_MS = 30_000;
const roots = [];
const metadata = {
  nodeLinker: 'hoisted',
  included: {
    dependencies: true,
    devDependencies: false,
    optionalDependencies: true,
  },
  layoutVersion: 5,
  virtualStoreDir: '.pnpm',
  packageManager: 'pnpm@11.22.0',
};

function put(root, path, value) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, typeof value === 'string' ? value : JSON.stringify(value));
}

function tempRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-netlify-install-')));
  roots.push(root);
  return root;
}

function fixture() {
  const root = tempRoot();
  put(root, 'package.json', { packageManager: 'pnpm@11.22.0', engines: { node: '>=22.13' } });
  put(root, `${CANDIDATE_DIRECTORY}/package.json`, {
    name: '@splotch/native-architecture',
    private: true,
  });
  put(
    root,
    'pnpm-workspace.yaml',
    'packages:\n  - experiments/native-architecture\nnodeLinker: hoisted\n'
  );
  put(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  put(root, 'netlify.toml', 'NODE_VERSION = "22"\nPNPM_FLAGS = "--prod"\n');
  const settings = {
    'node-linker': 'hoisted',
    packages: [CANDIDATE_DIRECTORY],
    allowBuilds: {
      '@google/genai': false,
      esbuild: false,
      dprint: false,
      protobufjs: false,
    },
  };
  const trace = join(root, 'child-trace.jsonl');
  put(
    root,
    'bin/pnpm',
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_TRACE, JSON.stringify(args) + '\\n');
if (args[0] === '--version') console.log(process.env.FIXTURE_PNPM_VERSION ?? '11.22.0');
else if (args[0] === 'config' && args[1] === 'get' && args[2] === '--json' && args.length === 4) {
  const settings = JSON.parse(process.env.FIXTURE_SETTINGS);
  if (Object.hasOwn(settings, args[3])) console.log(JSON.stringify(settings[args[3]]));
} else if (args.length === 2 && args[0] === 'ci' && args[1] === '--prod') {
  if (process.env.FIXTURE_INSTALL_EXIT) process.exit(Number(process.env.FIXTURE_INSTALL_EXIT));
  fs.mkdirSync(path.join(process.cwd(), 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'node_modules/.modules.yaml'), process.env.FIXTURE_MODULES);
  if (process.env.FIXTURE_CHANGE_OWNER) fs.appendFileSync('pnpm-lock.yaml', '# changed\\n');
} else process.exit(87);
`
  );
  chmodSync(join(root, 'bin/pnpm'), 0o755);
  const env = {
    PATH: `${join(root, 'bin')}:${dirname(process.execPath)}`,
    PNPM_FLAGS: '--prod',
    XDG_CONFIG_HOME: join(root, 'owned-config'),
    FIXTURE_TRACE: trace,
    FIXTURE_SETTINGS: JSON.stringify(settings),
    FIXTURE_MODULES: JSON.stringify(metadata),
  };
  const records = [];
  const facts = { env, nodeVersion: 'v22.23.3' };
  const run = () =>
    installNetlifyProductionDependencies(root, facts, {
      runChild: spawnSync,
      record: (event) => records.push(event),
    });
  const calls = () =>
    existsSync(trace)
      ? readFileSync(trace, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];
  return { root, env, facts, records, settings, run, calls };
}

function setSetting(context, key, value) {
  context.settings[key] = value;
  context.env.FIXTURE_SETTINGS = JSON.stringify(context.settings);
}

function cliFixture(context) {
  put(
    context.root,
    'netlify.toml',
    `NODE_VERSION = "${process.versions.node.split('.')[0]}"\nPNPM_FLAGS = "--prod"\n`
  );
  for (const path of [
    'tools/netlify-production-install.mjs',
    'tools/lib/proc.mjs',
    'tools/lib/netlify-runtime.mjs',
    'tools/lib/native-candidate.mjs',
  ]) {
    mkdirSync(dirname(join(context.root, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(context.root, path));
  }
  return (args = []) =>
    spawnSync(process.execPath, ['tools/netlify-production-install.mjs', ...args], {
      cwd: context.root,
      env: context.env,
      encoding: 'utf8',
      timeout: CHILD_TIMEOUT_MS,
    });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Netlify second production installer', () => {
  it('gates the actual Netlify build and staging command on the installer', () => {
    const source = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
    const sections = source.split(/^\[build\]\s*$/m);
    expect(sections).toHaveLength(2);
    const build = sections[1].split(/^\[/m)[0];
    const commands = [...build.matchAll(/^\s*command\s*=\s*"([^"]*)"\s*$/gm)];
    expect(commands).toHaveLength(1);
    expect(commands[0][1]).toBe(
      'git fetch --tags --force || true; node tools/netlify-production-install.mjs && npm run build && node tools/stage-netlify-functions.mjs'
    );
  });

  it('records actual named-get children, ci argv and finite fresh prod metadata', () => {
    const context = fixture();
    const result = context.run();
    expect(result.metadata).toEqual(metadata);
    expect(context.calls().at(-1)).toEqual(['ci', '--prod']);
    expect(
      context
        .calls()
        .slice(1, -1)
        .every((args) => args.length === 4 && args.slice(0, 3).join(' ') === 'config get --json')
    ).toBe(true);
    expect(context.records.at(-1).stage).toBe('second-production-install-accepted');
    expect(
      context.records.find((row) => row.stage === 'second-production-install-exit').exitCode
    ).toBe(0);
    expect(
      context.records.find((row) => row.stage === 'second-production-install-qualified').owners
    ).toHaveLength(5);
  });

  it('accepts a warm regular module tree and probes the fixed stale nested package', () => {
    const context = fixture();
    put(context.root, 'node_modules/.modules.yaml', metadata);
    put(context.root, 'node_modules/filelist/node_modules/brace-expansion/package.json', {
      name: 'brace-expansion',
      version: '2.1.1',
    });
    context.run();
    const qualified = context.records.find(
      (row) => row.stage === 'second-production-install-qualified'
    );
    expect(qualified.residue).toMatchObject({
      present: true,
      name: 'brace-expansion',
      version: '2.1.1',
    });
    expect(context.calls().at(-1)).toEqual(['ci', '--prod']);
  });

  it('rejects the explicit JSON string undefined before any destructive install', () => {
    const context = fixture();
    setSetting(context, 'modules-dir', 'undefined');
    expect(context.run).toThrow('Unsupported explicit pnpm setting modules-dir');
    expect(context.calls()).toEqual([['--version'], ['config', 'get', '--json', 'modules-dir']]);
    expect(context.records).toEqual([]);
  });

  it.each(['force', 'ignore-scripts', 'only', 'dry-run', 'lockfile-only', 'filter'])(
    'rejects unsupported named setting %s before ci',
    (key) => {
      const context = fixture();
      setSetting(context, key, key === 'only' ? 'dev' : key === 'filter' ? ['no-project'] : true);
      expect(context.run).toThrow(`Unsupported explicit pnpm setting ${key}`);
      expect(context.calls().some((args) => args[0] === 'ci')).toBe(false);
    }
  );

  it.each(['node_modules', `${CANDIDATE_DIRECTORY}/node_modules`, 'experiments'])(
    'rejects linked root %s before the manager and preserves its real outside sentinel',
    (path) => {
      const context = fixture();
      const outside = tempRoot();
      put(outside, 'sentinel', 'untouched');
      rmSync(join(context.root, path), { recursive: true, force: true });
      mkdirSync(dirname(join(context.root, path)), { recursive: true });
      symlinkSync(outside, join(context.root, path));
      expect(context.run).toThrow('Unsafe installer root or source kind');
      expect(context.calls()).toEqual([]);
      expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe('untouched');
    }
  );

  it('rejects a lexical symlink checkout root before manager execution', () => {
    const context = fixture();
    const aliases = tempRoot();
    symlinkSync(context.root, join(aliases, 'checkout'));
    expect(() =>
      installNetlifyProductionDependencies(
        join(aliases, 'checkout'),
        { env: context.env, nodeVersion: 'v22.23.3' },
        { runChild: spawnSync, record: (event) => context.records.push(event) }
      )
    ).toThrow('Unsafe installer root or source kind');
    expect(context.calls()).toEqual([]);
  });

  it.each(['.pnpmfile.mjs', '.pnpmfile.cjs'])(
    'rejects default preload %s before its body can run',
    (path) => {
      const context = fixture();
      put(context.root, path, "require('node:fs').writeFileSync('preload-sentinel', 'executed');");
      expect(context.run).toThrow('Default pnpmfile is not approved');
      expect(context.calls()).toEqual([]);
      expect(existsSync(join(context.root, 'preload-sentinel'))).toBe(false);
    }
  );

  it('refuses ambient global yaml without reading or printing authentication files', () => {
    const context = fixture();
    put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', 'configDependencies: {}\n');
    put(context.env.XDG_CONFIG_HOME, 'pnpm/auth.ini', 'fixture-auth-marker');
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.calls()).toEqual([]);
    expect(readFileSync(join(context.env.XDG_CONFIG_HOME, 'pnpm/auth.ini'), 'utf8')).toBe(
      'fixture-auth-marker'
    );
    expect(JSON.stringify(context.records)).not.toContain('fixture-auth-marker');
  });

  it('records only global setting names and the fixed cache-path class before refusal', () => {
    const context = fixture();
    put(
      context.env.XDG_CONFIG_HOME,
      'pnpm/config.yaml',
      'storeDir: /opt/build/cache/.pnpm-store\nsecretSetting: fixture-not-printed\n'
    );
    put(context.root, 'node_modules/sentinel', 'untouched');
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.records).toEqual([
      {
        stage: 'ambient-pnpm-config-refused',
        kind: 'regular-file',
        sizeBytes: Buffer.byteLength(
          'storeDir: /opt/build/cache/.pnpm-store\nsecretSetting: fixture-not-printed\n'
        ),
        namedKeys: ['storeDir'],
        unlistedKeyCount: 1,
        storeDirValueClass: 'unrecognized',
      },
    ]);
    expect(context.calls()).toEqual([]);
    expect(readFileSync(join(context.root, 'node_modules/sentinel'), 'utf8')).toBe('untouched');
    expect(JSON.stringify(context.records)).not.toContain('fixture-not-printed');
    expect(JSON.stringify(context.records)).not.toContain('secretSetting');
    expect(JSON.stringify(context.records)).not.toContain('/opt/build/cache/.pnpm-store');
  });

  it('redacts value-shaped lines in a multiline scalar to a count', () => {
    const context = fixture();
    put(
      context.env.XDG_CONFIG_HOME,
      'pnpm/config.yaml',
      'token: "abc\nAbCdEf0123456789secret: tail"\n'
    );
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.records[0]).toMatchObject({ namedKeys: [], unlistedKeyCount: 2 });
    expect(JSON.stringify(context.records)).not.toContain('AbCdEf0123456789secret');
    expect(context.calls()).toEqual([]);
  });

  it.each([
    ['storeDir: /opt/build/cache/.pnpm-store\n', 'netlify-cache-path'],
    ['storeDir: /opt/build/cache/../../../root/x\n', 'unrecognized'],
    ['storeDir: /opt/build/cache/./x\n', 'unrecognized'],
    ['storeDir: /opt/build/cache/a\nstoreDir: /home/x\n', 'unrecognized'],
    ['storeDir: /opt/build/cache/a\nconfigDependencies: {}\n', 'unrecognized'],
  ])('classifies only one complete plain cache-store setting: %s', (text, classification) => {
    const context = fixture();
    put(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml', text);
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.records[0].storeDirValueClass).toBe(classification);
    expect(JSON.stringify(context.records)).not.toContain('/opt/build/cache');
    expect(context.calls()).toEqual([]);
  });

  it('does not read through a linked global settings parent', () => {
    const context = fixture();
    put(context.root, 'outside-pnpm/config.yaml', 'storeDir: /opt/build/cache/.pnpm-store\n');
    mkdirSync(context.env.XDG_CONFIG_HOME, { recursive: true });
    symlinkSync(join(context.root, 'outside-pnpm'), join(context.env.XDG_CONFIG_HOME, 'pnpm'));
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.records[0]).toMatchObject({
      kind: 'linked-parent',
      namedKeys: [],
      storeDirValueClass: 'unobserved',
    });
    expect(context.calls()).toEqual([]);
  });

  it('does not read a linked global settings target before refusal', () => {
    const context = fixture();
    put(context.root, 'outside-global.yaml', 'outsideMarker: fixture-outside-not-printed\n');
    mkdirSync(join(context.env.XDG_CONFIG_HOME, 'pnpm'), { recursive: true });
    symlinkSync(
      join(context.root, 'outside-global.yaml'),
      join(context.env.XDG_CONFIG_HOME, 'pnpm/config.yaml')
    );
    expect(context.run).toThrow('Ambient pnpm settings need separate review');
    expect(context.records[0]).toMatchObject({
      kind: 'symlink',
      namedKeys: [],
      storeDirValueClass: 'unobserved',
    });
    expect(context.calls()).toEqual([]);
    expect(JSON.stringify(context.records)).not.toContain('outsideMarker');
  });

  it.each([
    'configDependencies: {}',
    'pnpmfile: ./hook.cjs',
    'lockfileDir: ../borrowed',
    '"pnpm\\u0066ile": ./hook.cjs',
    '${FIXTURE_KEY}: ./hook.cjs',
  ])('rejects unsupported workspace preload spelling before any pnpm child: %s', (line) => {
    const context = fixture();
    put(context.root, 'pnpm-workspace.yaml', `${line}\n`);
    expect(context.run).toThrow('Workspace pnpm preload spelling or interpolation is unsupported');
    expect(context.calls()).toEqual([]);
  });

  it('refuses a preload environment selector before version/config children', () => {
    const context = fixture();
    context.env.PNPM_CONFIG_GLOBAL_PNPMFILE = '../borrowed.cjs';
    expect(context.run).toThrow('pnpm preload or prefix environment override is unsupported');
    expect(context.calls()).toEqual([]);
  });

  it.each([
    ['flags', 'Actual production install flags differ'],
    ['manager', 'Actual package manager differs'],
    ['layout', 'Actual linker differs from the shipping owner'],
    ['builds', 'Clean-install skipped rebuild requires'],
  ])('refuses wrong %s before ci', (kind, reason) => {
    const context = fixture();
    if (kind === 'flags') context.env.PNPM_FLAGS = '--prod --force';
    if (kind === 'manager') context.env.FIXTURE_PNPM_VERSION = '11.21.0';
    if (kind === 'layout') setSetting(context, 'node-linker', 'isolated');
    if (kind === 'builds')
      setSetting(context, 'allowBuilds', { ...context.settings.allowBuilds, esbuild: true });
    expect(context.run).toThrow(reason);
    expect(context.calls().some((args) => args[0] === 'ci')).toBe(false);
  });

  it('rejects a launcher inside a module tree before that launcher can be cleaned', () => {
    const context = fixture();
    mkdirSync(join(context.root, 'node_modules/.bin'), { recursive: true });
    symlinkSync(join(context.root, 'bin/pnpm'), join(context.root, 'node_modules/.bin/pnpm'));
    context.env.PATH = `${join(context.root, 'node_modules/.bin')}:${dirname(process.execPath)}`;
    expect(context.run).toThrow('pnpm launcher would be cleaned');
    expect(context.calls()).toEqual([]);
  });

  it('refuses an install lifecycle script before manager execution', () => {
    const context = fixture();
    put(context.root, `${CANDIDATE_DIRECTORY}/package.json`, {
      name: '@splotch/native-architecture',
      scripts: { postinstall: 'unexpected-child' },
    });
    expect(context.run).toThrow('Workspace lifecycle scripts need a reviewed clean-install route');
    expect(context.calls()).toEqual([]);
  });

  it.each([
    ['package.json', 'preprepare'],
    ['package.json', 'postprepare'],
    [`${CANDIDATE_DIRECTORY}/package.json`, 'preprepare'],
    [`${CANDIDATE_DIRECTORY}/package.json`, 'postprepare'],
  ])('refuses %s %s before any manager child', (path, stage) => {
    const context = fixture();
    const manifest = JSON.parse(readFileSync(join(context.root, path), 'utf8'));
    put(context.root, path, { ...manifest, scripts: { [stage]: 'unexpected-child' } });
    expect(context.run).toThrow('Workspace lifecycle scripts need a reviewed clean-install route');
    expect(context.calls()).toEqual([]);
  });

  it('refuses a Node below the current floor before manager execution', () => {
    const context = fixture();
    context.facts.nodeVersion = 'v22.12.0';
    expect(context.run).toThrow('Node is below the root floor');
    expect(context.calls()).toEqual([]);
  });

  it('records nonzero real child exit and never accepts the stage', () => {
    const context = fixture();
    context.env.FIXTURE_INSTALL_EXIT = '19';
    expect(context.run).toThrow('Second production install failed');
    expect(context.records.at(-1)).toMatchObject({
      stage: 'second-production-install-exit',
      exitCode: 19,
    });
    expect(existsSync(join(context.root, 'node_modules/.modules.yaml'))).toBe(false);
  });

  it('rejects source changes made by the actual ci child', () => {
    const context = fixture();
    context.env.FIXTURE_CHANGE_OWNER = '1';
    expect(context.run).toThrow('Second installer changed source owners');
    expect(context.records.at(-1).stage).toBe('second-production-install-exit');
  });

  it('rejects incorrect post-install metadata from the actual child', () => {
    const context = fixture();
    context.env.FIXTURE_MODULES = JSON.stringify({
      ...metadata,
      included: { dependencies: true, devDependencies: true, optionalDependencies: true },
    });
    expect(context.run).toThrow('Materialized pnpm production metadata differs');
    expect(context.records.at(-1).stage).toBe('second-production-install-exit');
  });

  it('drives the strict real CLI and does not print unselected config', () => {
    const context = fixture();
    setSetting(context, 'registry', 'fixture-never-printed-auth-marker');
    const child = cliFixture(context)();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('second-production-install-accepted');
    expect(child.stdout).not.toContain('fixture-never-printed-auth-marker');
  });

  it.each(['--force', 'ci', '--lockfile'])(
    'rejects extra CLI argument %s before manager work',
    (arg) => {
      const context = fixture();
      const child = cliFixture(context)([arg]);
      expect(child.status).not.toBe(0);
      expect(context.calls()).toEqual([]);
    }
  );

  it('propagates real CLI installer failure before a build continuation', () => {
    const context = fixture();
    context.env.FIXTURE_INSTALL_EXIT = '19';
    cliFixture(context);
    const child = spawnSync(
      '/bin/sh',
      [
        '-c',
        'node tools/netlify-production-install.mjs && node -e \'require("node:fs").writeFileSync("build-continuation", "ran")\'',
      ],
      {
        cwd: context.root,
        env: context.env,
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
      }
    );
    expect(child.status).not.toBe(0);
    expect(child.stdout).toContain('second-production-install-exit');
    expect(child.stdout).not.toContain('second-production-install-accepted');
    expect(existsSync(join(context.root, 'build-continuation'))).toBe(false);
  });

  it('permits the same real build continuation after accepted metadata', () => {
    const context = fixture();
    cliFixture(context);
    const child = spawnSync(
      '/bin/sh',
      [
        '-c',
        'node tools/netlify-production-install.mjs && node -e \'require("node:fs").writeFileSync("build-continuation", "ran")\'',
      ],
      {
        cwd: context.root,
        env: context.env,
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
      }
    );
    expect(child.status).toBe(0);
    expect(readFileSync(join(context.root, 'build-continuation'), 'utf8')).toBe('ran');
  });
});
