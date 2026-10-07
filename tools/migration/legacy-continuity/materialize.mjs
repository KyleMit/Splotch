import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { FIXTURE_PATH, FIXTURE_DEBUG_SIGNING, digest, replaceOnce } from './contract.mjs';
import { nativeOverlay } from './native-overlay.mjs';
import { relocateFixtureOwners, verifyFixtureOwners } from './fixture-source-namespace.mjs';
import { inspectSource, sourceTree } from './source-inputs.mjs';

const MATERIALIZATION_TIMEOUT_MS = 120_000;

function assertNewOwnedRoot(output) {
  const proposed = resolve(output);
  assert.ok(
    basename(proposed).startsWith('splotch-legacy-continuity-'),
    'L0_OWNED_ROOT_NAME_REQUIRED'
  );
  const parent = realpathSync(dirname(proposed));
  assert.ok(
    parent === '/private/tmp' || parent.startsWith('/private/tmp/'),
    'L0_OWNED_TMP_ROOT_REQUIRED'
  );
  const path = join(parent, basename(proposed));
  assert.ok(!existsSync(path), 'L0_EXISTING_ROOT_REFUSED');
  mkdirSync(path);
  return path;
}

function verifyExtractedFiles(root, entries) {
  for (const entry of entries) {
    const bytes = readFileSync(join(root, entry.path));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(blob, entry.blob, `L0_SOURCE_BYTES_CHANGED: ${entry.path}`);
    assert.equal(bytes.length, entry.bytes, `L0_SOURCE_LENGTH_CHANGED: ${entry.path}`);
    assert.equal(
      Boolean(statSync(join(root, entry.path)).mode & 0o111),
      entry.mode === '100755',
      `L0_SOURCE_MODE_CHANGED: ${entry.path}`
    );
  }
}

function debugSigningOverlay(root, read) {
  const source = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
  assert.doesNotMatch(
    source,
    /signingConfigs\.debug|^\s*debug\s*\{/m,
    'L0_FIXTURE_DEBUG_OWNER_CHANGED'
  );
  let setup = read('debug-signing.gradle.template');
  for (const [name, value] of Object.entries(FIXTURE_DEBUG_SIGNING)) {
    setup = replaceOnce(setup, `__L0_DEBUG_${name}__`, value);
  }
  const signingBlock = `        debug {
            storeFile l0DebugKeyFile
            storePassword l0DebugPasswords['storePassword']
            keyAlias l0DebugKeyAlias
            keyPassword l0DebugPasswords['keyPassword']
        }
`;
  return (
    setup + replaceOnce(source, '    signingConfigs {\n', '    signingConfigs {\n' + signingBlock)
  );
}

function fixtureOverlay(root, input) {
  const templates = join(import.meta.dirname, 'templates');
  const read = (name) => readFileSync(join(templates, name), 'utf8');
  const route = 'web/src/routes/legacy-continuity.html';
  const nativeConfig = structuredClone(input.nativeConfig);
  nativeConfig.server.appStartPath = FIXTURE_PATH;
  const fixtures = {
    'capacitor.config.json': JSON.stringify(nativeConfig, null, 2) + '\n',
    'android/app/build.gradle': debugSigningOverlay(root, read),
    [`${route}/+page.svelte`]: read('page.svelte.template'),
    [`${route}/+page.ts`]: read('page.ts.template'),
    [`${route}/fixture-config.ts`]: `export const fixtureConfig = ${JSON.stringify(input.configuration, null, 2)} as const;\n`,
    [`${route}/fixture.ts`]: read('fixture.ts.template'),
    [`${route}/held-reader.ts`]: read('held-reader.ts.template'),
    [`${route}/settings-parser.ts`]: read(
      input.role === 'released' ? 'settings-released.ts.template' : 'settings-main.ts.template'
    ),
    [`${route}/held-owner.ts`]: read(
      input.role === 'released' ? 'held-released.ts.template' : 'held-main.ts.template'
    ),
  };
  const namespace = relocateFixtureOwners(root, input, fixtures);
  return {
    namespace,
    overlay: { ...namespace.files, ...nativeOverlay(root, input.configuration, templates) },
  };
}

export function materializeFixture(repo, role, output) {
  const input = inspectSource(repo, role);
  const entries = sourceTree(repo, input.revision);
  const root = assertNewOwnedRoot(output);
  const archive = join(root, '.l0-source.tar');
  writeFileSync(
    join(root, '.splotch-l0-owner.json'),
    JSON.stringify({
      unit: 'L0',
      revision: input.revision,
      root,
      state: 'materializing-source-only',
    }) + '\n'
  );
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, input.revision], {
    cwd: repo,
    timeout: MATERIALIZATION_TIMEOUT_MS,
  });
  execFileSync('tar', ['-xf', archive, '-C', root], {
    timeout: MATERIALIZATION_TIMEOUT_MS,
  });
  verifyExtractedFiles(root, entries);
  rmSync(archive);
  const { overlay, namespace } = fixtureOverlay(root, { ...input, sourceFiles: entries });
  const changes = Object.entries(overlay).map(([path, text]) => {
    const target = join(root, path);
    const before = existsSync(target) ? digest(readFileSync(target)) : null;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    return {
      path,
      before,
      after: digest(readFileSync(target)),
      bytes: Buffer.byteLength(text),
    };
  });
  verifyFixtureOwners(root, namespace);
  const toolPaths = [
    ...readdirSync(import.meta.dirname).filter((name) => name.endsWith('.mjs')),
    ...readdirSync(join(import.meta.dirname, 'templates')).map((name) => `templates/${name}`),
  ].sort();
  const tools = toolPaths.map((path) => {
    const bytes = readFileSync(join(import.meta.dirname, path));
    return { path, bytes: bytes.length, sha256: digest(bytes) };
  });
  const receipt = {
    ...input,
    root,
    preparation: 'materialized and overlaid source; no dependencies installed or native execution',
    tools,
    sourceFiles: entries,
    overlay: changes,
    fixtureOwnerNamespace: namespace.receipt,
  };
  writeFileSync(join(root, '.splotch-l0-source.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
