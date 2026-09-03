#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../..');
const coreDirectory = join(repositoryRoot, 'tools/rival-agent');
// Exported so the drift guard can normalize homedir()-based paths on noncanonical hosts.
export const EXPECTED_HOME = '/Users/kylemit';
const EXPECTED_REPOSITORY_ROOT = '/Users/kylemit/Code/Splotch';
export const MANIFEST_VERSION = 5;

// One directory holds the whole trusted install: the vendor-neutral core copied verbatim and the
// Codex-side package files with their core imports repointed at their new siblings. The two fixed
// paths implement-issue-stack invokes stay where they were as shims onto that directory.
export const INSTALL_ROOT = join(homedir(), '.local/libexec/splotch-rival-agent');
export const INSTALL_SHIMS = Object.freeze({
  reviewPublish: join(homedir(), '.local/libexec/splotch-claude-review-publish.mjs'),
  health: join(homedir(), '.local/libexec/splotch-claude-health.mjs'),
});
export const CORE_FILES = Object.freeze([
  'broker-server.mjs',
  'broker.mjs',
  'spool.mjs',
  'worktree.mjs',
  'stream.mjs',
  'ledger.mjs',
  'prompt.mjs',
  'rival-prompt.md',
  'rival-prompt-hybrid.md',
  'findings.schema.json',
  'validate-findings.mjs',
  'post-review.mjs',
  'launch.mjs',
]);
export const PACKAGE_FILES = Object.freeze([
  'launch-claude.mjs',
  'claude-health.mjs',
  'claude-review-publish.mjs',
  'splotch-claude-subscription-auth.mjs',
]);
export const EXECUTABLE_FILES = Object.freeze([
  'broker.mjs',
  'post-review.mjs',
  'launch-claude.mjs',
  'claude-health.mjs',
  'claude-review-publish.mjs',
]);
const CORE_IMPORT_PREFIX = "'../../../../tools/rival-agent/";
const SHIM_SOURCES = Object.freeze({
  reviewPublish: 'claude-review-publish.mjs',
  health: 'claude-health.mjs',
});
// Files earlier installers wrote and nothing reads any more.
export const STALE_PATHS = Object.freeze([
  join(homedir(), '.local/libexec/splotch-claude-run.mjs'),
  join(homedir(), '.local/libexec/splotch-claude-stream.mjs'),
  join(homedir(), '.local/libexec/splotch-claude-subscription-auth.mjs'),
  join(homedir(), '.local/libexec/splotch-claude-review-health.mjs'),
  join(homedir(), '.config/splotch-run-claude/settings.json'),
  join(homedir(), '.config/splotch-run-claude/runner-boundary.md'),
  join(homedir(), '.config/splotch-run-claude/reviewer-rubric.md'),
  join(homedir(), '.config/splotch-run-claude/manifest.json'),
]);

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function rewriteCoreImports(source, name) {
  const rewritten = source.replaceAll(CORE_IMPORT_PREFIX, "'./");
  if (rewritten.includes('../../../../')) {
    throw new Error(`${name} still reaches outside the install directory after rewriting`);
  }
  return rewritten;
}

export function shimSource(target) {
  return `#!/usr/bin/env node\nimport { main } from './splotch-rival-agent/${target}';\n\nmain();\n`;
}

export function expectedInstalledFiles() {
  const files = new Map();
  for (const name of CORE_FILES) files.set(name, readFileSync(join(coreDirectory, name)));
  for (const name of PACKAGE_FILES) {
    files.set(
      name,
      Buffer.from(rewriteCoreImports(readFileSync(join(scriptDirectory, name), 'utf8'), name))
    );
  }
  const shims = new Map(
    Object.entries(SHIM_SOURCES).map(([key, target]) => [key, Buffer.from(shimSource(target))])
  );
  const manifest = {
    version: MANIFEST_VERSION,
    files: Object.fromEntries([...files].map(([name, content]) => [name, digest(content)])),
    shims: Object.fromEntries(
      [...shims].map(([key, content]) => [INSTALL_SHIMS[key], digest(content)])
    ),
  };
  return { files, shims, manifest: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
}

function isCurrent({ root, shims }, expected) {
  const same = (path, content) => existsSync(path) && readFileSync(path).equals(content);
  return (
    [...expected.files].every(([name, content]) => same(join(root, name), content)) &&
    [...expected.shims].every(([key, content]) => same(shims[key], content)) &&
    same(join(root, 'manifest.json'), expected.manifest)
  );
}

// `home` is injectable only so the check-mode test can run on a CI runner whose home is not the
// fixed one; a real install still refuses any other machine.
export function installRunClaude({
  check = false,
  root = INSTALL_ROOT,
  shims = INSTALL_SHIMS,
  stalePaths = STALE_PATHS,
  home = homedir(),
} = {}) {
  if (home !== EXPECTED_HOME || (!check && repositoryRoot !== EXPECTED_REPOSITORY_ROOT)) {
    throw new Error(`this trusted installer is fixed to ${EXPECTED_REPOSITORY_ROOT}`);
  }
  const expected = expectedInstalledFiles();
  if (check) {
    if (!isCurrent({ root, shims }, expected)) {
      throw new Error(
        'the rival-agent install is missing or stale; run npm run run-claude:install'
      );
    }
    console.log('trusted rival-agent installation is current');
    return;
  }

  if (existsSync(root)) {
    for (const name of [...expected.files.keys(), 'manifest.json']) {
      const path = join(root, name);
      if (existsSync(path)) chmodSync(path, 0o644);
    }
    rmSync(root, { recursive: true, force: true });
  }
  mkdirSync(root, { recursive: true });
  for (const [name, content] of expected.files) writeFileSync(join(root, name), content);
  writeFileSync(join(root, 'manifest.json'), expected.manifest);
  for (const name of expected.files.keys()) {
    chmodSync(join(root, name), EXECUTABLE_FILES.includes(name) ? 0o555 : 0o444);
  }
  chmodSync(join(root, 'manifest.json'), 0o444);
  for (const [key, content] of expected.shims) {
    const path = shims[key];
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) chmodSync(path, 0o644);
    writeFileSync(path, content);
    chmodSync(path, 0o555);
  }
  for (const path of stalePaths) {
    if (existsSync(path)) {
      chmodSync(path, 0o644);
      rmSync(path, { force: true });
    }
  }
  console.log(`installed the trusted rival-agent package at ${root}`);
}

export function runInstallerCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: { check: { type: 'boolean', default: false } },
  });
  installRunClaude({ check: values.check });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runInstallerCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
