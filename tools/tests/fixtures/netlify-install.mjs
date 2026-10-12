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
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installNetlifyProductionDependencies } from '../../netlify-production-install.mjs';
import { ROOT } from '../../lib/proc.mjs';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
export const CHILD_TIMEOUT_MS = 30_000;
const roots = [];
export const metadata = {
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

export function put(root, path, value) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, typeof value === 'string' ? value : JSON.stringify(value));
}

export function tempRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-netlify-install-')));
  roots.push(root);
  return root;
}

export function fixture() {
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
if (process.env.FIXTURE_AMBIENT_CHANGE_STAGE === args.at(-1)) {
  const config = path.join(process.env.XDG_CONFIG_HOME, 'pnpm/config.yaml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, process.env.FIXTURE_AMBIENT_TEXT);
}
if (process.env.FIXTURE_CACHE_LINK_STAGE === args.at(-1)) {
  fs.rmSync(process.env.FIXTURE_CACHE_STORE, { recursive: true, force: true });
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'), process.env.FIXTURE_CACHE_STORE, 'dir');
}
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

export function setSetting(context, key, value) {
  context.settings[key] = value;
  context.env.FIXTURE_SETTINGS = JSON.stringify(context.settings);
}

export function cliFixture(context) {
  put(
    context.root,
    'netlify.toml',
    `NODE_VERSION = "${process.versions.node.split('.')[0]}"\nPNPM_FLAGS = "--prod"\n`
  );
  for (const path of [
    'tools/netlify-production-install.mjs',
    'tools/lib/proc.mjs',
    'tools/lib/netlify-runtime.mjs',
    'tools/lib/netlify-cache-config.mjs',
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

export function cleanupFixtures() {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}
