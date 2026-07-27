import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildScrapbookIndex, collectionsMissingEntry } from '../lib/scrapbook-index.mjs';

const fixtures = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-scrapbook-index-'));
  fixtures.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scrapbook index', () => {
  it('keeps a registered entry card when its configured page exists', () => {
    const scrapbookDir = fixture();
    const reportDir = join(scrapbookDir, 'model-eval', 'report');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'index.html'), '<!doctype html>');

    const index = buildScrapbookIndex(scrapbookDir);

    expect(index).toContain('href="model-eval/report/index.html"');
    expect(index).toContain('aria-label="Image-model bake-off"');
  });

  it('uses a recursive fallback page when a registered entry is missing', () => {
    const scrapbookDir = fixture();
    const reportDir = join(scrapbookDir, 'model-eval', 'report');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'fallback.html'), '<!doctype html>');

    const index = buildScrapbookIndex(scrapbookDir);

    expect(index).toContain('href="model-eval/report/fallback.html"');
    expect(index).not.toContain('href="model-eval/"');
  });

  it('reports a registered collection with no linkable page', () => {
    const scrapbookDir = fixture();
    mkdirSync(join(scrapbookDir, 'model-eval'));

    expect(collectionsMissingEntry(scrapbookDir)).toEqual(['model-eval']);
  });
});
