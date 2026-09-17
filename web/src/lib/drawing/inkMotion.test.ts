import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLEAR_SHEET_DURATION_MS } from './inkMotion';

// The path stays a parameter because Vite rewrites a literal
// `new URL('./literal', import.meta.url)` into the served asset's http URL,
// which readFileSync rejects (precedent: app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('undo ghost start', () => {
  it('pauses the ghost in app.css and runs it from the class inkMotion.ts adds', () => {
    const css = sourceFile('../../app.css');
    const runningClass = sourceFile('./inkMotion.ts').match(/classList\.add\('([\w-]+)'\)/)?.[1];
    expect(runningClass, 'inkMotion.ts adds a class to start the ghost').toBeDefined();

    expect(css).toMatch(/\.undo-ink-motion\s*\{[^}]*animation:[^;]*\bpaused\b/);
    expect(css).toMatch(
      new RegExp(`\\.undo-ink-motion\\.${runningClass}\\s*\\{[^}]*animation-play-state:\\s*running`)
    );
  });
});

describe('clear sheet timing', () => {
  it("matches app.css's clear-sheet animation, which the clear gesture waits out", () => {
    const match = sourceFile('../../app.css').match(/animation:\s*clear-sheet\s+(\d+)ms/);
    expect(match, 'app.css declares a clear-sheet animation duration').not.toBeNull();

    expect(CLEAR_SHEET_DURATION_MS).toBe(Number(match![1]));
  });
});
