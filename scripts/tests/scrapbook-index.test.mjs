import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildScrapbookIndex,
  coloringBookProofSheetHubProblems,
  collectionsMissingEntry,
} from '../lib/scrapbook-index.mjs';

const fixtures = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-scrapbook-index-'));
  fixtures.push(dir);
  return dir;
}

function writeProofSheetCollection(dir, categories, sheets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    `<script>var CATEGORIES = [${categories
      .map(({ id, pages }) => `{ id: '${id}', name: '${id}', pages: ${pages} }`)
      .join(',')}];</script>`
  );
  for (const [id, pageIds] of Object.entries(sheets)) {
    const cells = pageIds.map((pageId) => ({ id: pageId }));
    writeFileSync(
      join(dir, `${id}.html`),
      `<script>window.__COLORING_BOOK_PROOF_SHEET__ = ${JSON.stringify({ cells })};</script>`
    );
  }
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

  it('reports sibling sheets missing from or extra in the proof-sheet hub', () => {
    const proofSheetsDir = fixture();
    writeProofSheetCollection(
      proofSheetsDir,
      [
        { id: 'farm', pages: 1 },
        { id: 'extra', pages: 1 },
      ],
      { farm: ['barn', 'barn'], missing: ['missing', 'missing'] }
    );

    expect(coloringBookProofSheetHubProblems(proofSheetsDir)).toEqual([
      'Sibling proof sheet missing.html has no matching hub category.',
      'Hub category "extra" has no sibling proof sheet extra.html.',
    ]);
  });

  it('reports a stale proof-sheet hub page count', () => {
    const proofSheetsDir = fixture();
    writeProofSheetCollection(proofSheetsDir, [{ id: 'farm', pages: 1 }], {
      farm: ['barn', 'barn', 'tractor', 'tractor'],
    });

    expect(coloringBookProofSheetHubProblems(proofSheetsDir)).toEqual([
      'Hub category "farm" declares 1 pages, but farm.html contains 2 distinct page IDs across 4 cells.',
    ]);
  });

  it('counts distinct page IDs across git and focused proof sheets', () => {
    const proofSheetsDir = fixture();
    writeProofSheetCollection(
      proofSheetsDir,
      [
        { id: 'git', pages: 2 },
        { id: 'focused', pages: 1 },
      ],
      {
        git: ['barn', 'barn', 'barn', 'barn', 'tractor', 'tractor', 'tractor', 'tractor'],
        focused: ['barn'],
      }
    );

    expect(coloringBookProofSheetHubProblems(proofSheetsDir)).toEqual([]);
  });
});
