// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// `hydrateSaveFolder` re-implements `folderSaveSupported`'s capability check
// inline instead of importing it. That duplication is deliberate and load-
// bearing: saveFolder.svelte.ts is on the startup path and reaches the save
// pipeline only through a dynamic import, so a static import into lib/drawing/
// hands the bundler an edge from the startup graph into the save chunk.
//
// tests/startup-bundle.spec.ts pins that bundle boundary, but it scans
// modulepreloaded chunks for save-module markers — it cannot see the two
// predicates disagreeing. This is the drift guard for the predicates
// themselves: if folderSaveSupported gains a capability requirement that boot
// hydration does not, boot fetches the save chunk on a platform the UI treats
// as unsupported (and vice versa).
//
// The two sites spell their SSR guard differently on purpose — folderSave.ts
// imports `browser` from $app/environment, which saveFolder.svelte.ts cannot
// afford. So this compares the *capabilities* each predicate probes, not the
// source text, and separately asserts each still carries some SSR guard.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const saveFolderSource = read('./saveFolder.svelte.ts');
const folderSaveSource = read('../drawing/folderSave.ts');

const hydrateGuard =
  /export async function hydrateSaveFolder\(\)\s*{\s*if \(([^)]*(?:\)[^)]*)*?)\) return;/.exec(
    saveFolderSource
  )?.[1];

const supportedBody = /export function folderSaveSupported\(\): boolean\s*{\s*return ([^;]+);/.exec(
  folderSaveSource
)?.[1];

/** The `'name' in window` capabilities a predicate probes, as a sorted set. */
function probedCapabilities(expression: string): string[] {
  return [...expression.matchAll(/'([^']+)' in window/g)].map((m) => m[1]).sort();
}

/** Whether a predicate still refuses to run without a DOM. */
function hasSsrGuard(expression: string): boolean {
  return /\bbrowser\b/.test(expression) || /typeof window\s*[=!]==\s*'undefined'/.test(expression);
}

describe('folder-save support predicate', () => {
  it('is extractable from both sites', () => {
    expect(
      hydrateGuard,
      'hydrateSaveFolder guard not found — update this drift guard'
    ).toBeTruthy();
    expect(
      supportedBody,
      'folderSaveSupported body not found — update this drift guard'
    ).toBeTruthy();
  });

  it('probes the same capabilities at both sites', () => {
    const hydrate = probedCapabilities(hydrateGuard!);
    const canonical = probedCapabilities(supportedBody!);

    expect(canonical.length, 'folderSaveSupported probes no capability').toBeGreaterThan(0);
    expect(
      hydrate,
      "hydrateSaveFolder's inline check and folderSaveSupported probe different capabilities — " +
        'boot would hydrate on a platform the UI treats as unsupported (or skip one it supports)'
    ).toEqual(canonical);
  });

  it('keeps an SSR guard at both sites', () => {
    expect(hasSsrGuard(hydrateGuard!), 'hydrateSaveFolder lost its SSR guard').toBe(true);
    expect(hasSsrGuard(supportedBody!), 'folderSaveSupported lost its SSR guard').toBe(true);
  });
});
