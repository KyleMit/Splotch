import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { WEB_ONLY_STATIC_FILES } from '../../mobile/lib/static-export.mjs';
import {
  buildDirHoldsNativeExport,
  entryModulePath,
  servedBuildFingerprintProblem,
} from '../lib/profile-preview.mjs';

function writeEmptyFiles(directory, files) {
  for (const file of files) {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '');
  }
  return directory;
}

function scratch() {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-build-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

// A synthetic build rather than the real web/build: CI's browserless job runs no build,
// and a test that reads the real one passes only where a build happens to exist.
function fakeBuild() {
  const directory = scratch();
  const entry = join(directory, '_app', 'immutable', 'entry');
  mkdirSync(entry, { recursive: true });
  writeFileSync(
    join(directory, 'index.html'),
    '<script>import("/_app/immutable/entry/start.Aaa.js")</script>'
  );
  writeFileSync(join(entry, 'start.Aaa.js'), 'import "/_app/immutable/entry/app.Bbb.js";');
  writeFileSync(join(entry, 'app.Bbb.js'), 'export const app = 1;');
  return writeEmptyFiles(directory, WEB_ONLY_STATIC_FILES);
}

const serveFrom =
  (dir, mutate = (path, body) => body) =>
  async (url) => {
    const path = new URL(url, 'http://x/').pathname;
    const file = path === '/' ? join(dir, 'index.html') : join(dir, path);
    return mutate(path, readFileSync(file, 'utf8'));
  };

describe('entryModulePath', () => {
  it('finds the SvelteKit entry module a served page names', () => {
    const html = '<html><body><script>import("/_app/immutable/entry/start.C3xK9a.js")</script>';

    expect(entryModulePath(html)).toBe('/_app/immutable/entry/start.C3xK9a.js');
  });

  // Server-rendered markup answers every selector whether or not the app
  // hydrated, so "the page loaded" proves nothing about the build behind it.
  it('reports no entry for a page that names none', () => {
    expect(entryModulePath('<html><body><canvas></canvas></body></html>')).toBeNull();
    expect(entryModulePath(undefined)).toBeNull();
  });
});

describe('buildDirHoldsNativeExport', () => {
  it('recognises the native export by the web-only files it drops', () => {
    expect(buildDirHoldsNativeExport(writeEmptyFiles(scratch(), ['index.html']))).toBe(true);
  });

  it('accepts a build that kept them', () => {
    const dir = writeEmptyFiles(scratch(), ['index.html', ...WEB_ONLY_STATIC_FILES]);

    expect(buildDirHoldsNativeExport(dir)).toBe(false);
  });

  it('says nothing about a directory with no build in it', () => {
    expect(buildDirHoldsNativeExport(join(scratch(), 'absent'))).toBe(false);
  });
});

describe('servedBuildFingerprintProblem', () => {
  it('accepts a build served byte for byte', async () => {
    const dir = fakeBuild();

    expect(
      await servedBuildFingerprintProblem('http://x/', { fetchText: serveFrom(dir), buildDir: dir })
    ).toBeNull();
  });

  it('rejects a web/build a native build overwrote', async () => {
    const dir = fakeBuild();
    for (const file of WEB_ONLY_STATIC_FILES) rmSync(join(dir, file));

    expect(
      await servedBuildFingerprintProblem('http://x/', { fetchText: serveFrom(dir), buildDir: dir })
    ).toMatch(/native static export/);
  });

  // The regression this covers: matching the ENTRY FILENAME is not identity. The
  // entry is runtime plumbing that can be byte-identical while application chunks
  // differ, so a foreign URL plus this checkout's entry path passed unchallenged.
  it('rejects a build whose entry matches but whose application chunk differs', async () => {
    const dir = fakeBuild();
    const fetchText = serveFrom(dir, (path, body) =>
      path.endsWith('app.Bbb.js') ? `${body}\n/* different build */` : body
    );

    expect(await servedBuildFingerprintProblem('http://x/', { fetchText, buildDir: dir })).toMatch(
      /different content/
    );
  });

  it('rejects a chunk this checkout does not have at all', async () => {
    const dir = fakeBuild();
    const fetchText = async (url) =>
      new URL(url, 'http://x/').pathname === '/'
        ? '<script>import("/_app/immutable/entry/start.NotOurs.js")</script>'
        : '';

    expect(await servedBuildFingerprintProblem('http://x/', { fetchText, buildDir: dir })).toMatch(
      /does not contain/
    );
  });

  it('rejects a page that references no application chunks', async () => {
    const dir = fakeBuild();
    const fetchText = async () => '<html><body></body></html>';

    expect(await servedBuildFingerprintProblem('http://x/', { fetchText, buildDir: dir })).toMatch(
      /references no application chunks/
    );
  });
});
