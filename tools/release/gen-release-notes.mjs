// Generates every file derived from releases/*.md (the source of truth): the in-app
// release data and notes, the full changelog, and the store changelogs.
// releaseNoteOutputs() lists each file a run writes, and releaseNoteOutputPaths()
// hands cut-release.mjs the same paths.
//
// Run directly (`node tools/release/gen-release-notes.mjs`) or via the pre* npm hooks.
// It never touches version numbers — that is cut-release.mjs's job.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from '../lib/html.mjs';
import { ROOT, fail, isMain } from '../lib/proc.mjs';
import {
  assertVersionMatchesFilename,
  parseFrontmatter,
  compareSemverDesc,
  writeFileDeep,
} from './lib/release-frontmatter.mjs';
import { renderReleaseMarkdown } from './lib/release-markdown.mjs';

export const RELEASE_HUES = ['Purple', 'Blue', 'Green', 'Orange', 'Pink', 'Red'];
export const RELEASES_SHOWN_OPEN = 3;

const RELEASES_DIR = join(ROOT, 'releases');
const ANDROID_CHANGELOG_LIMIT = 500; // Google Play "What's new" hard limit.
const ISO_RELEASE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_BUNDLED_RELEASE_PHRASES = ['Google Play', 'Play Store', 'App Store'];
// The app's body copy sets em dashes open ("Night Mode — Light"); one closed
// on either side ("app—plus", "app— plus") reads as a different house style
// beside it on /changelog.
// Longest form first, so a dash closed on both sides reports both neighbours.
const CLOSED_EM_DASH = /\S—\S|\S—|—\S/;
// The section vocabulary is owned by web/src/lib/releaseSections.ts, which this
// plain-node script cannot import ($lib alias, deferred-icon registration);
// web/src/lib/releaseSections.test.ts fails when the two diverge.
export const RELEASE_SECTION_TITLES = new Set(['New', 'Improved', 'Fixed']);
const MARKDOWN_SECTION_HEADING_LEVEL = 2;
const DEEPEST_HEADING_LEVEL = 6;
// Settings' What's New heads the release with its date one level under the
// section title of whichever Settings shell shows it, so the compiled notes take
// the level of their sections as a `headingLevel` prop. WhatsNewSection passes
// one of these; svelte-check fails on the generated component if it passes any
// other, and WhatsNewSection.headingOutline.test.ts pins the nesting under the
// date for each.
const CURRENT_RELEASE_SECTION_HEADING_LEVELS = [4, 5];
// The changelog heads each release with an <h2> "Version x".
const RELEASE_HISTORY_SECTION_HEADING_LEVEL = 3;

function parseRelease(filename) {
  return parseReleaseSource(filename, readFileSync(join(RELEASES_DIR, filename), 'utf8'));
}

export function parseReleaseSource(filename, source) {
  const parsed = parseFrontmatter(source);
  if (!parsed) throw new Error(`${filename}: missing or malformed frontmatter`);
  assertVersionMatchesFilename(filename, parsed.meta.version);
  validateBundledReleaseText(parsed.body, filename);
  validateEmDashSpacing(parsed.body, filename);
  const isoDate = parsed.meta.date;
  if (!ISO_RELEASE_DATE.test(isoDate)) {
    throw new Error(`${filename}: date must use YYYY-MM-DD`);
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`${filename}: date must be a real calendar date`);
  }
  const dateLabel = date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return { filename, meta: parsed.meta, body: parsed.body, dateLabel };
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

export function validateEmDashSpacing(text, filename = 'release notes') {
  const match = CLOSED_EM_DASH.exec(text);
  if (match) {
    throw new Error(
      `${filename}: em dashes are set open in this app's copy — put a space on both sides of "${match[0]}"`
    );
  }
}

export function validateBundledReleaseText(text, filename = 'release notes') {
  const lowerText = text.toLocaleLowerCase('en-US');
  const phrase = FORBIDDEN_BUNDLED_RELEASE_PHRASES.find((candidate) =>
    lowerText.includes(candidate.toLocaleLowerCase('en-US'))
  );
  if (phrase) {
    throw new Error(
      `${filename}: release notes are bundled on web, Android, and iOS and must not name ${phrase}`
    );
  }
}

function indentStaticHtml(html) {
  let depth = 1;
  return html
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const closingTag = /^<\/([a-z][\w-]*)>/i.exec(trimmed)?.[1];
      if (closingTag) depth -= 1;
      const indented = `${'  '.repeat(depth)}${trimmed}`;
      const openingTag = /^<([a-z][\w-]*)(?:\s[^>]*)?>/i.exec(trimmed)?.[1];
      if (openingTag && !trimmed.endsWith('/>') && !trimmed.includes(`</${openingTag}>`))
        depth += 1;
      return indented;
    })
    .join('\n');
}

function escapeSvelteBraces(html) {
  return html.replaceAll('{', '&#123;').replaceAll('}', '&#125;');
}

export function releaseAnchor(version) {
  return `release-${version.replaceAll('.', '-')}`;
}

// Each app surface moves the Markdown's `##` sections under its own heading for
// the release, so the whole body shifts down by the difference.
// A heading pushed past h6 stops there, the deepest level Markdown has.
function nestMarkdownHeadings(body, headingLevel) {
  const deeper = '#'.repeat(headingLevel - MARKDOWN_SECTION_HEADING_LEVEL);
  return body.replace(/^#{1,6}(?=\s)/gm, (heading) =>
    `${heading}${deeper}`.slice(0, DEEPEST_HEADING_LEVEL)
  );
}

// The same shift as nestMarkdownHeadings, made at render time: a Svelte
// expression for a Markdown heading's level over the `headingLevel` prop.
function currentReleaseHeadingLevel(markdownLevel) {
  const depth = markdownLevel - MARKDOWN_SECTION_HEADING_LEVEL;
  if (depth === 0) return 'headingLevel';
  if (depth < 0) return `headingLevel - ${-depth}`;
  return `Math.min(headingLevel + ${depth}, ${DEEPEST_HEADING_LEVEL})`;
}

function renderCurrentReleaseMarkdown(body) {
  const html = escapeSvelteBraces(renderReleaseMarkdown(body).trim());
  return html.replace(/<h([1-6])>(.*?)<\/h\1>/g, (_heading, markdownLevel, content) => {
    const level = currentReleaseHeadingLevel(Number(markdownLevel));
    return level === 'headingLevel' && RELEASE_SECTION_TITLES.has(content)
      ? `<ReleaseSectionHeading title="${content}" level={headingLevel} />`
      : `<svelte:element this={\`h\${${level}}\`}>${content}</svelte:element>`;
  });
}

function renderAppReleaseMarkdown(body, headingLevel) {
  const html = escapeSvelteBraces(
    renderReleaseMarkdown(nestMarkdownHeadings(body, headingLevel)).trim()
  );
  return html.replace(
    new RegExp(`<h${headingLevel}>([^<]+)</h${headingLevel}>`, 'g'),
    (heading, title) =>
      RELEASE_SECTION_TITLES.has(title)
        ? `<ReleaseSectionHeading title="${title}" level={${headingLevel}} />`
        : heading
  );
}

export function renderReleaseComponent(body, filename) {
  const sections = body
    .trim()
    .split(/(?=^##\s)/m)
    .filter(Boolean);
  const markup = sections
    .map((section, index) => {
      const html = renderCurrentReleaseMarkdown(section);
      return `{#if visibleSections >= ${index + 1}}\n${indentStaticHtml(html)}\n{/if}`;
    })
    .join('\n');
  const headingLevelType = CURRENT_RELEASE_SECTION_HEADING_LEVELS.join(' | ');
  return (
    `<script module lang="ts">\n  export const RELEASE_NOTE_SECTION_COUNT = ${sections.length};\n</script>\n\n` +
    `<script lang="ts">\n  import ReleaseSectionHeading from '$lib/components/ReleaseSectionHeading.svelte';\n\n` +
    `  let {\n    headingLevel,\n    visibleSections = RELEASE_NOTE_SECTION_COUNT,\n  }: { headingLevel: ${headingLevelType}; visibleSections?: number } = $props();\n</script>\n\n` +
    `<!-- Generated by tools/release/gen-release-notes.mjs from releases/${filename}. -->\n${markup}\n`
  );
}

export function renderReleaseHueModule() {
  return `// Generated by tools/release/gen-release-notes.mjs.
import type { PaletteLabel } from '$lib/palette';

export const RELEASE_HUES = ${JSON.stringify(RELEASE_HUES)} as const satisfies readonly PaletteLabel[];
export type ReleaseHue = (typeof RELEASE_HUES)[number];

export function parseReleaseHue(value: unknown): ReleaseHue {
  for (const hue of RELEASE_HUES) if (value === hue) return hue;
  throw new Error(\`Unknown release hue: \${String(value)}\`);
}
`;
}

export function renderReleaseMetadata(releases) {
  return releases.map((release, index) => ({
    version: release.meta.version,
    id: releaseAnchor(release.meta.version),
    datetime: release.meta.date,
    dateLabel: release.dateLabel,
    hue: RELEASE_HUES[index % RELEASE_HUES.length],
  }));
}

export function renderReleaseHistory(releases) {
  const articles = releases.map((release, index) => {
    const version = esc(release.meta.version);
    const isoDate = esc(release.meta.date);
    const dateLabel = esc(release.dateLabel);
    const notes = renderAppReleaseMarkdown(
      release.body,
      RELEASE_HISTORY_SECTION_HEADING_LEVEL
    ).replaceAll('<ul>', '<ul role="list">');
    const hue = RELEASE_HUES[index % RELEASE_HUES.length];
    return (
      `<article class="release" id="${releaseAnchor(release.meta.version)}" data-hue="${hue}">\n` +
      `  <SquiggleRule />\n` +
      `  <header class="release-header">\n` +
      `    <div class="release-title"><h2>Version ${version}</h2>${index === 0 ? '<span class="release-latest">Latest</span>' : ''}</div>\n` +
      `    <div class="release-date"><time datetime="${isoDate}">${dateLabel}</time><span class="release-ago" data-ago-for="${isoDate}" aria-hidden="true"></span></div>\n` +
      `  </header>\n` +
      `  <div class="release-notes">\n${notes}\n  </div>\n` +
      `</article>`
    );
  });
  const olderCount = Math.max(0, releases.length - RELEASES_SHOWN_OPEN);
  const older = olderCount
    ? `<details class="release-older" data-older-count="${olderCount}">\n<summary class="release-older-toggle"><span class="older-blob" aria-hidden="true"><Icon name="chevron-left" class="older-icon" /></span>Show ${olderCount} older ${olderCount === 1 ? 'release' : 'releases'}</summary>\n<SquiggleRule />\n${articles.slice(RELEASES_SHOWN_OPEN).join('\n\n')}\n</details>`
    : '';
  const history = [...articles.slice(0, RELEASES_SHOWN_OPEN), older].filter(Boolean).join('\n\n');

  return (
    "<script lang=\"ts\">\n  import ReleaseSectionHeading from '$lib/components/ReleaseSectionHeading.svelte';\n  import SquiggleRule from '$lib/components/design/SquiggleRule.svelte';\n  import Icon from '$pageIcon';\n</script>\n\n" +
    '<!-- Generated by tools/release/gen-release-notes.mjs from every releases/*.md file. -->\n' +
    `<div class="release-history">\n${indentStaticHtml(history)}\n</div>\n`
  );
}

// Every release document, newest first.
export function readReleases() {
  if (!existsSync(RELEASES_DIR)) throw new Error(`No releases/ directory at ${RELEASES_DIR}`);
  const releases = readdirSync(RELEASES_DIR)
    .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
    .map(parseRelease)
    .sort((a, b) => compareSemverDesc(a.meta.version, b.meta.version));
  if (releases.length === 0) {
    throw new Error('No release files found in releases/ (expected e.g. 1.0.0.md)');
  }
  return releases;
}

function storeText(body) {
  const text = toPlainText(body);
  validateStoreText(text);
  return text;
}

// In-app What's New data. Svelte compiles the current release's first-party
// Markdown into ordinary DOM creation instead of parsing HTML on the response frame.
function appOutputs(releases) {
  const [latest] = releases;
  return [
    { path: 'web/src/lib/releaseHues.ts', render: renderReleaseHueModule },
    {
      path: 'web/src/lib/releases.json',
      render: () => `${JSON.stringify(renderReleaseMetadata(releases), null, 2)}\n`,
    },
    {
      path: 'web/src/lib/components/settings/CurrentReleaseNotes.svelte',
      render: () => renderReleaseComponent(latest.body, latest.filename),
    },
    {
      path: 'web/src/lib/components/page/ReleaseHistory.svelte',
      render: () => renderReleaseHistory(releases),
    },
  ];
}

// Google Play changelogs — one file per versionCode (supply layout).
function playChangelogOutputs(releases) {
  return releases
    .filter((release) => release.meta.androidVersionCode)
    .map((release) => ({
      path: `fastlane/metadata/android/en-US/changelogs/${release.meta.androidVersionCode}.txt`,
      render: () => `${storeText(release.body)}\n`,
    }));
}

// App Store "What's New" — deliver uploads a single current value, so only the
// latest release goes here, overwritten each time.
function appStoreOutputs([latest]) {
  return [
    {
      path: 'fastlane/metadata/en-US/release_notes.txt',
      render: () => `${storeText(latest.body)}\n`,
    },
  ];
}

// Every file a run writes, as a repo-relative path and its renderer, in write order.
function releaseNoteOutputs(releases) {
  return [...appOutputs(releases), ...playChangelogOutputs(releases), ...appStoreOutputs(releases)];
}

export const releaseNoteOutputPaths = (releases) =>
  releaseNoteOutputs(releases).map(({ path }) => path);

function warnIfAndroidChangelogTooLong(latest) {
  if (!latest.meta.androidVersionCode) return;
  const { length } = toPlainText(latest.body);
  if (length > ANDROID_CHANGELOG_LIMIT) {
    console.warn(
      `  ⚠ ${latest.filename}: Android changelog is ${length} chars ` +
        `(Play limit ${ANDROID_CHANGELOG_LIMIT}). Trim before uploading.`
    );
  }
}

function main() {
  const releases = readReleases();
  console.log(`Generating release notes from ${releases.length} release file(s)…`);
  // Rendering validates each store text, so a refusal comes before the first write.
  const outputs = releaseNoteOutputs(releases).map(({ path, render }) => ({
    path,
    contents: render(),
  }));
  for (const { path, contents } of outputs) {
    writeFileDeep(join(ROOT, path), contents);
    console.log(`  wrote ${path}`);
  }
  warnIfAndroidChangelogTooLong(releases[0]);
  console.log('Done.');
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
