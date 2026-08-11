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
import { Window } from 'happy-dom';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writePageInventoryFeedback } from '../attach-page-inventory-feedback.mjs';
import { finalizePageInventoryCritique } from '../finalize-page-inventory-critique.mjs';
import {
  allSurfaces,
  discoverPageRoutes,
  generateOutputAtomically,
  generatePageInventory,
  selectSpotCheckItems,
  settingsSectionRowSelector,
} from '../gen-page-inventory.mjs';
import {
  assertReviewerAvailable,
  readStructuredOutput,
  reviewerArgs,
  runReviewerProcess,
} from '../run-page-inventory-critiques.mjs';
import { assertCaptureRendered } from '../lib/page-inventory-capture.mjs';
import {
  GENERAL_DESIGN_NOTES,
  SURFACE_DESIGN_NOTES,
  designNoteKey,
} from '../lib/page-inventory-design-notes.mjs';
import {
  captureRecord,
  captureReviewId,
  createCaptureManifest,
  finalizeDesignCritique,
  PAGE_INVENTORY_REVIEW_CONTRACT,
  readDesignCritique,
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

const COMPONENTS = join(ROOT, 'web/src/lib/components');

// A Svelte expression can contain `>` — an arrow function in an event handler —
// so an opening tag ends at the first `>` outside braces, not the first one.
function openingTagAround(source, index) {
  const start = source.lastIndexOf('<', index);
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    else if (source[cursor] === '}') depth -= 1;
    else if (source[cursor] === '>' && depth === 0) return source.slice(start, cursor + 1);
  }
  throw new Error(`Unterminated opening tag at ${index}`);
}

// Every `{…}` value becomes a plain string so an HTML parser can take the tag;
// the one under test becomes the id the selector asks for.
function staticizeExpressions(tag, attribute, value) {
  let html = '';
  let cursor = 0;
  while (cursor < tag.length) {
    const open = tag.indexOf('{', cursor);
    if (open === -1) return html + tag.slice(cursor);
    let depth = 0;
    let close = open;
    while (close < tag.length) {
      if (tag[close] === '{') depth += 1;
      else if (tag[close] === '}' && (depth -= 1) === 0) break;
      close += 1;
    }
    html += tag.slice(cursor, open);
    html += html.endsWith(`${attribute}=`) ? `"${value}"` : '"expression"';
    cursor = close + 1;
  }
  return html;
}

// Every element a component stamps `attribute` on, parsed out of the component
// the app actually ships, so a selector can be matched against real markup.
function markupElementsStamping(component, attribute, value) {
  const source = readFileSync(join(COMPONENTS, component), 'utf8');
  const { document } = new Window();
  const elements = [];
  for (
    let anchor = source.indexOf(`${attribute}={`);
    anchor !== -1;
    anchor = source.indexOf(`${attribute}={`, anchor + 1)
  ) {
    const html = staticizeExpressions(openingTagAround(source, anchor), attribute, value);
    const container = document.createElement('div');
    container.innerHTML = html;
    const element = container.firstElementChild;
    if (element?.getAttribute(attribute) !== value) {
      throw new Error(`${component} did not parse into a ${attribute} element: ${html}`);
    }
    elements.push(element);
  }
  if (!elements.length) throw new Error(`${component} stamps no ${attribute} expression`);
  return elements;
}

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

  it('omits the internal /dev harnesses the app still ships', () => {
    expect(existsSync(join(ROOT, 'web/src/routes/dev/+page.svelte'))).toBe(true);
    expect(discoverPageRoutes().filter((route) => route.startsWith('/dev'))).toEqual([]);
    expect(allSurfaces().filter(({ id }) => id.startsWith('dev'))).toEqual([]);
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

  it('keys every per-surface design note to a surface the inventory captures', () => {
    const captured = new Set(allSurfaces().map((item) => designNoteKey(item.group, item.id)));
    expect(Object.keys(SURFACE_DESIGN_NOTES).filter((key) => !captured.has(key))).toEqual([]);
    expect(Object.keys(SURFACE_DESIGN_NOTES).length).toBeGreaterThan(0);
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

  it('selects a spot-check subset and names the valid choices for a typo', () => {
    const surfaces = allSurfaces();
    expect(
      selectSpotCheckItems(surfaces, ['controls/clear-coachmark', 'home'], '--surface', (item) => [
        `${item.group}/${item.id}`,
        item.id,
      ]).map(({ id }) => id)
    ).toEqual(['home', 'clear-coachmark']);
    expect(selectSpotCheckItems(surfaces, [], '--surface', (item) => [item.id])).toHaveLength(
      surfaces.length
    );
    expect(() =>
      selectSpotCheckItems(PAGE_INVENTORY_THEMES, ['night'], '--theme', (theme) => [theme.id])
    ).toThrow('--theme names nothing in this inventory: night. Choose from: light, dark');
  });

  it('refuses to write a filtered spot check into the committed scrapbook', async () => {
    await expect(
      generatePageInventory(['--surface', 'home', '--out', 'scrapbook/page-inventory'])
    ).rejects.toThrow('must stay out of scrapbook/');
    await expect(generatePageInventory(['--surface', 'dev-engine'])).rejects.toThrow(
      '--surface names nothing in this inventory: dev-engine'
    );
  });

  // The run replaces --out wholesale, so a target that owns anything else is a
  // deletion the flags asked for by accident. Each of these resolves onto such a
  // tree, and a spot check reaches the rename with its guard already satisfied.
  it('refuses an --out that owns more than one run of output', async () => {
    for (const out of ['scrapbook', 'scrapbook/page-inventory/..', '.', '..']) {
      await expect(generatePageInventory(['--surface', 'home', '--out', out])).rejects.toThrow(
        '--out is replaced wholesale'
      );
      await expect(generatePageInventory(['--out', out])).rejects.toThrow(
        '--out is replaced wholesale'
      );
    }
  });

  // The generator waits on this selector at every viewport, so a Settings shell
  // that renames or re-tags its rows costs a multi-hour run rather than a test.
  // Matching the selector against the row templates the app really ships is what
  // makes that drift fail here — an assertion on the returned string could only
  // restate the function. The wide pane's own section wrappers are matched too,
  // because they carry the same attribute and must stay out of the selector.
  it('matches the row template of both Settings shells and no other section element', () => {
    const selector = settingsSectionRowSelector('appearance');
    const matching = (component) =>
      markupElementsStamping(component, 'data-section', 'appearance').filter((element) =>
        element.matches(selector)
      );

    // The wide shell's rows come from the shared guide rail, whose other
    // template is the anchor row /design and /changelog use.
    expect(matching('nav/SidebarToc.svelte')).toHaveLength(1);
    expect(matching('SettingsModal.svelte')).toHaveLength(1);
    // The pane wrappers the section-landed wait reads, which are not rows.
    expect(matching('settings/WideShell.svelte')).toHaveLength(0);
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

  it('rejects different severities for pixel-identical captures in the same theme', () => {
    const out = join(fixture(), 'page-inventory');
    const manifest = writeCaptures(out, inventoryItem());
    const sameTheme = manifest.captures.filter(({ theme }) => theme === 'light').slice(0, 2);
    sameTheme[1].sha256 = sameTheme[0].sha256;
    const entries = critiqueEntries(manifest);

    expect(() => finalizeDesignCritique(manifest, entries)).toThrow(
      'have conflicting severities pass and low'
    );
  });
});
