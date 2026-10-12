import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { onTestFinished } from 'vitest';
import { WEB_ONLY_STATIC_FILES } from '../../mobile/lib/static-export.mjs';

export function writeEmptyFiles(directory, files) {
  for (const file of files) {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '');
  }
  return directory;
}

export function createWebBuildFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-build-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
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
