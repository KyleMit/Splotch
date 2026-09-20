// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDUCE_MOTION_ATTRIBUTE, START_REDUCED_MOTION_ATTRIBUTE } from './reducedMotion';

// Live treatments read the resolved root attribute; entrance and exit cues
// read its snapshot on their own element. A treatment written as
// `@media (prefers-reduced-motion)` would still work for an OS-level request —
// which is why nothing else would catch it — but it ignores the Settings switch
// in both directions: it stays animated when the switch asks for calm, and stays
// calm when a parent on a reduce-motion OS chose full motion for this app.

const srcDir = new URL('../../', import.meta.url).pathname;

const MEDIA_FORM = /@media[^{]*prefers-reduced-motion/;
const ATTRIBUTE_SELECTOR = /:root\[(data-[\w-]*motion[\w-]*)\]/g;
const START_ATTRIBUTE_SELECTOR = /\[(data-start-[\w-]*motion[\w-]*)\]/g;

function collectStyleSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectStyleSources(path, found);
    else if (/\.(svelte|css)$/.test(entry.name)) found.push(path);
  }
  return found;
}

const sources = collectStyleSources(srcDir).map((path) => ({
  path: relative(srcDir, path),
  text: readFileSync(path, 'utf8'),
}));

describe('reduced-motion CSS', () => {
  it('never keys a treatment off the media query', () => {
    const offenders = sources.filter(({ text }) => MEDIA_FORM.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('spells the attribute the way the platform module stamps it', () => {
    const spellings = new Set(
      sources.flatMap(({ text }) => [...text.matchAll(ATTRIBUTE_SELECTOR)].map((m) => m[1]))
    );
    expect([...spellings]).toEqual([REDUCE_MOTION_ATTRIBUTE]);
  });

  it('spells the cue-start snapshot the way the platform module stamps it', () => {
    const spellings = new Set(
      sources.flatMap(({ text }) => [...text.matchAll(START_ATTRIBUTE_SELECTOR)].map((m) => m[1]))
    );
    expect([...spellings]).toEqual([START_REDUCED_MOTION_ATTRIBUTE]);
  });
});
