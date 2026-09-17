// Usage: node inspect-store.mjs <coloring-root-dir> <manifest.json> <resolution> [label]
// Prints every directory under the root, each book's marker state, and checks the
// invariant: a book whose marker equals the manifest's marker value has every file
// present with the manifest's byte length and SHA-256. Also emits inode per file.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [root, manifestPath, resolution, label = ''] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const books = new Map(
  manifest.books.map((book) => {
    const variant = book.variants[resolution];
    const marker = JSON.stringify({
      id: book.id,
      bytes: variant.bytes,
      files: variant.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    });
    return [book.id, { ...variant, id: book.id, marker }];
  })
);
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const report = { label, root, resolution, topLevel: [], books: {}, violations: [], inodes: {} };
if (!existsSync(root)) {
  console.log(JSON.stringify({ ...report, missingRoot: true }, null, 2));
  process.exit(0);
}
report.topLevel = readdirSync(root);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
for (const top of report.topLevel) {
  const topDir = join(root, top);
  if (!statSync(topDir).isDirectory() || top === 'jobs') continue;
  for (const bookId of readdirSync(topDir)) {
    const dir = join(topDir, bookId);
    const markerFile = join(dir, '.installed');
    const book = books.get(bookId);
    const files = walk(dir);
    for (const file of files) report.inodes[file.slice(root.length + 1)] = statSync(file).ino;
    const hasMarker = existsSync(markerFile);
    const markerValue = hasMarker ? readFileSync(markerFile, 'utf8') : null;
    const trusted = top === resolution && !!book && markerValue === book.marker;
    let validFiles = 0;
    const bad = [];
    if (book) {
      for (const f of book.files) {
        const p = join(dir, f.path.slice(`/coloring/${bookId}/`.length));
        if (existsSync(p) && statSync(p).size === f.bytes && sha(p) === f.sha256) validFiles++;
        else bad.push(f.path);
      }
    }
    report.books[`${top}/${bookId}`] = {
      listed: !!book,
      files: files.length,
      marker: hasMarker ? (trusted ? 'trusted' : markerValue.length > 80 ? 'stale-json' : `other:${markerValue}`) : 'none',
      validFiles,
      expectedFiles: book?.files.length ?? null,
    };
    if (trusted && bad.length) report.violations.push({ book: `${top}/${bookId}`, bad });
  }
}
const summary = Object.fromEntries(Object.entries(report.books).map(([k, v]) => [k, `${v.marker} ${v.validFiles}/${v.expectedFiles} files=${v.files}`]));
console.log(JSON.stringify({ label, topLevel: report.topLevel, books: summary, violations: report.violations }, null, 2));
if (process.env.INODES_OUT) (await import('node:fs')).writeFileSync(process.env.INODES_OUT, JSON.stringify(report.inodes, null, 1));
if (report.violations.length) process.exitCode = 2;
