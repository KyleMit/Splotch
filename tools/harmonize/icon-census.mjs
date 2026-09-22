// Phase 1 of the UI harmonization pass (issue 1020): the icon → semantic role →
// call-site census, built from code alone. Uses the same quoted-literal rule as
// web/src/lib/components/icon-orphans.test.ts so the two can never disagree about
// what counts as a reference. Prints a Markdown report to stdout.
//   node tools/harmonize/icon-census.mjs > docs/scratchpad/harmonize-spike/icon-census.md

import { globSync, readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import { isSpot } from '../icons/lib/icon-chroma.mjs';

const ICON_GLOB = 'web/src/lib/icons/**/*.svg';
const SOURCE_GLOBS = ['web/src/**/*.svelte', 'web/src/**/*.ts'];
const EXCLUDED_SOURCES = /(\.test\.ts|\.d\.ts|components\/Icon\.svelte)$/;

// Concept families: icons that plausibly serve one UI idea. The census flags a
// family with more than one member in use, which is exactly the "two icons for
// one concept" question the harmonization pass exists to answer.
const CONCEPT_FAMILIES = {
  'disclosure chevron': /^chevron-/,
  'close / dismiss': /^(close|backspace)$/,
  'install to home screen': /^(add-homescreen|install-homescreen|home|share-ios)$/,
  'customize / controls': /^(customize|dashboard-customize|controls|setup)$/,
  'download / save': /^(download|save-picture|folder)$/,
  'camera / screenshot': /^camera(-party)?$/,
  'sound / volume': /^(sound|volume-on|volume-off)$/,
  'theme / appearance': /^(theme-|appearance)/,
  'orientation / device': /^(mobile-|phone-tablet)/,
  'brush tools': /^brush-/,
  'line weight': /^line-weight-/,
  'size previews': /^size-/,
  'release notes': /^(release-|whats-new)/,
  'dottie expressions': /^dottie-/,
  'trash / clear': /^trash-/,
  fullscreen: /^fullscreen/,
  'refresh / retry': /^(refresh|dottie-retry)$/,
};

const icons = globSync(ICON_GLOB, { cwd: ROOT }).map((path) => ({
  name: basename(path, '.svg'),
  deferred: path.includes('/deferred/'),
  spot: isSpot(readFileSync(`${ROOT}/${path}`, 'utf8')),
}));

const sources = SOURCE_GLOBS.flatMap((pattern) => globSync(pattern, { cwd: ROOT }))
  .filter((path) => !EXCLUDED_SOURCES.test(path))
  .map((path) => ({ path, text: readFileSync(`${ROOT}/${path}`, 'utf8') }));

function callSites(name) {
  const literal = new RegExp(`(['"])${name}\\1`);
  return sources
    .filter(({ text }) => literal.test(text))
    .map(({ path }) => relative('web/src/lib', path));
}

const rows = icons
  .map((icon) => ({ ...icon, sites: callSites(icon.name) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const line = (cells) => `| ${cells.join(' | ')} |`;
const out = [];
out.push('# Icon census (issue 1020, phase 1)');
out.push('');
out.push(
  `${rows.length} icons: ${rows.filter((r) => !r.deferred).length} startup, ${rows.filter((r) => r.deferred).length} deferred; ${rows.filter((r) => r.spot).length} spot (colorful) by the chroma classifier.`
);
out.push('');
out.push('## Concept families with more than one icon in use');
out.push('');
out.push(
  line([
    'Concept',
    'Icons in use (call sites)',
    'Icons shipped but unreferenced outside registries',
  ])
);
out.push(line(['---', '---', '---']));
for (const [concept, pattern] of Object.entries(CONCEPT_FAMILIES)) {
  const members = rows.filter((r) => pattern.test(r.name));
  const used = members.filter((r) => r.sites.length);
  const unused = members.filter((r) => !r.sites.length);
  out.push(
    line([
      concept,
      used.map((r) => `\`${r.name}\` (${r.sites.length})`).join(', ') || '—',
      unused.map((r) => `\`${r.name}\``).join(', ') || '—',
    ])
  );
}
out.push('');
out.push('## Every icon');
out.push('');
out.push(line(['Icon', 'Tier', 'Chroma', 'Sites', 'Call sites']));
out.push(line(['---', '---', '---', '---', '---']));
for (const r of rows) {
  out.push(
    line([
      `\`${r.name}\``,
      r.deferred ? 'deferred' : 'startup',
      r.spot ? 'spot' : 'mono',
      String(r.sites.length),
      r.sites.map((s) => `\`${s}\``).join(', '),
    ])
  );
}
console.log(out.join('\n'));
