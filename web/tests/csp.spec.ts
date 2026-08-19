import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';

const BUILD_DIRECTORY = join(process.cwd(), 'build');

function builtHtmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return builtHtmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter(Boolean)
    .map((script) => `sha256-${createHash('sha256').update(script).digest('base64')}`);
}

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
