import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const state = vi.hoisted(() => ({ roots: null, candidate: null, gateResults: [] }));

vi.mock('../lib/paths.mjs', () => ({
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
  fail(message) {
    throw new Error(message);
  },
}));
vi.mock('../lib/page-notes.mjs', () => ({ pageLevers: () => null, describeLevers: () => '' }));
vi.mock('../lib/align-to-source.mjs', () => ({
  alignToSource: async (buffer) => ({ buffer, dx: 0, dy: 0 }),
}));
vi.mock('../lib/outline-match.mjs', () => ({
  KEEP_THRESHOLD: 0.92,
  LOCAL_KEEP_THRESHOLD: 0.8,
  outlineMatch: async () => {
    const passes = state.gateResults.shift();
    return {
      keep: passes ? 0.99 : 0.5,
      drift: passes ? 0.01 : 0.5,
      localKeep: passes ? 0.95 : 0.4,
      worstTile: null,
      overlay: state.candidate,
    };
  },
}));
vi.mock('../lib/eye-fill.mjs', () => ({
  scoreEyeFill: async () => ({}),
  judgeLightEyes: () => ({ passes: true }),
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
vi.mock('../../../web/src/lib/server/ai/geminiSafety.ts', () => ({
  classifyGeminiResponse: () => ({
    kind: 'image',
    data: state.candidate.toString('base64'),
    mimeType: 'image/webp',
  }),
}));

const originalArgv = process.argv;
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

async function runCli(...args) {
  process.argv = ['node', 'gen-coloring-fills.mjs', ...args];
  vi.resetModules();
  return import('../bin/gen-coloring-fills.mjs');
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
  process.env.GEMINI_API_KEY = 'test';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  process.argv = originalArgv;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  vi.restoreAllMocks();
  await rm(state.roots.root, { recursive: true, force: true });
});

test('retains failed candidates in scratch and leaves every page unshipped', async () => {
  await addPage('first-tall');
  await addPage('second-tall');
  state.gateResults = [false, false, false, false, false, true];

  await expect(runCli('test/first-tall', 'test/second-tall', '--apply')).rejects.toThrow(
    '1 render(s) failed.'
  );

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
});

test('does not ship a passing candidate without apply', async () => {
  await addPage('page-tall');
  state.gateResults = [true];

  await runCli('test/page-tall');

  expect(await readFile(join(state.roots.fillSrc, 'test/page-tall.light.raw.webp'), 'utf8')).toBe(
    'known-raw-page-tall'
  );
  expect(await readFile(join(state.roots.coloring, 'test/page-tall.light.webp'), 'utf8')).toBe(
    'known-shipped-page-tall'
  );
});

test('ships both raw and punched outputs when a candidate passes with apply', async () => {
  await addPage('page-tall');
  state.gateResults = [true];

  await runCli('test/page-tall', '--apply');

  const raw = await readFile(join(state.roots.fillSrc, 'test/page-tall.light.raw.webp'));
  const shipped = await readFile(join(state.roots.coloring, 'test/page-tall.light.webp'));
  expect(raw.toString()).not.toBe('known-raw-page-tall');
  expect(shipped.toString()).not.toBe('known-shipped-page-tall');
  expect(shipped).toEqual(raw);
});
