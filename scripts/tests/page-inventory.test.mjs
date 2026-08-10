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
import { generateOutputAtomically } from '../gen-page-inventory.mjs';
import {
  captureRecord,
  createCaptureManifest,
  critiqueBatchKey,
  finalizeDesignCritique,
  readDesignCritique,
  sha256File,
} from '../lib/page-inventory-data.mjs';
import {
  PAGE_INVENTORY_VIEWPORTS,
  attachExpectedCapturePaths,
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
  for (const viewport of PAGE_INVENTORY_VIEWPORTS) {
    const path = item.captures[viewport.id];
    captures.push(captureRecord(item, viewport, path, sha256File(join(out, path))));
  }
  const manifest = createCaptureManifest(PAGE_INVENTORY_VIEWPORTS, captures);
  writeFileSync(join(out, 'capture-manifest.json'), JSON.stringify(manifest));
  return manifest;
}

function critiqueEntries(manifest) {
  return manifest.captures.map((capture, index) => {
    const severity = ['pass', 'low', 'medium', 'high'][index % 4];
    return {
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
  for (const captures of Map.groupBy(manifest.captures, critiqueBatchKey).values()) {
    const batchKey = critiqueBatchKey(captures[0]);
    writeFileSync(
      join(checkpoints, `${batchKey}.json`),
      JSON.stringify({
        schema_version: 1,
        batch_key: batchKey,
        entries: entries.filter((entry) => captures.some(({ image }) => image === entry.image)),
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
    writeFileSync(critique, JSON.stringify({ schema_version: 2, entries }));
    const firstImage = join(out, entries[0].image);
    const originalImage = readFileSync(firstImage, 'utf8');

    expect(writePageInventoryFeedback(out, critique, [item])).toBe(8);

    const html = readFileSync(join(out, 'index.html'), 'utf8');
    for (const severity of ['pass', 'low', 'medium', 'high']) {
      expect(html).toContain(`has-critique severity-${severity}`);
      expect(html).toContain(`data-severity="${severity}"`);
      expect(html).toContain(`name="severity" value="${severity}"`);
    }
    expect(html).toContain('Filter by severity');
    expect(html).toContain('name="severity" value="all" checked');
    expect(html).toContain('Showing 8 of 8 snapshots');
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

    writeFileSync(critique, JSON.stringify({ schema_version: 2, entries: entries.slice(1) }));
    expect(() => readDesignCritique(critique, manifest)).toThrow('7 of 8 required entries');

    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: 2,
        entries: [{ ...entries[0], image: 'assets/routes/unknown.webp' }, ...entries.slice(1)],
      })
    );
    expect(() => readDesignCritique(critique, manifest)).toThrow('unknown image');

    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: 2,
        entries: [{ ...entries[0], sha256: '0'.repeat(64) }, ...entries.slice(1)],
      })
    );
    expect(() => readDesignCritique(critique, manifest)).toThrow('stale image hash');
  });

  it('finalizes complete checkpoint batches and derives scope and severity counts', async () => {
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
      schema_version: 2,
      scope: {
        surfaces_reviewed: 1,
        screenshots_reviewed: 8,
        expected_screenshots: 8,
        completeness: 'complete',
      },
      summary: { severity_counts: { pass: 2, low: 2, medium: 2, high: 2 } },
    });
    expect(document.entries).toHaveLength(8);
  });

  it('reports stale batches without treating them as missing or finalizable', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const checkpoints = join(root, 'checkpoints');
    writeCheckpoints(checkpoints, manifest, entries);
    const staleBatch = critiqueBatchKey(manifest.captures[0]);
    const stalePath = join(checkpoints, `${staleBatch}.json`);
    const staleDocument = JSON.parse(readFileSync(stalePath, 'utf8'));
    staleDocument.entries[0].sha256 = '0'.repeat(64);
    writeFileSync(stalePath, JSON.stringify(staleDocument));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const args = ['--manifest', join(out, 'capture-manifest.json'), '--checkpoints', checkpoints];

    await finalizePageInventoryCritique([...args, '--status']);

    expect(JSON.parse(log.mock.calls.at(-1)[0])).toMatchObject({
      completed_batches: 1,
      expected_batches: 2,
      missing_batches: [],
      stale_batches: [staleBatch],
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

  it('rejects different severities for pixel-identical captures', () => {
    const out = join(fixture(), 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    manifest.captures[1].sha256 = manifest.captures[0].sha256;
    const entries = critiqueEntries(manifest);

    expect(() => finalizeDesignCritique(manifest, entries)).toThrow(
      'different severities to identical captures'
    );
  });
});
