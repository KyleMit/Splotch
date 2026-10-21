import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { headersFor, readNetlifyConfig, redirectFor } from '../../e2e/server/netlifyConfig.ts';
import { NATIVE_WEB_EXPORT_DIR } from '../migration/build-native-web.mjs';
import { ROOT } from '../lib/proc.mjs';

// The RN web E2E server answers by what it reads from netlify.toml, so a rule it misread would be
// served as if the deploy had none, and every spec would pass against a site Netlify never serves.
const site = readNetlifyConfig(readFileSync(join(ROOT, 'netlify.toml'), 'utf8'));

const toml = (...lines) => lines.join('\n');

describe("the RN E2E server's netlify.toml reader", () => {
  it('serves the directory the export build writes', () => {
    expect(site.publish).toBe(relative(ROOT, NATIVE_WEB_EXPORT_DIR));
  });

  it("joins the Content-Security-Policy's continued lines as TOML does", () => {
    expect(headersFor(site.headers, '/privacy')['Content-Security-Policy']).toBe(
      "frame-ancestors 'none'; report-uri /api/csp-report"
    );
  });

  it('applies every matching header rule, a later one winning', () => {
    const { headers } = readNetlifyConfig(
      toml(
        '[build]',
        '  publish = "out"',
        '[[headers]]',
        '  for = "/*"',
        '  [headers.values]',
        '    Cache-Control = "no-cache"',
        "    X-Frame-Options = 'DENY'",
        '[[headers]]',
        '  for = "/static/*"',
        '  [headers.values]',
        '    Cache-Control = "immutable" # hashed names only'
      )
    );

    expect(headersFor(headers, '/static/app.js')).toEqual({
      'Cache-Control': 'immutable',
      'X-Frame-Options': 'DENY',
    });
    expect(headersFor(headers, '/index.html')['Cache-Control']).toBe('no-cache');
  });

  it("matches a splat redirect and hands the rest of the path to the target's :splat", () => {
    const { redirects } = readNetlifyConfig(
      toml('[build]', 'publish = "out"', '[[redirects]]', 'from = "/old/*"', 'to = "/new/:splat"')
    );

    expect(redirectFor(redirects, '/old/a/b')).toMatchObject({
      target: '/new/a/b',
      status: 301,
      force: false,
    });
    expect(redirectFor(redirects, '/other')).toBeNull();
  });

  it("reads the site's deny and retired-link rules", () => {
    expect(redirectFor(site.redirects, '/.env.local')).toMatchObject({
      target: '/deny.html',
      status: 404,
    });
    expect(redirectFor(site.redirects, '/ios-beta')).toMatchObject({
      target: '/beta?os=ios',
      status: 308,
    });
  });

  it.each([
    ['an escape', ['[[headers]]', 'for = "/*"', '[headers.values]', 'X-A = "\\u0041"']],
    ['a dotted key', ['[[headers]]', 'for = "/*"', 'headers.values.X-A = "a"']],
    ['a table it does not know', ['[[headers.values]]', 'X-A = "a"']],
    ['a redirect condition', ['[[redirects]]', 'from = "/a"', 'to = "/b"', 'query = "x"']],
    ['a placeholder', ['[[redirects]]', 'from = "/news/:year"', 'to = "/b"']],
    ['an unclosed string', ['[[headers]]', 'for = "/*"', '[headers.values]', 'X-A = """a']],
  ])('refuses %s instead of serving without it', (_spelling, lines) => {
    expect(() => readNetlifyConfig(toml('[build]', 'publish = "out"', ...lines))).toThrow(
      /netlify\.toml/
    );
  });
});
