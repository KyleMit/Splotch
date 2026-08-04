// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The light-only pages pin PageShell's themed --page-* defaults per route
// (ADR-0071 keeps those palettes out of the themed token set), so the values
// that must agree across them have no importable source: every pinned sheet
// lifts with one shadow. This is the drift guard the cross-file agreement
// convention requires when the agreeing sites can't share code (the
// app.html.test.ts pattern): read each declaration and fail on divergence.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const privacy = read('../../../routes/privacy/+page.svelte');
const beta = read('../../../routes/android-beta/+page.svelte');

function declaration(source: string, label: string, property: string): string {
  const match = source.match(new RegExp(`${property}:\\s*([^;]+);`));
  expect(match, `${label} declares ${property}`).not.toBeNull();
  return match![1].replace(/\s+/g, ' ').trim();
}

describe('the pinned light-only palettes agree where they share one treatment', () => {
  it('lifts every pinned sheet with one --page-shadow', () => {
    const shadow = declaration(privacy, '/privacy', '--page-shadow');
    expect(declaration(beta, '/android-beta', '--page-shadow')).toBe(shadow);
  });
});
