import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writePageInventoryFeedback } from '../attach-page-inventory-feedback.mjs';
import { finalizePageInventoryCritique } from '../finalize-page-inventory-critique.mjs';
import { generateOutputAtomically, settingsSectionRowSelector } from '../gen-page-inventory.mjs';
import { readStructuredOutput, reviewerArgs } from '../run-page-inventory-critiques.mjs';
import {
  captureRecord,
  captureReviewId,
  createCaptureManifest,
  finalizeDesignCritique,
  PAGE_INVENTORY_REVIEW_CONTRACT,
  readDesignCritique,
  sha256File,
} from '../lib/page-inventory-data.mjs';
import {
  PAGE_INVENTORY_VIEWPORTS,
  PAGE_INVENTORY_THEMES,
  attachExpectedCapturePaths,
  inventoryCaptureKey,
} from '../lib/page-inventory-report.mjs';

const fixtures = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-page-inventory-'));
  fixtures.push(root);
  return root;
}

function inventoryItem() {
  return attachExpectedCapturePaths([
    {
      group: 'routes',
      id: 'home',
      title: 'Drawing canvas',
      description: 'The drawing surface.',
      source: '/',
    },
  ])[0];
}

function writeCaptures(out, item) {
  const captures = [];
  for (const path of Object.values(item.captures)) {
    mkdirSync(join(out, path, '..'), { recursive: true });
    writeFileSync(join(out, path), `unchanged ${path}\n`);
  }
  for (const theme of PAGE_INVENTORY_THEMES) {
    for (const viewport of PAGE_INVENTORY_VIEWPORTS) {
      const path = item.captures[inventoryCaptureKey(viewport, theme)];
      captures.push(captureRecord(item, viewport, theme, path, sha256File(join(out, path))));
    }
  }
  const manifest = createCaptureManifest(PAGE_INVENTORY_VIEWPORTS, captures);
  writeFileSync(join(out, 'capture-manifest.json'), JSON.stringify(manifest));
  return manifest;
}

function critiqueEntries(manifest) {
  return manifest.captures.map((capture, index) => {
    const severity = ['pass', 'low', 'medium', 'high'][index % 4];
    return {
      review_id: capture.review_id,
      image: capture.image,
      sha256: capture.sha256,
      severity,
      critique: index === 0 ? 'Clear <canvas> & controls.' : `${capture.viewport_id} feedback.`,
      recommendation: severity === 'pass' ? null : `Fix ${capture.viewport_id} <soon>.`,
    };
  });
}

function writeCheckpoints(checkpoints, manifest, entries) {
  mkdirSync(checkpoints);
  for (const capture of manifest.captures) {
    const entry = entries.find(({ review_id: reviewId }) => reviewId === capture.review_id);
    writeFileSync(
      join(checkpoints, `${capture.review_id}.json`),
      JSON.stringify({
        schema_version: 3,
        review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
        review_id: capture.review_id,
        entry,
      })
    );
  }
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('page inventory output', () => {
  it('defines portrait and landscape variants for every canonical device', () => {
    expect(PAGE_INVENTORY_VIEWPORTS).toHaveLength(8);
    expect(
      PAGE_INVENTORY_VIEWPORTS.filter(({ orientation }) => orientation === 'portrait')
    ).toHaveLength(4);
    expect(
      PAGE_INVENTORY_VIEWPORTS.filter(({ orientation }) => orientation === 'landscape')
    ).toHaveLength(4);
    for (const portrait of PAGE_INVENTORY_VIEWPORTS.slice(0, 4)) {
      const landscape = PAGE_INVENTORY_VIEWPORTS.find(
        ({ id }) => id === `${portrait.id}-landscape`
      );
      expect(landscape).toMatchObject({
        width: portrait.height,
        height: portrait.width,
        orientation: 'landscape',
        formFactor: portrait.formFactor,
      });
    }
  });

  it('defines light and night capture variants with standalone review inputs', () => {
    expect(PAGE_INVENTORY_THEMES.map(({ id }) => id)).toEqual(['light', 'dark']);
    const item = inventoryItem();
    expect(Object.values(item.captures)).toHaveLength(16);
    const manifest = writeCaptures(fixture(), item);
    expect(manifest.schema_version).toBe(2);
    expect(manifest.captures).toHaveLength(16);
    expect(new Set(manifest.captures.map(({ review_id: reviewId }) => reviewId)).size).toBe(16);
    const night = manifest.captures.find(({ theme }) => theme === 'dark');
    expect(night).toMatchObject({
      review_id: captureReviewId(item, PAGE_INVENTORY_VIEWPORTS[0], PAGE_INVENTORY_THEMES[1]),
      theme: 'dark',
    });
    expect(night.review_description).toContain('Assess only night-mode contrast and legibility');
    expect(night.review_description).toContain('Ignore layout and responsive composition');
  });

  it('targets only the responsive Settings navigation row for section captures', () => {
    expect(settingsSectionRowSelector('appearance', 375)).toBe(
      '.hub-row[data-section="appearance"]'
    );
    expect(settingsSectionRowSelector('appearance', 744)).toBe(
      '.settings-nav-item[data-section="appearance"]'
    );
  });

  it('passes exactly one description and one image to an ephemeral reviewer', () => {
    const capture = { review_description: 'Standalone description.' };
    const args = reviewerArgs({
      capture,
      image: '/tmp/capture.webp',
      schema: '/tmp/schema.json',
      model: 'test-model',
      effort: 'low',
      reviewerRoot: '/tmp/reviewer',
    });
    expect(args.at(-1)).toBe(capture.review_description);
    expect(args.filter((arg) => arg === '--image')).toHaveLength(1);
    expect(args).toContain('--ephemeral');
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('--ignore-rules');
    expect(args).toContain('--skip-git-repo-check');
  });

  it('reads the final structured reviewer message', () => {
    const response = {
      severity: 'pass',
      critique: 'Visible contrast is clear.',
      recommendation: null,
      tags: [],
    };
    const stdout = [
      JSON.stringify({ type: 'thread.started', thread_id: 'abc' }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify(response) },
      }),
    ].join('\n');
    expect(readStructuredOutput(stdout)).toEqual(response);
  });

  it('preserves the complete baseline and removes staging when generation fails', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    mkdirSync(join(out, 'assets'), { recursive: true });
    writeFileSync(join(out, 'index.html'), 'baseline report\n');
    writeFileSync(join(out, 'assets', 'baseline.webp'), 'baseline snapshot\n');

    await expect(
      generateOutputAtomically(out, async (staging) => {
        mkdirSync(join(staging, 'assets'));
        writeFileSync(join(staging, 'assets', 'partial.webp'), 'partial snapshot\n');
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');

    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('baseline report\n');
    expect(readFileSync(join(out, 'assets', 'baseline.webp'), 'utf8')).toBe('baseline snapshot\n');
    expect(existsSync(join(out, 'assets', 'partial.webp'))).toBe(false);
    expect(readdirSync(root)).toEqual(['page-inventory']);
  });

  it('writes the inventory without feedback when no critique is present', () => {
    const out = join(fixture(), 'page-inventory');
    const item = inventoryItem();
    writeCaptures(out, item);

    expect(writePageInventoryFeedback(out, undefined, [item])).toBe(0);

    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('Drawing canvas');
    expect(html).not.toContain('class="critique-note"');
    expect(html).not.toContain('class="shot has-critique');
    expect(html).not.toContain('data-severity-filter');
  });

  it('attaches complete hash-bound feedback without changing images', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const item = inventoryItem();
    const manifest = writeCaptures(out, item);
    const entries = critiqueEntries(manifest);
    const critique = join(root, 'design-critique.json');
    writeFileSync(critique, JSON.stringify({ schema_version: 3, entries }));
    const firstImage = join(out, entries[0].image);
    const originalImage = readFileSync(firstImage, 'utf8');

    expect(writePageInventoryFeedback(out, critique, [item])).toBe(16);

    const html = readFileSync(join(out, 'index.html'), 'utf8');
    for (const severity of ['pass', 'low', 'medium', 'high']) {
      expect(html).toContain(`has-critique severity-${severity}`);
      expect(html).toContain(`data-severity="${severity}"`);
      expect(html).toContain(`name="severity" value="${severity}"`);
    }
    expect(html).toContain('Filter by severity');
    expect(html).toContain('name="severity" value="all" checked');
    expect(html).toContain('Showing 16 of 16 snapshots');
    expect(html).toContain('<h4>Light mode</h4>');
    expect(html).toContain('<h4>Night mode</h4>');
    expect(html).toContain('Small iPhone · Landscape');
    expect(html).toContain('Portrait · 375 × 812 pt');
    expect(html).toContain("shot.hidden=severity!=='all'&&shot.dataset.severity!==severity");
    expect(html).toContain("surface.hidden=!surface.querySelector('.shot:not([hidden])')");
    expect(html).toContain('Clear &lt;canvas&gt; &amp; controls.');
    expect(html).toContain(
      '<strong>Recommendation:</strong> Fix iphone-16-pro-max-landscape &lt;soon&gt;.'
    );
    expect(readFileSync(firstImage, 'utf8')).toBe(originalImage);
  });

  it('rejects missing, unknown, and stale feedback', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const critique = join(root, 'design-critique.json');

    writeFileSync(critique, JSON.stringify({ schema_version: 3, entries: entries.slice(1) }));
    expect(() => readDesignCritique(critique, manifest)).toThrow('15 of 16 required entries');

    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: 3,
        entries: [{ ...entries[0], review_id: 'routes--unknown' }, ...entries.slice(1)],
      })
    );
    expect(() => readDesignCritique(critique, manifest)).toThrow('unknown review_id');

    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: 3,
        entries: [{ ...entries[0], sha256: '0'.repeat(64) }, ...entries.slice(1)],
      })
    );
    expect(() => readDesignCritique(critique, manifest)).toThrow('stale image hash');
  });

  it('finalizes complete independent reviews and derives scope and severity counts', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const checkpoints = join(root, 'checkpoints');
    writeCheckpoints(checkpoints, manifest, entries);
    const critique = join(root, 'final.json');

    await finalizePageInventoryCritique([
      '--manifest',
      join(out, 'capture-manifest.json'),
      '--checkpoints',
      checkpoints,
      '--out',
      critique,
    ]);

    const document = JSON.parse(readFileSync(critique, 'utf8'));
    expect(document).toMatchObject({
      schema_version: 3,
      scope: {
        review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
        surfaces_reviewed: 1,
        screenshots_reviewed: 16,
        expected_screenshots: 16,
        completeness: 'complete',
      },
      summary: { severity_counts: { pass: 4, low: 4, medium: 4, high: 4 } },
    });
    expect(document.entries).toHaveLength(16);
  });

  it('reports a stale review with its standalone next-review input', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const checkpoints = join(root, 'checkpoints');
    writeCheckpoints(checkpoints, manifest, entries);
    const staleReview = manifest.captures[0].review_id;
    const stalePath = join(checkpoints, `${staleReview}.json`);
    const staleDocument = JSON.parse(readFileSync(stalePath, 'utf8'));
    staleDocument.entry.sha256 = '0'.repeat(64);
    writeFileSync(stalePath, JSON.stringify(staleDocument));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const args = ['--manifest', join(out, 'capture-manifest.json'), '--checkpoints', checkpoints];

    await finalizePageInventoryCritique([...args, '--status']);

    expect(JSON.parse(log.mock.calls.at(-1)[0])).toMatchObject({
      completed_reviews: 15,
      expected_reviews: 16,
      missing_review_ids: [],
      stale_review_ids: [staleReview],
      next_review: {
        review_id: staleReview,
        image: manifest.captures[0].image,
        description: manifest.captures[0].review_description,
      },
    });
    log.mockRestore();
    await expect(
      finalizePageInventoryCritique([...args, '--out', join(root, 'final.json')])
    ).rejects.toThrow('stale image hash');
  });

  it('keeps partial critique output outside the committed scrapbook', async () => {
    await expect(
      finalizePageInventoryCritique([
        '--allow-partial',
        '--out',
        'scrapbook/page-inventory/partial.json',
      ])
    ).rejects.toThrow('--allow-partial requires an explicit scratch --out path');
  });

  it('keeps pixel-identical reviews independent when their descriptions differ', () => {
    const out = join(fixture(), 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    manifest.captures[1].sha256 = manifest.captures[0].sha256;
    const entries = critiqueEntries(manifest);

    expect(() => finalizeDesignCritique(manifest, entries)).not.toThrow();
  });
});
