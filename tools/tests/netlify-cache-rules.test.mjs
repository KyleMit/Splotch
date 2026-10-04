import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coloringPackManifestPath } from '../../web/src/lib/coloringPacks/manifest.ts';
import { PAGE_CACHE_CLEANUP_SCRIPT_PREFIX } from '../../web/src/lib/pwa/pageCacheCleanup.ts';
import { VERSION_JSON_PATH } from '../../web/src/lib/pwa/versionEndpoint.ts';

// A browser reuses a fresh cached file without asking the server, so a rule that
// outlives the week ADR-0042 allows a stable filename, or says `immutable`, would
// pin an unhashed file's old bytes on each device that fetched it. Netlify reads
// netlify.toml as literal TOML, so it cannot import the names below.
const STABLE_NAME_MAX_AGE_SECONDS = 604_800;

// Each name carries a content hash or the app version, so its bytes never change.
const FIXED_CONTENT_GLOBS = [
  // vite-plugin-pwa's Workbox runtime filename; no repo constant owns its prefix.
  '/workbox-*.js',
  `/${PAGE_CACHE_CLEANUP_SCRIPT_PREFIX}*.js`,
  coloringPackManifestPath('*'),
];

// vite-plugin-pwa's worker and the deployed-version probe revalidate on every request.
const REVALIDATED_PATHS = ['/sw.js', VERSION_JSON_PATH];
const REVALIDATE_EVERY_REQUEST = 'no-cache, no-store, must-revalidate';

const FOR_LINE = /^for = "([^"]+)"$/;
const CACHE_CONTROL_LINE = /^Cache-Control = "([^"]+)"$/;
const FOR_KEY = /^["']?for["']?\s*=/;
const CACHE_TERM = /cache-control|immutable|\bexpires\b/i;
const MULTILINE_DELIMITER = /"""|'''/g;

// Reads every [[headers]] rule that sets Cache-Control, in file order. A line in
// any other spelling that mentions a cache term or a `for` key throws, so a rule
// written another valid TOML way fails the guard instead of slipping past it.
function cacheControlRules(toml) {
  const rules = [];
  let table = 'other';
  let rule;
  let inMultilineString = false;
  for (const [index, rawLine] of toml.split('\n').entries()) {
    const line = rawLine.trim();
    const unreadable = () =>
      new Error(`line ${index + 1} is a spelling this guard cannot read: ${line}`);
    const togglesString = (line.match(MULTILINE_DELIMITER) ?? []).length % 2 === 1;
    if (inMultilineString || (togglesString && !line.startsWith('#'))) {
      if (CACHE_TERM.test(line)) throw unreadable();
      if (togglesString) inMultilineString = !inMultilineString;
      continue;
    }
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      if (line === '[[headers]]') {
        rule = {};
        rules.push(rule);
        table = 'rule';
      } else if (line === '[headers.values]' && table === 'rule') {
        table = 'values';
      } else if (/headers/i.test(line)) {
        throw unreadable();
      } else {
        table = 'other';
      }
      continue;
    }
    const path = table === 'rule' ? line.match(FOR_LINE)?.[1] : undefined;
    const cacheControl = table === 'values' ? line.match(CACHE_CONTROL_LINE)?.[1] : undefined;
    if (path !== undefined) rule.path = path;
    else if (cacheControl !== undefined) rule.cacheControl = cacheControl;
    else if (CACHE_TERM.test(line) || FOR_KEY.test(line)) throw unreadable();
  }
  return rules
    .filter(({ cacheControl }) => cacheControl !== undefined)
    .map(({ path, cacheControl }) => {
      if (path === undefined) throw new Error(`Cache-Control "${cacheControl}" has no for path`);
      return { path, cacheControl };
    });
}

function outlivesStableName(cacheControl) {
  const directives = cacheControl.split(',').map((directive) => directive.trim().toLowerCase());
  const maxAge = directives.find((directive) => directive.startsWith('max-age='));
  if (maxAge !== undefined && !/^max-age=\d+$/.test(maxAge)) {
    throw new Error(`Cache-Control "${cacheControl}" has an unreadable max-age`);
  }
  const maxAgeSeconds = Number(maxAge?.slice('max-age='.length) ?? 0);
  return directives.includes('immutable') || maxAgeSeconds > STABLE_NAME_MAX_AGE_SECONDS;
}

function longLivedGlobs(rules) {
  return rules
    .filter(({ cacheControl }) => outlivesStableName(cacheControl))
    .map(({ path }) => path);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rulesMatching(rules, path) {
  return rules.filter((rule) =>
    new RegExp(`^${rule.path.split('*').map(escapeRegExp).join('.*')}$`).test(path)
  );
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const headerRule = (path, cacheControl) =>
  `[[headers]]\n  for = "${path}"\n  [headers.values]\n    Cache-Control = "${cacheControl}"\n`;
const allowedRules = [
  ...FIXED_CONTENT_GLOBS.map((glob) => headerRule(glob, IMMUTABLE)),
  ...REVALIDATED_PATHS.map((path) => headerRule(path, REVALIDATE_EVERY_REQUEST)),
].join('\n');
const broadScriptRule = headerRule('/*.js', IMMUTABLE);

describe('netlify.toml Cache-Control rules', () => {
  const netlifyRules = () =>
    cacheControlRules(readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8'));

  it('caches only fixed-content names immutable or for longer than a week', () => {
    expect(longLivedGlobs(netlifyRules()).sort()).toEqual([...FIXED_CONTENT_GLOBS].sort());
  });

  it.each(REVALIDATED_PATHS)('%s takes its Cache-Control from its own rule alone', (path) => {
    expect(rulesMatching(netlifyRules(), path)).toEqual([
      { path, cacheControl: REVALIDATE_EVERY_REQUEST },
    ]);
  });

  // adapter-netlify publishes web/_headers' rules and refuses a static/_headers outright.
  it('has no web/_headers, whose rules would reach the deploy unread by this guard', () => {
    expect(existsSync(new URL('_headers', new URL('../../web/', import.meta.url)))).toBe(false);
  });
});

describe('the Cache-Control rule reader', () => {
  it('passes a config holding exactly the fixed-content families', () => {
    const rules = cacheControlRules(allowedRules);
    expect(longLivedGlobs(rules).sort()).toEqual([...FIXED_CONTENT_GLOBS].sort());
    expect(REVALIDATED_PATHS.map((path) => rulesMatching(rules, path).length)).toEqual([1, 1]);
  });

  it('flags an immutable /*.js rule as an unhashed family that also reaches /sw.js', () => {
    const rules = cacheControlRules(broadScriptRule + allowedRules);
    expect(longLivedGlobs(rules)).toContain('/*.js');
    expect(rulesMatching(rules, '/sw.js').map(({ path }) => path)).toEqual(['/*.js', '/sw.js']);
  });

  it('treats a max-age past a week as long-lived without immutable', () => {
    const rules = cacheControlRules(
      headerRule('/sounds/*', 'public, max-age=604800') +
        headerRule('/*.css', 'public, max-age=604801')
    );
    expect(longLivedGlobs(rules)).toEqual(['/*.css']);
  });

  it('skips a commented-out rule, as Netlify does', () => {
    const commentedOut = broadScriptRule.replace(/^(?=.)/gm, '# ');
    expect(cacheControlRules(commentedOut + allowedRules)).toEqual(cacheControlRules(allowedRules));
  });

  it.each([
    ['spaced table brackets', broadScriptRule.replace('[[headers]]', '[[ headers ]]')],
    ['a quoted header name', broadScriptRule.replace('Cache-Control', '"Cache-Control"')],
    ['a lowercase header name', broadScriptRule.replace('Cache-Control', 'cache-control')],
    ['a literal-string value', broadScriptRule.replace(`"${IMMUTABLE}"`, `'${IMMUTABLE}'`)],
    ['a multi-line value', broadScriptRule.replace(`"${IMMUTABLE}"`, `"""\n${IMMUTABLE}"""`)],
    [
      'an inline values table',
      `[[headers]]\n  for = "/*.js"\n  values = { Cache-Control = "${IMMUTABLE}" }\n`,
    ],
    ['a literal-string for path', broadScriptRule.replace('"/*.js"', "'/*.js'")],
    [
      'Cache-Control outside a values table',
      `[build.environment]\n  Cache-Control = "${IMMUTABLE}"\n`,
    ],
    [
      'an Expires header',
      broadScriptRule.replace(/Cache-Control = .*/, 'Expires = "Fri, 01 Jan 2100"'),
    ],
  ])('refuses %s', (_spelling, toml) => {
    expect(() => cacheControlRules(toml)).toThrow(/cannot read/);
  });

  it('refuses a Cache-Control rule with no for path', () => {
    const pathless = broadScriptRule.replace(/^ {2}for = .*\n/m, '');
    expect(() => cacheControlRules(pathless)).toThrow(/has no for path/);
  });
});
