import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Playwright tags decide which engine a spec runs on: the `webkit` project greps
// for WEBKIT_ONLY_TAG and `chromium` greps it out (web/playwright.config.ts,
// web/tests/tags.ts). Nothing in Playwright validates a tag, so a hand-written
// '@webkti-only' is not an error — it just matches neither project's pattern,
// and the spec runs under Chromium only. The WebKit job stays green because the
// correctly tagged specs still populate it, so the loss of coverage is silent.
//
// Hence: tags come from tags.ts by import, never as a string literal, which
// makes a typo a module-resolution error instead of a routing one.
//
// Regex-level on purpose: no TypeScript parser runs in this Node-only suite,
// and these specs are dprint-formatted.
const repoRoot = join(import.meta.dirname, '..', '..');
const testsDir = join(repoRoot, 'web', 'tests');
const TAGS_MODULE = './tags';

const tagsSource = readFileSync(join(testsDir, 'tags.ts'), 'utf8');
const exportedTags = [...tagsSource.matchAll(/export const ([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);

const specs = readdirSync(testsDir)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(join(testsDir, name), 'utf8') }));

// The `tag:` value in a test()/test.describe() options object — a bare
// identifier, a quoted literal, or an array of either.
const TAG_VALUE = /\btag:\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|[A-Za-z_$][\w$]*)/g;

function taggedEntries({ source }) {
  return [...source.matchAll(TAG_VALUE)].flatMap(([, value]) =>
    (value.startsWith('[') ? value.slice(1, -1).split(',') : [value])
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

const isLiteral = (entry) => entry.startsWith("'") || entry.startsWith('"');

describe('E2E engine tags', () => {
  it('tags.ts exports the tag constants', () => {
    expect(exportedTags).toContain('WEBKIT_ONLY_TAG');
  });

  // Guards the partition against the opposite failure: every spec dropping its
  // tag would leave the webkit project with nothing to run.
  it('at least one spec carries WEBKIT_ONLY_TAG', () => {
    const tagged = specs.filter((spec) => taggedEntries(spec).includes('WEBKIT_ONLY_TAG'));
    expect(tagged.map(({ name }) => name)).not.toHaveLength(0);
  });

  for (const spec of specs) {
    const entries = taggedEntries(spec);
    if (entries.length === 0) continue;

    it(`${spec.name} takes its tags from ${TAGS_MODULE}, not string literals`, () => {
      expect(entries.filter(isLiteral)).toEqual([]);
      for (const entry of entries) expect(exportedTags).toContain(entry);
      expect(spec.source).toContain(`from '${TAGS_MODULE}'`);
    });
  }
});
