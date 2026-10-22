import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_FILE,
  HOSTED_STATIC_ENTRIES,
  NATIVE_WEB_SERVICE_WORKER,
  NOT_FOUND_FILE,
  WEB_MANIFEST_FILE,
} from '../migration/build-native-web.mjs';
import { writtenPageDocuments } from '../migration/prerender-native-web-pages.mjs';
import { VERSION_JSON_FILENAME } from '../../src/lib/pwa/versionEndpoint.ts';

// A header rule whose `for` names a path nothing serves applies to nothing and fails silently,
// which is how the manifest once shipped as application/octet-stream. Netlify reads netlify.toml as
// literal TOML, so it cannot import the published names; this is their drift guard against what
// build-native-web.mjs publishes.

const netlifyToml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');

function headerRules(toml) {
  return toml
    .split(/^\[\[headers\]\]\s*$/m)
    .slice(1)
    .map((block) => {
      const path = block.match(/^\s*for = "([^"]+)"/m)?.[1];
      if (path === undefined) throw new Error(`[[headers]] block without a for path:\n${block}`);
      return { path, values: block.split(/^\[\[/m)[0] };
    });
}

const SERVED_PATHS = new Set([
  '/',
  `/${APP_SHELL_FILE}`,
  `/${NOT_FOUND_FILE}`,
  `/${NATIVE_WEB_SERVICE_WORKER}`,
  `/${VERSION_JSON_FILENAME}`,
  `/${WEB_MANIFEST_FILE}`,
  ...writtenPageDocuments().flatMap(({ path, file }) => [path, `/${file}`]),
]);

function served(path) {
  if (SERVED_PATHS.has(path)) return true;
  const hosted = HOSTED_STATIC_ENTRIES.some(
    (entry) => path === `/${entry}` || path.startsWith(`/${entry}/`)
  );
  return hosted && existsSync(new URL(`../../assets/static${path}`, import.meta.url));
}

const rules = headerRules(netlifyToml);
const literalRules = rules.filter(({ path }) => !path.includes('*'));

describe('netlify.toml header paths', () => {
  it('found literal header rules to check', () => {
    expect(literalRules.length).toBeGreaterThan(0);
  });

  it.each(literalRules.map(({ path }) => path))('%s names a published file or page', (path) => {
    expect(served(path)).toBe(true);
  });

  it('serves the web manifest as application/manifest+json', () => {
    const rule = rules.find(({ path }) => path === `/${WEB_MANIFEST_FILE}`);
    expect(rule?.values).toMatch(/^\s*Content-Type = "application\/manifest\+json"$/m);
  });

  // The console lists every live access code once signed in (ADR-0101).
  it.each(['/admin', '/admin.html'])('never caches the admin console at %s', (path) => {
    const rule = rules.find((candidate) => candidate.path === path);
    expect(rule?.values).toMatch(/^\s*Cache-Control = "no-store"$/m);
  });
});
