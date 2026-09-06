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
    `<script>const CATEGORIES = [${categories
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

  it('gives a nested registered page its own card and drops it from the parent list', () => {
    const scrapbookDir = fixture();
    const matrixDir = join(scrapbookDir, 'performance', '2026-07-31-deployment-target-matrix');
    const explainerDir = join(scrapbookDir, 'performance', 'mechanisms');
    mkdirSync(matrixDir, { recursive: true });
    mkdirSync(explainerDir, { recursive: true });
    writeFileSync(join(matrixDir, 'index.html'), '<!doctype html>');
    writeFileSync(
      join(explainerDir, 'index.html'),
      '<nav><a href="#budget"><span class="nav-num">1</span>The budget</a\n><a href="#habits">Six &amp; more</a\n></nav>'
    );

    const index = buildScrapbookIndex(scrapbookDir);

    expect(index).toContain('aria-label="How Splotch stays fast"');
    expect(index).toContain('href="performance/mechanisms/index.html#budget">The budget<');
    expect(index).toContain('href="performance/mechanisms/index.html#habits">Six &amp; more<');
    expect(index).toContain('<span class="kind">2 sections</span>');
    expect(index).not.toContain('>mechanisms<');
    expect(index).not.toContain('<span class="kind">2 reports</span>');
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
