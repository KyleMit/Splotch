import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';
import { inlineExecutableScriptBodies } from '../securityPolicy';
import { SECURITY_HEADERS } from '../src/lib/server/securityHeaders';
import { enforceProductionCsp } from './helpers';

const BUILD_DIRECTORY = join(process.cwd(), 'build');

function builtHtmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return builtHtmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function inlineScriptHashes(html: string): string[] {
  return inlineExecutableScriptBodies(html).map(
    (script) => `sha256-${createHash('sha256').update(script).digest('base64')}`
  );
}

test('inline hash coverage ignores script data blocks and external scripts', () => {
  const html = [
    '<script>classic()</script>',
    '<script type="module">module()</script>',
    '<script type="text/javascript">textJavascript()</script>',
    '<script type="application/javascript">applicationJavascript()</script>',
    '<script type="text/jscript">legacyJavascript()</script>',
    '<script type="importmap">{"imports":{}}</script>',
    '<script nonce="static-nonce">nonceAuthorized()</script>',
    '<script type="application/json">{"data":true}</script>',
    '<script type="application/ld+json">{"@type":"Thing"}</script>',
    '<script src="/external.js">fallback()</script>',
  ].join('');

  expect(inlineExecutableScriptBodies(html)).toEqual([
    'classic()',
    'module()',
    'textJavascript()',
    'applicationJavascript()',
    'legacyJavascript()',
    '{"imports":{}}',
    'nonceAuthorized()',
  ]);
});

test('every prerendered app document authorizes its inline scripts without unsafe-inline', () => {
  test.skip(!!process.env.DEV_SERVER, 'vite dev does not create the production build artifact');
  const documents = builtHtmlFiles(BUILD_DIRECTORY).filter(
    (path) => relative(BUILD_DIRECTORY, path) !== 'deny.html'
  );
  expect(documents.length).toBeGreaterThan(0);

  for (const path of documents) {
    const html = readFileSync(path, 'utf8');
    const policies = [
      ...html.matchAll(/<meta http-equiv="content-security-policy" content="([^"]*)">/gi),
    ];
    expect(policies, relative(BUILD_DIRECTORY, path)).toHaveLength(1);
    const scriptDirective = policies[0][1]
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src '));
    expect(scriptDirective, relative(BUILD_DIRECTORY, path)).toBeDefined();
    expect(scriptDirective).not.toContain("'unsafe-inline'");

    for (const hash of inlineScriptHashes(html)) {
      expect(scriptDirective, `${relative(BUILD_DIRECTORY, path)} authorizes ${hash}`).toContain(
        `'${hash}'`
      );
    }
  }
});

test('production CSP helper preserves the SSR nonce policy while adding the platform policy', async ({
  page,
}) => {
  await enforceProductionCsp(page);
  const response = await page.goto('/admin');
  const policy = response?.headers()['content-security-policy'] ?? '';
  const policies = policy.split(/,\s*/);

  expect(policies).toHaveLength(2);
  expect(policies[0]).toContain('script-src');
  expect(policies[0]).toMatch(/nonce-[A-Za-z0-9+/]+={0,2}/);
  expect(policies[1]).toBe(SECURITY_HEADERS['Content-Security-Policy']);
});
