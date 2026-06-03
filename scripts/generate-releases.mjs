// Generates every artifact derived from releases/*.md (the source of truth):
//   - src/lib/releases.json                                    (in-app About tab)
//   - fastlane/metadata/android/en-US/changelogs/<code>.txt    (Google Play)
//   - fastlane/metadata/en-US/release_notes.txt                (App Store, latest)
//
// Run directly (`node scripts/generate-releases.mjs`) or via the pre* npm hooks.
// It never touches version numbers — that is release.mjs's job.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASES_DIR = join(ROOT, 'releases');

const ANDROID_CHANGELOG_LIMIT = 500; // Google Play "What's new" hard limit.

// --- parsing -------------------------------------------------------------

// Minimal `key: value` frontmatter reader — we never need nested YAML here.
function parseRelease(filename) {
  const raw = readFileSync(join(RELEASES_DIR, filename), 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: missing or malformed frontmatter`);

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w]*):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { filename, meta, body: match[2].trim() };
}

function semverDesc(a, b) {
  const pa = a.meta.version.split('.').map(Number);
  const pb = b.meta.version.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}

// Markdown -> plain text for the store changelogs.
function toPlainText(body) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      let l = line.replace(/^#{1,6}\s+/, '');        // headings -> bare label
      l = l.replace(/^\s*[-*]\s+/, '• ');         // list item -> bullet
      l = l.replace(/\*\*(.+?)\*\*/g, '$1');           // bold
      l = l.replace(/(?<!\*)\*(?!\*)(.+?)\*/g, '$1');  // italic
      l = l.replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)'); // links -> text (url)
      l = l.replace(/`(.+?)`/g, '$1');                 // inline code
      return l.trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  console.log(`  wrote ${path.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
}

// --- main ----------------------------------------------------------------

if (!existsSync(RELEASES_DIR)) {
  console.error(`No releases/ directory at ${RELEASES_DIR}`);
  process.exit(1);
}

const releases = readdirSync(RELEASES_DIR)
  .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
  .map(parseRelease)
  .sort(semverDesc);

if (releases.length === 0) {
  console.error('No release files found in releases/ (expected e.g. 1.0.0.md)');
  process.exit(1);
}

console.log(`Generating release artifacts from ${releases.length} release file(s)…`);

// 1. In-app About tab data. Body is our own first-party Markdown, rendered to
//    static HTML at build time, so {@html} in Svelte is safe and there is no
//    runtime Markdown dependency.
const appData = releases.map((r) => ({
  version: r.meta.version,
  date: r.meta.date,
  bodyHtml: marked.parse(r.body).trim()
}));
write(join(ROOT, 'src', 'lib', 'releases.json'), JSON.stringify(appData, null, 2) + '\n');

// 2. Google Play changelogs — one file per versionCode (supply layout).
for (const r of releases) {
  const code = r.meta.androidVersionCode;
  if (!code) continue; // not yet assigned (release.mjs fills it in)
  const text = toPlainText(r.body);
  write(
    join(ROOT, 'fastlane', 'metadata', 'android', 'en-US', 'changelogs', `${code}.txt`),
    text + '\n'
  );
  if (r === releases[0] && text.length > ANDROID_CHANGELOG_LIMIT) {
    console.warn(
      `  ⚠ ${r.filename}: Android changelog is ${text.length} chars ` +
        `(Play limit ${ANDROID_CHANGELOG_LIMIT}). Trim before uploading.`
    );
  }
}

// 3. App Store "What's New" — deliver uploads a single current value, so only
//    the latest release goes here, overwritten each time.
write(
  join(ROOT, 'fastlane', 'metadata', 'en-US', 'release_notes.txt'),
  toPlainText(releases[0].body) + '\n'
);

console.log('Done.');
