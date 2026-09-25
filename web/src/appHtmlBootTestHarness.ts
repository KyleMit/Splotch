import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

// The path stays a parameter: Vite rewrites a `new URL('./literal',
// import.meta.url)` into the served asset's http URL, which readFileSync
// rejects (precedent: lib/design/trimGeometry.test.ts).
export function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

export const html = sourceFile('./app.html');

export const bootScript = (() => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  expect(match, 'app.html has an inline boot <script>').not.toBeNull();
  return match![1];
})();

const themeColorMetaMarkup = (() => {
  const match = html.match(/<meta name="theme-color"[^>]*>/);
  expect(match, 'app.html has a theme-color meta').not.toBeNull();
  return match![0];
})();

// A value no theme resolves to, so a boot script that throws before it paints
// (its IIFE swallows the error) fails every case instead of passing the ones
// whose expected color happens to be what the tag already shipped with.
const UNPAINTED = 'unpainted';

// The boot script repaints app.html's theme-color tag unconditionally, so every
// fixture that executes the script owns seeding that tag. A fixture that runs
// the script against whatever head a previous test left behind passes only in
// declaration order, and throws on a null tag the moment it runs first.
export function runBootScript(): void {
  document.head.innerHTML = themeColorMetaMarkup.replace(
    /content="[^"]*"/,
    `content="${UNPAINTED}"`
  );
  new Function(bootScript)();
}

export function bootLiteral(pattern: RegExp): number {
  const match = bootScript.match(pattern);
  expect(match, `app.html's boot script matches ${pattern}`).not.toBeNull();
  return Number(match![1]);
}

export function bootStringLiteral(pattern: RegExp): string {
  const match = bootScript.match(pattern);
  expect(match, `app.html's boot script matches ${pattern}`).not.toBeNull();
  return match![1];
}
