// Rewrites MANIFEST.json from the files beside it. Run after changing any packaged file.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  );
const files = walk(root)
  .map((path) => relative(root, path))
  .filter((path) => !['MANIFEST.json', 'README.md', 'check.mjs', 'compare.mjs', 'lib.mjs', 'package.mjs'].includes(path))
  .sort()
  .map((path) => ({
    path,
    sha256: createHash('sha256').update(readFileSync(join(root, path))).digest('hex'),
  }));
writeFileSync(join(root, 'MANIFEST.json'), `${JSON.stringify({ files }, null, 2)}\n`);
console.log(`${files.length} files`);
