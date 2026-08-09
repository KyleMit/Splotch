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
import { afterEach, describe, expect, it } from 'vitest';
import { writePageInventoryFeedback } from '../attach-page-inventory-feedback.mjs';
import { generateOutputAtomically } from '../gen-page-inventory.mjs';
import {
  PAGE_INVENTORY_VIEWPORTS,
  attachExpectedCapturePaths,
  readDesignCritique,
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
  for (const path of Object.values(item.captures)) {
    mkdirSync(join(out, path, '..'), { recursive: true });
    writeFileSync(join(out, path), `unchanged ${path}\n`);
  }
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('page inventory output', () => {
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

  it('attaches escaped feedback and severity borders without changing images', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const item = inventoryItem();
    writeCaptures(out, item);
    const entries = PAGE_INVENTORY_VIEWPORTS.map((viewport, index) => ({
      image: item.captures[viewport.id],
      severity: ['pass', 'low', 'medium', 'high'][index],
      critique: index === 0 ? 'Clear <canvas> & controls.' : `${viewport.category} feedback.`,
      recommendation: index === 3 ? 'Fix the layout <soon>.' : null,
    }));
    const critique = join(root, 'design-critique.json');
    writeFileSync(critique, JSON.stringify({ entries }));
    const firstImage = join(out, entries[0].image);
    const originalImage = readFileSync(firstImage, 'utf8');

    expect(writePageInventoryFeedback(out, critique, [item])).toBe(4);

    const html = readFileSync(join(out, 'index.html'), 'utf8');
    for (const severity of ['pass', 'low', 'medium', 'high']) {
      expect(html).toContain(`has-critique severity-${severity}`);
      expect(html).toContain(`data-severity="${severity}"`);
      expect(html).toContain(`name="severity" value="${severity}"`);
    }
    expect(html).toContain('Filter by severity');
    expect(html).toContain('name="severity" value="all" checked');
    expect(html).toContain('Showing 4 of 4 snapshots');
    expect(html).toContain("shot.hidden=severity!=='all'&&shot.dataset.severity!==severity");
    expect(html).toContain("surface.hidden=!surface.querySelector('.shot:not([hidden])')");
    expect(html).toContain('Clear &lt;canvas&gt; &amp; controls.');
    expect(html).toContain('<strong>Recommendation:</strong> Fix the layout &lt;soon&gt;.');
    expect(readFileSync(firstImage, 'utf8')).toBe(originalImage);
  });

  it('rejects feedback for an image outside the inventory', () => {
    const root = fixture();
    const critique = join(root, 'design-critique.json');
    writeFileSync(
      critique,
      JSON.stringify({
        entries: [
          {
            image: 'assets/routes/not-in-the-inventory.webp',
            severity: 'high',
            critique: 'This cannot be attached.',
            recommendation: null,
          },
        ],
      })
    );

    expect(() => readDesignCritique(critique, ['assets/routes/home.webp'])).toThrow(
      'references an unknown image'
    );
  });
});
