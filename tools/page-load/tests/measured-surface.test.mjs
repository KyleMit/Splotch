import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEASURED_SURFACE, SPEC_FILE, trackedMeasuredFiles } from '../run-lighthouse-ci.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');

const trackedFiles = new Set(
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 2 ** 28 })
    .split('\0')
    .filter(Boolean)
);
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"](\.[^'"]*)['"]/g;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
// The extensions Metro tries, in its order: it checks X.web.<ext>, then X.<ext>, for one extension
// before it moves to the next, so `X.ts` wins over `X.web.tsx`. Read from the config the export is
// built with, not copied.
const metroSourceExtensions = createRequire(
  join(ROOT, 'experiments/native-architecture/package.json')
)('./metro.config.cjs').resolver.sourceExts.filter((extension) =>
  SOURCE_FILE.test(`.${extension}`)
);

const importSuffixes = (extensions) => [
  '',
  ...extensions.flatMap((extension) => [`.web.${extension}`, `.${extension}`]),
  ...extensions.flatMap((extension) => [`/index.web.${extension}`, `/index.${extension}`]),
];

// Every `tracked` file reachable from `entries` through a relative import (a side-effect one
// included), require or literal dynamic import, with `read` giving a file's source. A file the
// build reads some other way (a readFileSync path) is not found by this walk.
function importClosure(entries, { tracked, read, extensions = metroSourceExtensions }) {
  const suffixes = importSuffixes(extensions);
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!SOURCE_FILE.test(file)) continue;
    for (const [, specifier] of read(file).matchAll(IMPORT_SPECIFIER)) {
      const base = posix.join(posix.dirname(file), specifier);
      const found = suffixes
        .map((suffix) => `${base}${suffix}`)
        .find((candidate) => tracked.has(candidate));
      if (found) queue.push(found);
    }
  }
  return seen;
}

const covers = (surface, file) =>
  surface.some((entry) => file === entry || file.startsWith(`${entry}/`));

describe('the surface a baseline names', () => {
  const nativeApp = 'experiments/native-architecture';
  const knip = JSON.parse(readFileSync(join(ROOT, 'knip.json'), 'utf8'));
  const { main } = JSON.parse(readFileSync(join(ROOT, nativeApp, 'package.json'), 'utf8'));
  const exportEntries = [
    'tools/migration/build-native-web.mjs',
    `${nativeApp}/metro.config.cjs`,
    `${nativeApp}/babel.config.cjs`,
    `${nativeApp}/${main}`,
    ...knip.workspaces[nativeApp].entry.map((entry) => `${nativeApp}/${entry}`),
  ];
  const sourceOf = (file) => readFileSync(join(ROOT, file), 'utf8');
  const imported = [
    ...importClosure(exportEntries, { tracked: trackedFiles, read: sourceOf }),
  ].filter((file) => trackedFiles.has(file) && !SPEC_FILE.test(file));

  it.each(MEASURED_SURFACE)('holds tracked files under %s', (entry) => {
    expect([...trackedFiles].some((file) => covers([entry], file))).toBe(true);
  });

  it('covers every file the export build and the app it bundles import', () => {
    expect(imported.length).toBeGreaterThan(100);
    expect(imported.filter((file) => !covers(MEASURED_SURFACE, file))).toEqual([]);
  });

  it('misses an imported file once its folder leaves the surface', () => {
    const withoutWebLib = MEASURED_SURFACE.filter((entry) => entry !== 'web/src/lib');

    expect(imported.filter((file) => !covers(withoutWebLib, file))).not.toEqual([]);
  });

  it('digests the files it names and no spec', () => {
    const measured = trackedMeasuredFiles();

    expect(measured).toContain('netlify.toml');
    expect(measured).toContain('pnpm-lock.yaml');
    expect(measured.some((file) => SPEC_FILE.test(file))).toBe(false);
    expect(measured.every((file) => covers(MEASURED_SURFACE, file))).toBe(true);
  });
});

describe('the import walk behind that guard', () => {
  // Fixture sources are assembled, never spelled as import statements, because
  // tools/tests/tool-specifier-resolution.test.mjs reads a relative specifier written out in any
  // tools/ file as a real import that must resolve.
  const sideEffectImport = (specifier) => `import '${specifier}';`;
  const dynamicImport = (specifier) => `import('${specifier}');`;
  const reExport = (specifier) => `export { rows } from '${specifier}';`;
  const files = {
    'app/index.ts': [
      sideEffectImport('./Texture'),
      dynamicImport('./panel'),
      sideEffectImport('./Mixed'),
    ].join(' '),
    'app/Texture.tsx': sideEffectImport('../native-only/skia'),
    'app/Texture.web.tsx': sideEffectImport('../outside/shared'),
    'app/Mixed.ts': sideEffectImport('../outside/plain'),
    'app/Mixed.web.tsx': sideEffectImport('../outside/web-only'),
    'app/panel/index.ts': reExport('./rows'),
    'app/panel/rows.ts': reExport('../../outside/rows'),
    'native-only/skia.ts': '',
    'outside/shared.ts': '',
    'outside/rows.ts': '',
    'outside/plain.ts': '',
    'outside/web-only.ts': '',
  };
  const closure = importClosure(['app/index.ts'], {
    tracked: new Set(Object.keys(files)),
    read: (file) => files[file],
    extensions: ['ts', 'tsx'],
  });

  it('follows the web variant Metro bundles, not the native file beside it', () => {
    expect(closure).toContain('app/Texture.web.tsx');
    expect(closure).toContain('outside/shared.ts');
    expect(closure).not.toContain('app/Texture.tsx');
    expect(closure).not.toContain('native-only/skia.ts');
  });

  it('takes the earlier extension over a web variant of a later one, as Metro does', () => {
    expect(closure).toContain('app/Mixed.ts');
    expect(closure).toContain('outside/plain.ts');
    expect(closure).not.toContain('app/Mixed.web.tsx');
    expect(closure).not.toContain('outside/web-only.ts');
  });

  it('follows a dynamic import, a folder index and a re-export', () => {
    expect(closure).toContain('app/panel/index.ts');
    expect(closure).toContain('app/panel/rows.ts');
    expect(closure).toContain('outside/rows.ts');
  });

  it('leaves a file outside the surface for the guard to report', () => {
    expect([...closure].filter((file) => !covers(['app'], file)).sort()).toEqual([
      'outside/plain.ts',
      'outside/rows.ts',
      'outside/shared.ts',
    ]);
  });
});
