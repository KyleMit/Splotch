// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION_JSON_FILENAME } from './lib/pwa/versionEndpoint';

// A header rule whose `for` names a path nothing serves applies to nothing and
// fails silently — how the manifest shipped as application/octet-stream while
// its Content-Type rule named /manifest.webmanifest and app.html linked
// site.webmanifest. Netlify reads netlify.toml as literal TOML, so it cannot
// import the served names; this is their drift guard.

const repoRoot = resolve(process.cwd(), '..');
const netlifyToml = readFileSync(resolve(repoRoot, 'netlify.toml'), 'utf8');
const appHtml = readFileSync(resolve(process.cwd(), 'src', 'app.html'), 'utf8');
const staticDir = resolve(process.cwd(), 'static');

// Emitted by the build rather than committed under static/: sw.js is
// vite-plugin-pwa's default service-worker filename, and version.json is the
// build-version asset vite.config.ts emits.
const BUILD_EMITTED_PATHS = new Set(['/sw.js', `/${VERSION_JSON_FILENAME}`]);

interface HeaderRule {
  path: string;
  values: string;
}

function headerRules(toml: string): HeaderRule[] {
  return toml
    .split(/^\[\[headers\]\]\s*$/m)
    .slice(1)
    .map((block) => {
      const path = block.match(/^\s*for = "([^"]+)"/m)?.[1];
      if (path === undefined) throw new Error(`[[headers]] block without a for path:\n${block}`);
      return { path, values: block.split(/^\[\[/m)[0] };
    });
}

const rules = headerRules(netlifyToml);
const literalRules = rules.filter(({ path }) => !path.includes('*'));

describe('netlify.toml header paths', () => {
  it('found literal header rules to check', () => {
    expect(literalRules.length).toBeGreaterThan(0);
  });

  it.each(literalRules.map(({ path }) => path))('%s names a served file', (path) => {
    expect(BUILD_EMITTED_PATHS.has(path) || existsSync(resolve(staticDir, `.${path}`))).toBe(true);
  });

  it('serves the manifest app.html links as application/manifest+json', () => {
    const href = appHtml.match(/<link rel="manifest" href="%sveltekit\.assets%(\/[^"]+)"/)?.[1];
    expect(href, 'app.html links a manifest').toBeDefined();
    const rule = rules.find(({ path }) => path === href);
    expect(rule?.values).toMatch(/^\s*Content-Type = "application\/manifest\+json"$/m);
  });
});
