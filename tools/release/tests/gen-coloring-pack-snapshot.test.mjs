import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const CHILD_TIMEOUT_MS = 15_000;
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});
const generatorImport = (specifier) => `import { BOOK_ID } ${'from'} '${specifier}';`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-historical-pack-'));
  fixtures.push(root);
  const put = (path, contents) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  for (const path of [
    'tools/release/gen-coloring-pack-snapshot.mjs',
    'tools/release/lib/coloring-pack-retention.mjs',
    'tools/release/lib/release-frontmatter.mjs',
    'tools/lib/proc.mjs',
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(root, path));
  }
  put('package.json', JSON.stringify({ version: '1.2.0', type: 'module' }));
  put('web/src/lib/catalog.ts', "export const BOOK_ID = 'historical-book';");
  put('web/static/coloring/probe.svg', '<svg/>');
  put(
    'web/coloringPackManifest.ts',
    [
      generatorImport('./src/lib/catalog.ts'),
      'export function buildColoringPackManifest(appVersion, platform) {',
      "  if (platform !== 'mobile') throw new Error('Wrong platform');",
      "  return { manifest: { appVersion, starterBookId: 'starter', books: [{ id: BOOK_ID, variants: { full: { files: [{ path: '/coloring/probe.svg', sha256: 'historical-digest' }] } } }] } };",
      '}',
    ].join('\n')
  );
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git(['init', '-q']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'Released legacy layout',
  ]);
  git(['tag', 'v1.2.0']);
  const commit = git(['rev-parse', 'HEAD']).trim();
  rmSync(join(root, 'web'), { recursive: true });
  put('package.json', JSON.stringify({ version: '9.9.0', type: 'module' }));
  put('src/lib/catalog.ts', "export const BOOK_ID = 'wrong-current-book';");
  put('assets/static/coloring/probe.svg', 'wrong-current-bytes');
  return { root, commit };
}

it('archives the released tag’s own generator and legacy inputs after root promotion', () => {
  const { root, commit } = fixture();
  const result = spawnSync(
    process.execPath,
    [join(root, 'tools/release/gen-coloring-pack-snapshot.mjs'), '--ref', 'v1.2.0'],
    { cwd: root, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS }
  );
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const snapshot = JSON.parse(
    readFileSync(join(root, 'tools/release/coloring-pack-snapshots/1.2.0.json'), 'utf8')
  );
  expect(snapshot).toEqual({
    ref: 'v1.2.0',
    commit,
    appVersion: '1.2.0',
    starterBookId: 'starter',
    books: [{ id: 'historical-book', files: { '/coloring/probe.svg': 'historical-digest' } }],
  });
});
