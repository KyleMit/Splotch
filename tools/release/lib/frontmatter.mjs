import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Split a "---\nkey: value\n---\nbody" document. Returns null if the document
// has no frontmatter block. `frontmatter` is the raw text between the fences;
// `meta` is the parsed key/value pairs (flat — we never need nested YAML).
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const meta = {};
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z]\w*):\s*(.*)$/);
    if (!m) throw new Error(`Malformed frontmatter line ${index + 1}: ${line}`);
    meta[m[1]] = m[2].trim();
  }
  return { frontmatter: match[1], meta, body: match[2].trim() };
}

export function writeFileDeep(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

// What the release scripts accept as a version on the command line.
export const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

export function compareSemverDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}
