import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { MAX_ATTEMPTS } from '../lib/asset-cli.mjs';
import { run, RenderFailuresError } from '../coloring/gen-light-fills.mjs';

// One page's worth of gate misses — enough to exhaust every retry and fail it.
const exhaustPage = () => Array(MAX_ATTEMPTS).fill(false);

const state = vi.hoisted(() => ({
  roots: null,
  candidate: null,
  gateResults: [],
  overlayRequests: 0,
  eyeVerdict: { passes: true, gated: true },
}));

vi.mock('../lib/asset-paths.mjs', () => ({
  get REPO_ROOT() {
    return state.roots.root;
  },
  get COLORING_DIR() {
    return state.roots.coloring;
  },
  get FILL_SRC_DIR() {
    return state.roots.fillSrc;
  },
  get SAMPLES_DIR() {
    return state.roots.samples;
  },
  toPosix(rel) {
    return rel.replaceAll('\\', '/');
  },
}));
vi.mock('../lib/asset-cli.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  fail(message) {
    throw new Error(message);
  },
}));
vi.mock('../lib/page-notes.mjs', () => ({ pageLevers: () => null, describeLevers: () => '' }));
vi.mock('../lib/align-to-source.mjs', () => ({
  alignToSource: async (buffer) => ({ buffer, dx: 0, dy: 0 }),
}));
vi.mock('../lib/outline-match.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  outlineMatch: async (_source, _filled, { overlay = false } = {}) => {
    if (overlay) {
      state.overlayRequests++;
      return {
        keep: 1,
        drift: 0,
        localKeep: 1,
        worstTile: null,
        overlay: state.candidate,
      };
    }
    const passes = state.gateResults.shift();
    return {
      keep: passes ? 0.99 : 0.5,
      drift: passes ? 0.01 : 0.5,
      localKeep: passes ? 0.95 : 0.4,
      worstTile: null,
      overlay: null,
    };
  },
}));
vi.mock('../lib/eye-fill.mjs', () => ({
  scoreEyeFill: async () => ({}),
  judgeLightEyes: () => state.eyeVerdict,
}));
vi.mock('../lib/punch-fill.mjs', () => ({
  punchFill: async (rawPath) => {
    const rel = rawPath.slice(state.roots.fillSrc.length + 1).replace('.raw.webp', '.webp');
    const out = join(state.roots.coloring, rel);
    await writeFile(out, await readFile(rawPath));
    return { out };
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: async () => ({}) };
  },
}));
vi.mock('../lib/gemini-response.ts', () => ({
  classifyGeminiResponse: () => ({
    kind: 'image',
    data: state.candidate.toString('base64'),
    mimeType: 'image/webp',
  }),
}));

const originalKey = process.env.GEMINI_API_KEY;

async function addPage(name) {
  const dir = join(state.roots.coloring, 'test');
  await mkdir(dir, { recursive: true });
  await mkdir(join(state.roots.fillSrc, 'test'), { recursive: true });
  const source = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .webp()
    .toBuffer();
  await writeFile(join(dir, `${name}.outline.webp`), source);
  await writeFile(join(state.roots.fillSrc, `test/${name}.light.raw.webp`), `known-raw-${name}`);
  await writeFile(join(dir, `${name}.light.webp`), `known-shipped-${name}`);
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'splotch-light-fill-cli-'));
  state.roots = {
    root,
    coloring: join(root, 'coloring'),
    fillSrc: join(root, 'fill-src'),
    samples: join(root, 'samples'),
  };
  state.candidate = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ff0000' },
  })
    .webp()
    .toBuffer();
  state.gateResults = [];
  state.overlayRequests = 0;
  state.eyeVerdict = { passes: true, gated: true };
  process.env.GEMINI_API_KEY = 'test';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  vi.restoreAllMocks();
  await rm(state.roots.root, { recursive: true, force: true });
});

it('retains failed candidates in scratch and leaves every page unshipped', async () => {
  await addPage('first-tall');
  await addPage('second-tall');
  state.gateResults = [...exhaustPage(), true];

  // Exactly the one gate-exhausted page counts as failed; the passing page is
  // simply left unshipped because the run as a whole failed closed.
  const err = await run(['test/first-tall', 'test/second-tall', '--apply']).catch((e) => e);
  expect(err).toBeInstanceOf(RenderFailuresError);
  expect(err.failed).toBe(1);

  expect(await readFile(join(state.roots.fillSrc, 'test/first-tall.light.raw.webp'), 'utf8')).toBe(
    'known-raw-first-tall'
  );
  expect(await readFile(join(state.roots.coloring, 'test/first-tall.light.webp'), 'utf8')).toBe(
    'known-shipped-first-tall'
  );
  expect(await readFile(join(state.roots.fillSrc, 'test/second-tall.light.raw.webp'), 'utf8')).toBe(
    'known-raw-second-tall'
  );
  expect(await readFile(join(state.roots.coloring, 'test/second-tall.light.webp'), 'utf8')).toBe(
    'known-shipped-second-tall'
  );
  await expect(
    readFile(join(state.roots.samples, 'test/first-tall/sample-1.webp'))
  ).resolves.toBeTruthy();
  await expect(
    readFile(join(state.roots.samples, 'test/second-tall/sample-1.webp'))
  ).resolves.toBeTruthy();
  expect(state.overlayRequests).toBe(2);
});

it('does not ship a passing candidate without apply', async () => {
  await addPage('page-tall');
  state.gateResults = [true];

  expect(await run(['test/page-tall'])).toEqual({ failed: 0, shipped: [] });

  expect(await readFile(join(state.roots.fillSrc, 'test/page-tall.light.raw.webp'), 'utf8')).toBe(
    'known-raw-page-tall'
  );
  expect(await readFile(join(state.roots.coloring, 'test/page-tall.light.webp'), 'utf8')).toBe(
    'known-shipped-page-tall'
  );
});

it('accepts an ungated eye verdict without ranking it as positive evidence', async () => {
  await addPage('page-tall');
  state.gateResults = [true];
  state.eyeVerdict = { passes: true, gated: false };

  expect(await run(['test/page-tall'])).toEqual({ failed: 0, shipped: [] });
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('eyes ungated'));
});

it('surfaces sample drift for review without failing the run', async () => {
  await addPage('page-tall');
  state.gateResults = [...exhaustPage(), ...exhaustPage()]; // both samples miss every gate

  // A multi-sample run is review-only (--apply is rejected with --samples > 1), so
  // gate misses while exploring palettes must not exit nonzero.
  expect(await run(['test/page-tall', '--samples', '2'])).toEqual({ failed: 0, shipped: [] });

  // Both candidates land in scratch for the reviewer...
  await expect(
    readFile(join(state.roots.samples, 'test/page-tall/sample-1.webp'))
  ).resolves.toBeTruthy();
  await expect(
    readFile(join(state.roots.samples, 'test/page-tall/sample-2.webp'))
  ).resolves.toBeTruthy();

  // ...and the committed raw + shipped bytes are never touched.
  expect(await readFile(join(state.roots.fillSrc, 'test/page-tall.light.raw.webp'), 'utf8')).toBe(
    'known-raw-page-tall'
  );
  expect(await readFile(join(state.roots.coloring, 'test/page-tall.light.webp'), 'utf8')).toBe(
    'known-shipped-page-tall'
  );
});

it('fails closed when a single review render misses every gate', async () => {
  await addPage('page-tall');
  state.gateResults = exhaustPage(); // the one candidate misses every gate

  // A single render (no --samples) is not review-exploration: gate exhaustion must
  // exit nonzero rather than silently pass, even without --apply.
  const err = await run(['test/page-tall']).catch((e) => e);
  expect(err).toBeInstanceOf(RenderFailuresError);
  expect(err.failed).toBe(1);

  // Every retry was spent before the run gave up.
  expect(state.gateResults).toHaveLength(0);
  expect(await readFile(join(state.roots.fillSrc, 'test/page-tall.light.raw.webp'), 'utf8')).toBe(
    'known-raw-page-tall'
  );
  expect(await readFile(join(state.roots.coloring, 'test/page-tall.light.webp'), 'utf8')).toBe(
    'known-shipped-page-tall'
  );
});

it('ships both raw and punched outputs when a candidate passes with apply', async () => {
  await addPage('page-tall');
  state.gateResults = [true];

  expect(await run(['test/page-tall', '--apply'])).toEqual({
    failed: 0,
    shipped: [{ rel: 'test/page-tall' }],
  });

  const raw = await readFile(join(state.roots.fillSrc, 'test/page-tall.light.raw.webp'));
  const shipped = await readFile(join(state.roots.coloring, 'test/page-tall.light.webp'));
  expect(raw.toString()).not.toBe('known-raw-page-tall');
  expect(shipped.toString()).not.toBe('known-shipped-page-tall');
  expect(shipped).toEqual(raw);
});
