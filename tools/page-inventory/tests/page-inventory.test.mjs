import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReviewerOutput } from '../lib/reviewer-runner.mjs';
import {
  CHECKPOINT_SCHEMA_VERSION,
  finalizePageInventoryCritique,
} from '../finalize-page-critique.mjs';
import {
  assertReviewerAvailable,
  reviewerArgs,
  runReviewerProcess,
} from '../run-inventory-critiques.mjs';
import { assertCaptureRendered } from '../lib/page-inventory-capture.mjs';
import {
  GENERAL_DESIGN_NOTES,
  GROUP_DESIGN_NOTES,
  SURFACE_DESIGN_NOTES,
  designNoteKey,
} from '../lib/page-inventory-design-notes.mjs';
import {
  captureRecord,
  captureReviewId,
  createCaptureManifest,
  finalizeDesignCritique,
  PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION as CRITIQUE_SCHEMA_VERSION,
  PAGE_INVENTORY_REVIEW_CONTRACT,
  readDesignCritique,
  reviewDescriptionDigest,
  sha256File,
  validateThemeCaptureDifferences,
} from '../lib/page-inventory-data.mjs';
import {
  PAGE_INVENTORY_VIEWPORTS,
  PAGE_INVENTORY_THEMES,
  attachExpectedCapturePaths,
  inventoryCaptureKey,
} from '../lib/page-inventory-report.mjs';
import { ROOT } from '../../lib/proc.mjs';

const fixtures = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-page-inventory-'));
  fixtures.push(root);
  return root;
}

function writeFlatWebp(path, { width, height }) {
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .webp()
    .toFile(path);
}

function writeTexturedWebp(path, { width, height }) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 37) % 256;
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .webp()
    .toFile(path);
}
join(ROOT, 'web/src/lib/components');

// Two flat halves, at 0 and at `peakLevel`, put each channel's standard
// deviation at exactly half the level — a spread that can be placed either side
// of the blankness floor. Lossless, so the encoder cannot move it.
function writeTwoLevelWebp(path, { width, height }, peakLevel) {
  const pixels = Buffer.alloc(width * height * 3);
  pixels.fill(peakLevel, 0, Math.floor(pixels.length / 2));
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .webp({ lossless: true })
    .toFile(path);
}

function inventoryItem(overrides = {}) {
  return attachExpectedCapturePaths([
    {
      group: 'routes',
      id: 'home',
      title: 'Drawing canvas',
      description: 'The drawing surface.',
      source: '/',
      ...overrides,
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

// The wide Settings hub opening on its first section, and the compact landscape
// shell every section collapses into: several surfaces capture byte-identically
// at the same viewport and theme, under their own names and descriptions.
function writeSharedShellCaptures(out, items) {
  const captures = [];
  for (const theme of PAGE_INVENTORY_THEMES) {
    for (const viewport of PAGE_INVENTORY_VIEWPORTS) {
      for (const item of items) {
        const path = item.captures[inventoryCaptureKey(viewport, theme)];
        mkdirSync(join(out, path, '..'), { recursive: true });
        writeFileSync(join(out, path), `shared shell ${viewport.id} ${theme.id}\n`);
        captures.push(captureRecord(item, viewport, theme, path, sha256File(join(out, path))));
      }
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

const FIXTURE_REVIEWER = { runner: 'codex', model: 'test-model' };

function writeCheckpoints(checkpoints, manifest, entries, reviewer) {
  mkdirSync(checkpoints);
  for (const capture of manifest.captures) {
    const entry = entries.find(({ review_id: reviewId }) => reviewId === capture.review_id);
    writeFileSync(
      join(checkpoints, `${capture.review_id}.json`),
      JSON.stringify({
        schema_version: CHECKPOINT_SCHEMA_VERSION,
        review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
        review_id: capture.review_id,
        review_description_sha256: reviewDescriptionDigest(capture.review_description),
        reviewer: reviewer ?? FIXTURE_REVIEWER,
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
    expect(manifest.schema_version).toBe(3);
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

  it('carries the general design notes and the per-surface note into every review input', () => {
    const item = inventoryItem({ group: 'controls', id: 'clear-coachmark' });
    const note = SURFACE_DESIGN_NOTES[designNoteKey('controls', 'clear-coachmark')];
    const manifest = writeCaptures(fixture(), item);

    for (const capture of manifest.captures) {
      expect(capture.surface_intent).toBe(note);
      expect(capture.review_description).toContain(`Design intent: ${note}`);
      for (const general of GENERAL_DESIGN_NOTES) {
        expect(capture.review_description).toContain(general);
      }
    }
    const plain = writeCaptures(fixture(), inventoryItem()).captures[0];
    expect(plain.surface_intent).toBeUndefined();
    expect(plain.review_description).not.toContain('Design intent:');
    expect(plain.review_description).toContain(GENERAL_DESIGN_NOTES[0]);
  });

  it('carries group design intent into every surface in that group', () => {
    const note = GROUP_DESIGN_NOTES.settings;
    const overview = writeCaptures(
      fixture(),
      inventoryItem({ group: 'settings', id: 'settings-overview' })
    ).captures[0];
    const whatsNew = writeCaptures(
      fixture(),
      inventoryItem({ group: 'settings', id: 'settings-whatsnew' })
    ).captures[0];

    expect(overview.surface_intent).toBe(note);
    expect(whatsNew.surface_intent).toContain(note);
    expect(whatsNew.surface_intent).toContain(
      SURFACE_DESIGN_NOTES[designNoteKey('settings', 'settings-whatsnew')]
    );
  });

  it('rejects pixel-identical theme pairs for every surface', () => {
    const themed = inventoryItem();
    const manifest = writeCaptures(fixture(), themed);
    const light = manifest.captures.find(({ theme }) => theme === 'light');
    const dark = manifest.captures.find(
      ({ theme, viewport_id: viewportId }) => theme === 'dark' && viewportId === light.viewport_id
    );
    dark.sha256 = light.sha256;

    expect(() => validateThemeCaptureDifferences(manifest.captures, [themed])).toThrow(
      'produced pixel-identical light and night captures'
    );
  });

  it('rejects a capture whose pixels never rendered', async () => {
    const root = fixture();
    const viewport = { id: 'iphone-13-mini', width: 60, height: 40 };
    const blank = join(root, 'blank.webp');
    const drawn = join(root, 'drawn.webp');
    await writeFlatWebp(blank, viewport);
    await writeTexturedWebp(drawn, viewport);

    await expect(assertCaptureRendered(blank, viewport)).rejects.toThrow(
      'near-uniform pixels (peak channel stddev'
    );
    await expect(assertCaptureRendered(drawn, viewport)).resolves.toBeUndefined();
    await expect(
      assertCaptureRendered(drawn, { ...viewport, width: viewport.width + 1 })
    ).rejects.toThrow('expected WebP 61×40');
  });

  // A page that renders a fraction of itself is the failure the floor is for, and
  // it lands far closer to flat than to a real surface — so the floor has to be
  // pinned, not merely somewhere between an empty frame and a busy one. These two
  // captures score 5.5 and 6.5 levels, which holds it to that band.
  it('rejects a capture whose spread sits below the blankness floor', async () => {
    const root = fixture();
    const viewport = { id: 'iphone-13-mini', width: 60, height: 40 };
    const belowFloor = join(root, 'below-floor.webp');
    const aboveFloor = join(root, 'above-floor.webp');
    await writeTwoLevelWebp(belowFloor, viewport, 11);
    await writeTwoLevelWebp(aboveFloor, viewport, 13);

    await expect(assertCaptureRendered(belowFloor, viewport)).rejects.toThrow(
      'near-uniform pixels (peak channel stddev 5.50'
    );
    await expect(assertCaptureRendered(aboveFloor, viewport)).resolves.toBeUndefined();
  });

  // Every viewport has its own width × height, and a capture is checked against
  // its own before it is recorded — so a shot that came back at another
  // viewport's size cannot reach the manifest, and two captures of one surface
  // cannot be byte-identical across viewports for a cross-capture check to find.
  it('gives every viewport dimensions no other viewport shares', () => {
    const sizes = PAGE_INVENTORY_VIEWPORTS.map(({ width, height }) => `${width}x${height}`);
    expect(new Set(sizes).size).toBe(PAGE_INVENTORY_VIEWPORTS.length);
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

  it('fails reviewer preflight before attempting the capture queue', () => {
    expect(() => assertReviewerAvailable('splotch-page-inventory-reviewer-is-missing')).toThrow(
      'to be available on PATH'
    );
  });

  it('terminates a stalled reviewer within its named timeout', async () => {
    let failure;
    try {
      await runReviewerProcess({
        binary: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1_000)'],
        cwd: fixture(),
        timeoutMs: 50,
        terminationGraceMs: 50,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure?.message).toBe('Reviewer timed out after 50 ms');
    expect(failure?.stderr).toContain('Reviewer timed out after 50 ms');
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
    expect(parseReviewerOutput(stdout)).toEqual(response);
  });

  it('rejects missing, unknown, and stale feedback', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const critique = join(root, 'design-critique.json');

    writeFileSync(
      critique,
      JSON.stringify({ schema_version: CRITIQUE_SCHEMA_VERSION, entries: entries.slice(1) })
    );
    expect(() => readDesignCritique(critique, manifest)).toThrow('15 of 16 required entries');

    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: CRITIQUE_SCHEMA_VERSION,
        entries: [{ ...entries[0], review_id: 'routes--unknown' }, ...entries.slice(1)],
      })
    );
    expect(() => readDesignCritique(critique, manifest)).toThrow('unknown review_id');

    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: CRITIQUE_SCHEMA_VERSION,
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
      schema_version: CRITIQUE_SCHEMA_VERSION,
      scope: {
        review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
        reviewer: FIXTURE_REVIEWER,
        surfaces_reviewed: 1,
        screenshots_reviewed: 16,
        expected_screenshots: 16,
        completeness: 'complete',
      },
      summary: {
        severity_counts: { pass: 4, low: 4, medium: 4, high: 4 },
        pixel_identical_groups: 0,
        divergent_pixel_identical_groups: 0,
      },
      pixel_identical_groups: [],
    });
    expect(document.entries).toHaveLength(16);
  });

  // Checkpoints outlive a run, so a resumed critique on a machine with the
  // other reviewer installed would otherwise merge two instruments into one
  // set of severity counts with nothing in the report to say so.
  it('refuses checkpoints reviewed by more than one runner', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const checkpoints = join(root, 'checkpoints');
    writeCheckpoints(checkpoints, manifest, entries);
    const [first] = manifest.captures;
    const document = JSON.parse(readFileSync(join(checkpoints, `${first.review_id}.json`), 'utf8'));
    writeFileSync(
      join(checkpoints, `${first.review_id}.json`),
      JSON.stringify({ ...document, reviewer: { runner: 'claude', model: 'sonnet' } })
    );

    await expect(
      finalizePageInventoryCritique([
        '--manifest',
        join(out, 'capture-manifest.json'),
        '--checkpoints',
        checkpoints,
        '--out',
        join(root, 'final.json'),
      ])
    ).rejects.toThrow(/mix reviewers/);
  });

  it('refuses a checkpoint that does not say who reviewed it', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const entries = critiqueEntries(manifest);
    const checkpoints = join(root, 'checkpoints');
    writeCheckpoints(checkpoints, manifest, entries);
    const [first] = manifest.captures;
    const { reviewer: _dropped, ...withoutReviewer } = JSON.parse(
      readFileSync(join(checkpoints, `${first.review_id}.json`), 'utf8')
    );
    writeFileSync(join(checkpoints, `${first.review_id}.json`), JSON.stringify(withoutReviewer));

    await expect(
      finalizePageInventoryCritique([
        '--manifest',
        join(out, 'capture-manifest.json'),
        '--checkpoints',
        checkpoints,
        '--out',
        join(root, 'final.json'),
      ])
    ).rejects.toThrow(/reviewer must name a runner and a model/);
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

  it('reports a review whose description changed as stale rather than as current', async () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const checkpoints = join(root, 'checkpoints');
    writeCheckpoints(checkpoints, manifest, critiqueEntries(manifest));
    const edited = manifest.captures[0];
    const path = join(checkpoints, `${edited.review_id}.json`);
    const document = JSON.parse(readFileSync(path, 'utf8'));
    document.review_description_sha256 = reviewDescriptionDigest(
      `${edited.review_description} A design note this review never saw.`
    );
    writeFileSync(path, JSON.stringify(document));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const args = ['--manifest', join(out, 'capture-manifest.json'), '--checkpoints', checkpoints];

    await finalizePageInventoryCritique([...args, '--status']);

    expect(JSON.parse(log.mock.calls.at(-1)[0])).toMatchObject({
      completed_reviews: 15,
      stale_review_ids: [edited.review_id],
      next_review: { review_id: edited.review_id, description: edited.review_description },
    });
    log.mockRestore();
    await expect(
      finalizePageInventoryCritique([...args, '--out', join(root, 'final.json')])
    ).rejects.toThrow('reviewed against a different description');
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

  it('allows pixel-identical captures across themes to receive different severities', () => {
    const out = join(fixture(), 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const light = manifest.captures.find(({ theme }) => theme === 'light');
    const dark = manifest.captures.find(
      ({ theme, viewport_id: viewportId }) => theme === 'dark' && viewportId === light.viewport_id
    );
    dark.sha256 = light.sha256;
    const entries = critiqueEntries(manifest);
    const darkEntry = entries.find(({ review_id: reviewId }) => reviewId === dark.review_id);
    darkEntry.severity = 'medium';
    darkEntry.recommendation = 'Improve night contrast.';

    expect(() => finalizeDesignCritique(manifest, entries)).not.toThrow();
  });

  it('keeps divergent severities across pixel-identical captures and records the group', () => {
    const out = join(fixture(), 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const [shell, twin] = manifest.captures.filter(({ theme }) => theme === 'light').slice(0, 2);
    twin.sha256 = shell.sha256;
    const entries = critiqueEntries(manifest);

    const critique = finalizeDesignCritique(manifest, entries);

    expect(critique.summary).toMatchObject({
      pixel_identical_groups: 1,
      divergent_pixel_identical_groups: 1,
    });
    expect(critique.pixel_identical_groups).toEqual([
      {
        sha256: shell.sha256,
        theme: 'light',
        divergent: true,
        reviews: [
          { review_id: shell.review_id, severity: 'pass' },
          { review_id: twin.review_id, severity: 'low' },
        ],
      },
    ]);
    const severities = new Map(
      critique.entries.map(({ review_id: reviewId, severity }) => [reviewId, severity])
    );
    expect(severities.get(shell.review_id)).toBe('pass');
    expect(severities.get(twin.review_id)).toBe('low');
  });

  it('rejects two captures whose pixels and review description are both identical', () => {
    const out = join(fixture(), 'page-inventory');
    const shared = { group: 'settings', title: 'Settings', description: 'The settings hub.' };
    const items = [
      inventoryItem({ ...shared, id: 'settings-overview' }),
      inventoryItem({ ...shared, id: 'settings-appearance' }),
    ];

    expect(() => writeSharedShellCaptures(out, items)).toThrow(
      /entries settings--settings-overview--\S+ and settings--settings-appearance--\S+ are indistinguishable reviews/
    );
  });

  it('refuses a design critique written against the previous schema version', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const critique = join(root, 'design-critique.json');
    writeFileSync(
      critique,
      JSON.stringify({
        schema_version: CRITIQUE_SCHEMA_VERSION - 1,
        entries: critiqueEntries(manifest),
      })
    );

    expect(() => readDesignCritique(critique, manifest)).toThrow(
      `schema_version must be ${CRITIQUE_SCHEMA_VERSION}`
    );
  });
});
