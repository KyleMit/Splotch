import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Window } from 'happy-dom';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReviewerOutput } from '../lib/reviewer-runner.mjs';
import { writePageInventoryFeedback } from '../attach-page-feedback.mjs';
import {
  CHECKPOINT_SCHEMA_VERSION,
  finalizePageInventoryCritique,
} from '../finalize-page-critique.mjs';
import {
  allSurfaces,
  discoverPageRoutes,
  generateOutputAtomically,
  generatePageInventory,
  parsePageInventoryOptions,
  SECTION_LANDED_BAND_PX,
  selectSpotCheckItems,
  settingsSectionRowSelector,
} from '../capture-page-inventory.mjs';
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

// The AI surfaces are driven to a state and then waited on by class, and a
// screenshot of the wrong state never fails — only the wait does, after the
// timeout, on a run nobody starts between UI changes. Moving the confirmation
// into its own dialog renamed the class the harness waits for (5b6e4e5) and left
// that surface uncapturable until the next full run, so the pair is held here
// instead of by the run.
describe('AI surface selectors', () => {
  const COMPONENTS_DIR = join(ROOT, 'web/src/lib/components');
  // Whole class tokens, never a substring of the rendered markup: renaming
  // .ai-report-confirm back to .ai-report-confirmation would satisfy a substring
  // search of this same source while the harness waited on a class no element
  // carries. Both spellings a component paints one by — a static class attribute
  // and a class: directive — count; an interpolated attribute is not a token
  // this can read, and a surface driven by one would fail here rather than pass
  // quietly.
  const shippedClasses = new Set(
    readdirSync(COMPONENTS_DIR)
      .filter((name) => /^Ai[A-Z].*\.svelte$/.test(name))
      .flatMap((name) => {
        const source = readFileSync(join(COMPONENTS_DIR, name), 'utf8');
        const attributes = [...source.matchAll(/class="([^"{]*)"/g)].flatMap(([, value]) =>
          value.split(/\s+/)
        );
        const directives = [...source.matchAll(/class:([\w-]+)/g)].map(([, token]) => token);
        return [...attributes, ...directives].filter(Boolean);
      })
  );

  // Read out of the harness rather than restated, so a selector edited on either
  // side has to still name a class the AI components paint.
  const waitedOn = [
    ...new Set(
      [
        ...readFileSync(
          join(ROOT, 'tools/page-inventory/capture-page-inventory.mjs'),
          'utf8'
        ).matchAll(/locator\('([^']+)'\)/g),
      ]
        .map(([, selector]) => selector)
        .filter((selector) => /(^|\.)(ai-|stage-img|dial\b)/.test(selector))
    ),
  ];

  it('drives the AI surfaces by selector', () => {
    expect(waitedOn.length).toBeGreaterThanOrEqual(4);
  });

  it.each(waitedOn)('waits on %s, which the AI components still paint', (selector) => {
    for (const className of selector.split('.').slice(1)) {
      expect([...shippedClasses]).toContain(className);
    }
  });
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

  // /beta is one route with two panels behind a platform picker, and every
  // capture context carries an iPhone or iPad user agent, so the generic
  // one-shot-per-route pass would photograph the iOS panel eight times and never
  // review the Android one. Both panels earn their own surface, each deep-linked
  // so the page's pre-paint stamp opens the tab the capture is named for.
  it('captures each beta panel as its own surface rather than the bare route', () => {
    expect(existsSync(join(ROOT, 'web/src/routes/beta/+page.svelte'))).toBe(true);
    expect(discoverPageRoutes()).not.toContain('/beta');

    const beta = allSurfaces().filter(({ id }) => id.startsWith('beta'));
    expect(beta.map(({ id }) => id).sort()).toEqual(['beta-android', 'beta-ios']);
    for (const panel of beta) {
      expect(panel.source).toBe(`/beta?os=${panel.id.replace('beta-', '')}`);
    }
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

  it('keys every per-surface design note to a surface the inventory captures', () => {
    const captured = new Set(allSurfaces().map((item) => designNoteKey(item.group, item.id)));
    expect(Object.keys(SURFACE_DESIGN_NOTES).filter((key) => !captured.has(key))).toEqual([]);
    expect(Object.keys(SURFACE_DESIGN_NOTES).length).toBeGreaterThan(0);
  });

  it('keys every group design note to a group the inventory captures', () => {
    const captured = new Set(allSurfaces().map((item) => item.group));
    expect(Object.keys(GROUP_DESIGN_NOTES).filter((key) => !captured.has(key))).toEqual([]);
    expect(Object.keys(GROUP_DESIGN_NOTES).length).toBeGreaterThan(0);
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

  // The tests below drive the parser rather than generatePageInventory, which
  // builds the app and then replaces --out — so an accepted path can only be
  // asserted here, and a refusal asserted here is one the run never reaches
  // because the tests above prove the parser is what stops it.

  // An --out anywhere outside the worktree used to clear every guard on a spot
  // check: nothing there is the repo root, an ancestor of it, or inside
  // scrapbook/, so the run reached the rename and deleted the named directory.
  it('refuses an --out outside the repository', () => {
    const outside = [
      '/tmp',
      '/private/tmp/splotch-page-inventory-probe',
      '../splotch-page-inventory-probe',
      homedir(),
    ];
    for (const out of outside) {
      for (const argv of [
        ['--out', out],
        ['--surface', 'home', '--out', out],
      ]) {
        expect(() => parsePageInventoryOptions(argv)).toThrow('--out is replaced wholesale');
        expect(() => parsePageInventoryOptions(argv)).toThrow(resolve(ROOT, out));
      }
    }
  });

  // A full run's only destination is the inventory it publishes. Every sibling
  // collection in scrapbook/ is committed output owned by another tool, and the
  // inventory's own assets/ is written as part of the directory above it.
  it('refuses a full run --out on any directory but the published inventory', () => {
    const siblings = readdirSync(join(ROOT, 'scrapbook'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'page-inventory')
      .map((entry) => `scrapbook/${entry.name}`);
    expect(siblings.length).toBeGreaterThan(0);
    for (const out of [
      ...siblings,
      'scrapbook/page-inventory/assets',
      '.scrapbook-scratch/page-inventory-spot-check',
    ]) {
      expect(() => parsePageInventoryOptions(['--out', out])).toThrow(
        '--out is replaced wholesale'
      );
      expect(() => parsePageInventoryOptions(['--out', out])).toThrow(join(ROOT, out));
    }
  });

  // A spot check writes scratch, but .scrapbook-scratch/ is not all its own: the
  // critique checkpoints live beside it and are the resumable record of a review
  // pass that costs hours of reviewer calls to rebuild.
  it('refuses a spot check --out outside the scratch directory it owns', () => {
    for (const out of [
      '.scrapbook-scratch',
      '.scrapbook-scratch/page-inventory-critique',
      '.scrapbook-scratch/page-inventory-critique/reviews',
    ]) {
      const argv = ['--surface', 'home', '--out', out];
      expect(() => parsePageInventoryOptions(argv)).toThrow('--out is replaced wholesale');
      expect(() => parsePageInventoryOptions(argv)).toThrow(join(ROOT, out));
    }
  });

  it('accepts the two directories this generator owns, whether or not they exist', () => {
    const inventory = join(ROOT, 'scrapbook/page-inventory');
    const scratch = join(ROOT, '.scrapbook-scratch/page-inventory-spot-check');
    expect(parsePageInventoryOptions([]).out).toBe(inventory);
    expect(parsePageInventoryOptions(['--out', 'scrapbook/page-inventory']).out).toBe(inventory);
    expect(parsePageInventoryOptions(['--surface', 'home']).out).toBe(scratch);
    expect(
      parsePageInventoryOptions([
        '--surface',
        'home',
        '--out',
        '.scrapbook-scratch/page-inventory-spot-check',
      ]).out
    ).toBe(scratch);

    // A run creates its own output directory, so a first run into a name that
    // does not exist yet has to be accepted.
    const unwritten = join(scratch, 'brush-menu-only');
    expect(existsSync(unwritten)).toBe(false);
    expect(parsePageInventoryOptions(['--surface', 'brush-menu', '--out', unwritten]).out).toBe(
      unwritten
    );
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

  // The wide shell parks a jumped section below the pane's top edge — its own
  // jump inset, or the pane's padding for the first section, which cannot scroll
  // any higher. A capture that waits for the section flush against that edge
  // waits forever, so the band has to clear whichever inset the shell uses.
  it('waits within a band that covers where the wide shell parks a section', () => {
    const shell = readFileSync(join(COMPONENTS, 'settings/WideShell.svelte'), 'utf8');
    const jumpInsetPx = Number(/SECTION_JUMP_INSET_PX = (\d+)/.exec(shell)?.[1]);
    const panePaddingTopPx = Number(
      /\.settings-pane\s*\{[^}]*?\bpadding:\s*(\d+)px/s.exec(shell)?.[1]
    );

    expect(jumpInsetPx).toBeGreaterThan(0);
    expect(panePaddingTopPx).toBeGreaterThan(0);
    expect(jumpInsetPx).toBeLessThan(SECTION_LANDED_BAND_PX);
    expect(panePaddingTopPx).toBeLessThan(SECTION_LANDED_BAND_PX);
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
    expect(html).not.toContain('class="review"');
    expect(html).not.toContain('data-facet="severity"');
    expect(html).toContain('data-severity="unreviewed"');
  });

  it('attaches complete hash-bound feedback without changing images', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const item = inventoryItem();
    const manifest = writeCaptures(out, item);
    const entries = critiqueEntries(manifest);
    const critique = join(root, 'design-critique.json');
    writeFileSync(critique, JSON.stringify({ schema_version: CRITIQUE_SCHEMA_VERSION, entries }));
    const firstImage = join(out, entries[0].image);
    const originalImage = readFileSync(firstImage, 'utf8');

    expect(writePageInventoryFeedback(out, critique, [item])).toBe(16);

    const html = readFileSync(join(out, 'index.html'), 'utf8');
    for (const severity of ['pass', 'low', 'medium', 'high']) {
      expect(html).toContain(`class="shot severity-${severity}"`);
      expect(html).toContain(`data-severity="${severity}"`);
      expect(html).toContain(`data-facet="severity" value="${severity}"`);
    }
    expect(html).toContain('Filter by severity');
    expect(html).toContain('<h4>Light mode</h4>');
    expect(html).toContain('<h4>Night mode</h4>');
    expect(html).toContain('<strong>Small iPhone</strong><span>812 × 375</span>');
    expect(html).toContain('data-where="iPhone 13 mini · Portrait · 375 × 812 · light mode"');
    expect(html).toContain('class="orientation-label">Landscape</p>');
    expect(html).toContain('severity.size && !severity.has(d.severity)');
    expect(html).toContain("surface.hidden = !surface.querySelector('.shot:not([hidden])')");
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

  it('marks the shots of a shared shell as pixel-identical in the report', () => {
    const root = fixture();
    const out = join(root, 'page-inventory');
    const items = [
      inventoryItem({
        group: 'settings',
        id: 'settings-overview',
        title: 'Settings',
        description: 'The settings hub.',
      }),
      inventoryItem({
        group: 'settings',
        id: 'settings-appearance',
        title: 'Appearance settings',
        description: 'The appearance section.',
      }),
    ];
    const manifest = writeSharedShellCaptures(out, items);
    const entries = critiqueEntries(manifest);
    const agreed = manifest.captures.slice(-2).map(({ review_id: reviewId }) => reviewId);
    for (const entry of entries.filter(({ review_id: reviewId }) => agreed.includes(reviewId))) {
      entry.severity = 'pass';
      entry.recommendation = null;
    }
    const critique = join(root, 'design-critique.json');
    writeFileSync(critique, JSON.stringify(finalizeDesignCritique(manifest, entries)));

    expect(writePageInventoryFeedback(out, critique, items)).toBe(32);

    const document = JSON.parse(readFileSync(critique, 'utf8'));
    expect(document.summary).toMatchObject({
      pixel_identical_groups: 16,
      divergent_pixel_identical_groups: 15,
    });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('Pixel-identical to 1 other capture in this theme, judged differently.');
    expect(html).toContain('Pixel-identical to 1 other capture in this theme.');
  });
});
