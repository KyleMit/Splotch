// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SITE_ORIGIN } from './lib/siteUrl';

// static/sitemap.xml is hand-written and nothing derives it from the route
// tree it advertises, so adding a public page and forgetting the entry leaves
// that page undiscoverable with the whole suite still green — how /changelog
// and /beta stayed unlisted after they shipped. This is the mechanical guard on
// that agreement, in both directions: a deleted page has to leave the sitemap
// too, or crawlers keep being sent somewhere that 404s.
//
// robots.txt supplies the other half of the derivation. A path it disallows
// must not also be advertised, so its Disallow rules are what exclude /admin
// and the /dev harness — a second exception list here would be one more copy
// free to drift from the first.

// The paths stay parameters: Vite rewrites a `new URL('./literal',
// import.meta.url)` into the served asset's http URL, which the fs calls reject
// (precedent: app.html.test.ts, lib/design/trimGeometry.test.ts).
const resolve = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(resolve(path), 'utf8');

const robots = read('../static/robots.txt');
const sitemap = read('../static/sitemap.xml');

// A route directory renders a page only if it holds a +page.svelte. That is
// also what keeps the /android-beta and /ios-beta redirects out: they are
// +page.ts loads with nothing to render, and a redirect is not a sitemap entry.
function pageRoutes(dir: URL, path = ''): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const self = entries.some((entry) => entry.isFile() && entry.name === '+page.svelte');
  const children = entries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => pageRoutes(new URL(`${entry.name}/`, dir), `${path}/${entry.name}`));
  return self ? [path || '/', ...children] : children;
}

const routes = pageRoutes(resolve('./routes/'));

// Robots rules match on path prefix, so `Disallow: /dev` covers the harness
// index and everything under it alike.
const disallowRules = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((match) => match[1]);
const isDisallowed = (route: string) => disallowRules.some((rule) => route.startsWith(rule));

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const listedPaths = locs.map((loc) => loc.slice(SITE_ORIGIN.length));

it('advertises every crawlable page route, and only those', () => {
  const crawlable = routes.filter((route) => !isDisallowed(route));
  expect([...listedPaths].sort()).toEqual([...crawlable].sort());
});

it('enumerates each route statically, so the crawlable set is knowable', () => {
  expect(routes.filter((route) => route.includes('['))).toEqual([]);
});

it('writes every entry as an absolute URL on the canonical origin', () => {
  expect(locs.filter((loc) => !loc.startsWith(`${SITE_ORIGIN}/`))).toEqual([]);
});

it('lists each URL once', () => {
  expect(listedPaths).toHaveLength(new Set(listedPaths).size);
});

it('points crawlers from robots.txt at the sitemap that ships beside it', () => {
  expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
});
