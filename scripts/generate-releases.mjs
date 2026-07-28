// Generates every artifact derived from releases/*.md (the source of truth):
//   - src/lib/releases.json                                    (in-app About tab)
//   - fastlane/metadata/android/en-US/changelogs/<code>.txt    (Google Play)
//   - fastlane/metadata/en-US/release_notes.txt                (App Store, latest)
//
// Run directly (`node scripts/generate-releases.mjs`) or via the pre* npm hooks.
// It never touches version numbers — that is release.mjs's job.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { marked } from 'marked';
import { ROOT, fail, isMain } from './lib/proc.mjs';
import { parseFrontmatter, compareSemverDesc, writeFileDeep } from './lib/frontmatter.mjs';

const RELEASES_DIR = join(ROOT, 'releases');
const ANDROID_CHANGELOG_LIMIT = 500; // Google Play "What's new" hard limit.

function parseRelease(filename) {
  const parsed = parseFrontmatter(readFileSync(join(RELEASES_DIR, filename), 'utf8'));
  if (!parsed) fail(`${filename}: missing or malformed frontmatter`);
  return { filename, meta: parsed.meta, body: parsed.body };
}

// Markdown -> plain text for the store changelogs.
function toPlainText(body) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      let l = line.replace(/^#{1,6}\s+/, ''); // headings -> bare label
      l = l.replace(/^\s*[-*]\s+/, '• '); // list item -> bullet
      l = l.replace(/\*\*(.+?)\*\*/g, '$1'); // bold
      l = l.replace(/(?<!\*)\*(?!\*)(.+?)\*/g, '$1'); // italic
      l = l.replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)'); // links -> text (url)
      l = l.replace(/`(.+?)`/g, '$1'); // inline code
      return l.trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateStoreText(text) {
  if (/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*?)?\s*\/?>/.test(text)) {
    throw new Error('Store text contains HTML/XML-like markup');
  }
}

function write(path, contents) {
  writeFileDeep(path, contents);
  console.log(`  wrote ${relative(ROOT, path)}`);
}

function main() {
  if (!existsSync(RELEASES_DIR)) fail(`No releases/ directory at ${RELEASES_DIR}`);

  const releases = readdirSync(RELEASES_DIR)
    .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
    .map(parseRelease)
    .sort((a, b) => compareSemverDesc(a.meta.version, b.meta.version));

  if (releases.length === 0) fail('No release files found in releases/ (expected e.g. 1.0.0.md)');

  console.log(`Generating release artifacts from ${releases.length} release file(s)…`);

  // 1. In-app About tab data. Body is our own first-party Markdown, rendered to
  //    static HTML at build time, so {@html} in Svelte is safe and there is no
  //    runtime Markdown dependency.
  const appData = releases.map((r) => ({
    version: r.meta.version,
    date: r.meta.date,
    bodyHtml: marked.parse(r.body).trim(),
  }));
  write(join(ROOT, 'web', 'src', 'lib', 'releases.json'), JSON.stringify(appData, null, 2) + '\n');

  const androidChangelogs = releases
    .filter((r) => r.meta.androidVersionCode)
    .map((release) => ({ release, text: toPlainText(release.body) }));
  const appStoreText = toPlainText(releases[0].body);
  for (const { text } of androidChangelogs) validateStoreText(text);
  validateStoreText(appStoreText);

  // 2. Google Play changelogs — one file per versionCode (supply layout).
  for (const { release, text } of androidChangelogs) {
    write(
      join(
        ROOT,
        'fastlane',
        'metadata',
        'android',
        'en-US',
        'changelogs',
        `${release.meta.androidVersionCode}.txt`
      ),
      text + '\n'
    );
    if (release === releases[0] && text.length > ANDROID_CHANGELOG_LIMIT) {
      console.warn(
        `  ⚠ ${release.filename}: Android changelog is ${text.length} chars ` +
          `(Play limit ${ANDROID_CHANGELOG_LIMIT}). Trim before uploading.`
      );
    }
  }

  // 3. App Store "What's New" — deliver uploads a single current value, so only
  //    the latest release goes here, overwritten each time.
  write(join(ROOT, 'fastlane', 'metadata', 'en-US', 'release_notes.txt'), appStoreText + '\n');

  console.log('Done.');
}

if (isMain(import.meta.url)) main();
