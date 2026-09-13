import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_REPORT_RETENTION_DAYS } from '../../web/src/lib/imageReport.ts';
import {
  fetchImageReports,
  isReportExpired,
  modelEvalInputFilename,
  planReportBundles,
  pruneExpiredLocalReports,
  READABLE_METADATA_VERSION,
  resolveProductionSite,
} from '../fetch-image-reports.mjs';

const store = vi.hoisted(() => ({ set: vi.fn(), setJSON: vi.fn(), delete: vi.fn() }));
vi.mock('@netlify/blobs', () => ({ getStore: () => store }));

const { saveImageReport } = await import('../../web/src/lib/server/imageReportStore.ts');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-20T00:00:00.000Z');
const FIRST_REPORT = '1786530951977-1c086d5f-f68f-437e-8c5c-88b3243987f8';
const SECOND_REPORT = '1786584074977-f8d9b64d-57ab-407a-bde3-f578fbabb22f';
const EXPIRED_REPORT = `${NOW - (IMAGE_REPORT_RETENTION_DAYS + 1) * DAY_MS}-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

function blob(key, etag = `etag-${key}`) {
  return { key, etag };
}

function reportBlobs(reportId, inputExtension = 'png') {
  return [
    blob(`${reportId}/output.png`),
    blob(`${reportId}/prompt.txt`),
    blob(`${reportId}/input.${inputExtension}`),
    blob(`${reportId}/metadata.json`),
  ];
}

function refusalBlobs(reportId) {
  return reportBlobs(reportId).filter(({ key }) => !key.endsWith('/output.png'));
}

function pictureMetadata(overrides = {}) {
  return {
    version: 2,
    kind: 'picture',
    reportedAt: '2026-08-12T10:35:51.977Z',
    deleteAfter: '2026-09-11T10:35:51.977Z',
    style: 'Magical',
    inputContentType: 'image/png',
    outputContentType: 'image/png',
    refusalReason: null,
    ...overrides,
  };
}

function refusalMetadata(overrides = {}) {
  return pictureMetadata({
    kind: 'false-positive-refusal',
    outputContentType: null,
    refusalReason: 'IMAGE_SAFETY',
    ...overrides,
  });
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-fetch-image-reports-'));
  temporaryRoots.push(root);
  return root;
}

function fakeNetlify({ blobs, metadataFor = () => pictureMetadata(), calls = [] }) {
  return (args, options) => {
    calls.push({ args, options });
    if (args[0] === 'sites:list') {
      return JSON.stringify([
        { id: 'production-site', name: 'splotchy', custom_domain: 'splotch.art' },
      ]);
    }
    if (args[0] === 'blobs:list') return JSON.stringify({ blobs });
    const key = args[2];
    const reportId = key.slice(0, key.indexOf('/'));
    const filename = key.slice(key.indexOf('/') + 1);
    const contents =
      filename === 'metadata.json' ? JSON.stringify(metadataFor(reportId)) : `data:${filename}`;
    writeFileSync(args[4], contents);
    return '';
  };
}

function readManifest(root, snapshotId) {
  return JSON.parse(
    readFileSync(join(root, '.eval-tmp', 'ai-image-reports', snapshotId, 'manifest.json'), 'utf8')
  );
}

describe('report listing', () => {
  it('groups complete bundles and sorts their files and report ids', () => {
    const plan = planReportBundles({
      blobs: [...reportBlobs(SECOND_REPORT), ...reportBlobs(FIRST_REPORT)],
    });

    expect(plan.failures).toEqual([]);
    expect(plan.bundles.map(({ reportId }) => reportId)).toEqual([FIRST_REPORT, SECOND_REPORT]);
    expect(plan.bundles[0].files.map(({ filename }) => filename)).toEqual([
      'input.png',
      'metadata.json',
      'output.png',
      'prompt.txt',
    ]);
  });

  it('plans an output-less refusal bundle and rejects a bundle with two outputs', () => {
    const plan = planReportBundles({
      blobs: [
        ...refusalBlobs(FIRST_REPORT),
        ...reportBlobs(SECOND_REPORT),
        blob(`${SECOND_REPORT}/output.webp`),
      ],
    });

    expect(plan.bundles).toHaveLength(1);
    expect(plan.bundles[0]).toMatchObject({ reportId: FIRST_REPORT, output: null });
    expect(plan.failures).toEqual([
      { reportId: SECOND_REPORT, error: 'expected at most one output image' },
    ]);
  });

  it('separates incomplete reports without rejecting complete bundles', () => {
    const plan = planReportBundles({
      blobs: [...reportBlobs(FIRST_REPORT).slice(0, 3), ...reportBlobs(SECOND_REPORT)],
    });

    expect(plan.bundles.map(({ reportId }) => reportId)).toEqual([SECOND_REPORT]);
    expect(plan.failures).toEqual([{ reportId: FIRST_REPORT, error: 'missing metadata.json' }]);
  });

  it.each([
    `${FIRST_REPORT}/../../secrets.txt`,
    `../${FIRST_REPORT}/metadata.json`,
    `${FIRST_REPORT}/nested/metadata.json`,
    `/${FIRST_REPORT}/metadata.json`,
    `1..-ab/metadata.json`,
    `${FIRST_REPORT}\\metadata.json`,
  ])('rejects the unsafe store key %s before downloading', (key) => {
    expect(() => planReportBundles({ blobs: [blob(key)] })).toThrow(
      /Unexpected ai-image-reports key/
    );
  });
});

describe('production site resolution', () => {
  it('selects the unique site serving splotch.art', () => {
    expect(
      resolveProductionSite([
        { id: 'other', custom_domain: 'example.com' },
        { id: 'production', name: 'splotchy', custom_domain: 'splotch.art' },
      ])
    ).toEqual({ id: 'production', name: 'splotchy' });
  });

  it('rejects missing and ambiguous production sites', () => {
    expect(() => resolveProductionSite([])).toThrow(/found 0/);
    expect(() =>
      resolveProductionSite([
        { id: 'one', custom_domain: 'splotch.art' },
        { id: 'two', ssl_url: 'https://splotch.art' },
      ])
    ).toThrow(/found 2/);
  });
});

describe('store round trip', () => {
  async function writeWithProductionStore(input) {
    const written = new Map();
    store.set.mockReset().mockImplementation(async (key, value) => {
      written.set(key, typeof value === 'string' ? value : Buffer.from(await value.arrayBuffer()));
      return { modified: true };
    });
    store.setJSON.mockReset().mockImplementation(async (key, value) => {
      written.set(key, JSON.stringify(value));
      return { modified: true };
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const saved = await saveImageReport(input);
    vi.useRealTimers();
    return { saved, written };
  }

  function fetchWrittenBundle(written) {
    const root = fixtureRoot();
    const command = (args) => {
      if (args[0] === 'sites:list') {
        return JSON.stringify([{ id: 'site', custom_domain: 'splotch.art' }]);
      }
      if (args[0] === 'blobs:list') {
        return JSON.stringify({ blobs: [...written.keys()].map((key) => blob(key)) });
      }
      writeFileSync(args[4], written.get(args[2]));
      return '';
    };
    const result = fetchImageReports({ root, snapshotId: 'round-trip', command, now: NOW });
    return { root, result };
  }

  it('reads the metadata version the production store writes', async () => {
    const { written } = await writeWithProductionStore({
      kind: 'picture',
      input: new Blob(['drawing'], { type: 'image/png' }),
      output: new Blob(['result'], { type: 'image/jpeg' }),
      prompt: 'Resolved prompt',
      style: 'Crayon',
    });
    const [metadataKey] = [...written.keys()].filter((key) => key.endsWith('/metadata.json'));

    expect(JSON.parse(written.get(metadataKey)).version).toBe(READABLE_METADATA_VERSION);
  });

  it('fetches a picture report with its resolved prompt, output image, and metadata', async () => {
    const { saved, written } = await writeWithProductionStore({
      kind: 'picture',
      input: new Blob(['drawing'], { type: 'image/png' }),
      output: new Blob(['result'], { type: 'image/jpeg' }),
      prompt: 'Resolved prompt',
      style: 'Crayon',
    });
    const { root, result } = fetchWrittenBundle(written);
    const reportDir = join(root, '.eval-tmp', 'ai-image-reports', 'round-trip', saved.reportId);

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].metadata).toEqual(
      JSON.parse(written.get(`${saved.keyPrefix}metadata.json`))
    );
    expect(result.reports[0].files.map(({ filename }) => filename)).toEqual([
      'input.png',
      'metadata.json',
      'output.jpg',
      'prompt.txt',
    ]);
    expect(readFileSync(join(reportDir, 'prompt.txt'), 'utf8')).toBe('Resolved prompt');
    expect(readFileSync(join(reportDir, 'output.jpg'), 'utf8')).toBe('result');
  });

  it('fetches a false-positive refusal report with no output image', async () => {
    const { saved, written } = await writeWithProductionStore({
      kind: 'false-positive-refusal',
      input: new Blob(['drawing'], { type: 'image/webp' }),
      output: null,
      prompt: 'Resolved prompt',
      style: null,
      refusalReason: 'IMAGE_SAFETY',
    });
    const { root, result } = fetchWrittenBundle(written);
    const reportDir = join(root, '.eval-tmp', 'ai-image-reports', 'round-trip', saved.reportId);

    expect(readManifest(root, 'round-trip').failures).toEqual([]);
    expect(result.reports[0].metadata).toMatchObject({
      kind: 'false-positive-refusal',
      outputContentType: null,
      refusalReason: 'IMAGE_SAFETY',
    });
    expect(readdirSync(reportDir).sort()).toEqual(['input.webp', 'metadata.json', 'prompt.txt']);
  });
});

describe('metadata validation', () => {
  it.each([
    [
      'the retired version 1',
      reportBlobs(FIRST_REPORT),
      pictureMetadata({ version: 1, kind: undefined, refusalReason: undefined }),
      'unsupported metadata version 1 (this tool reads version 2)',
    ],
    [
      'an unknown future version',
      reportBlobs(FIRST_REPORT),
      pictureMetadata({ version: 3 }),
      'unsupported metadata version 3 (this tool reads version 2)',
    ],
    [
      'a missing version',
      reportBlobs(FIRST_REPORT),
      pictureMetadata({ version: undefined }),
      'unsupported metadata version undefined (this tool reads version 2)',
    ],
    [
      'an unknown kind',
      reportBlobs(FIRST_REPORT),
      pictureMetadata({ kind: 'complaint' }),
      'unknown report kind "complaint"',
    ],
    [
      'a picture without an output',
      refusalBlobs(FIRST_REPORT),
      pictureMetadata(),
      'picture report has no output image',
    ],
    [
      'a refusal with an output',
      reportBlobs(FIRST_REPORT),
      refusalMetadata(),
      'refusal report has an output image',
    ],
    [
      'a refusal without its reason',
      refusalBlobs(FIRST_REPORT),
      refusalMetadata({ refusalReason: null }),
      'refusal report has no refusal reason',
    ],
    [
      'a mismatched input content type',
      reportBlobs(FIRST_REPORT, 'webp'),
      pictureMetadata(),
      'input filename and content type disagree',
    ],
  ])('manifests %s as a per-report failure', (_label, blobs, metadata, error) => {
    const root = fixtureRoot();
    const command = fakeNetlify({
      blobs: [...blobs, ...reportBlobs(SECOND_REPORT)],
      metadataFor: (reportId) => (reportId === FIRST_REPORT ? metadata : pictureMetadata()),
    });

    expect(() => fetchImageReports({ root, snapshotId: 'invalid', command, now: NOW })).toThrow(
      /Fetched 1 report\(s\).*1 failed/s
    );
    const manifest = readManifest(root, 'invalid');
    expect(manifest.reports.map(({ reportId }) => reportId)).toEqual([SECOND_REPORT]);
    expect(manifest.failures).toEqual([
      { reportId: FIRST_REPORT, error: `${FIRST_REPORT}/metadata.json: ${error}` },
    ]);
  });
});

describe('fetchImageReports', () => {
  it('downloads, validates, and manifests production reports without importing by default', () => {
    const root = fixtureRoot();
    const calls = [];
    const command = fakeNetlify({ blobs: reportBlobs(FIRST_REPORT), calls });

    const result = fetchImageReports({ root, snapshotId: 'snapshot', command, now: NOW });
    const reportDir = join(root, '.eval-tmp', 'ai-image-reports', 'snapshot', FIRST_REPORT);
    const evalInput = join(
      root,
      'tools',
      'model-eval',
      'inputs',
      modelEvalInputFilename(FIRST_REPORT, 'Magical')
    );
    const manifest = readManifest(root, 'snapshot');

    expect(result.reports).toHaveLength(1);
    expect(readFileSync(join(reportDir, 'prompt.txt'), 'utf8')).toBe('data:prompt.txt');
    expect(existsSync(evalInput)).toBe(false);
    expect(manifest.reports[0]).toMatchObject({
      reportId: FIRST_REPORT,
      evalInput: null,
      evalInputStatus: 'not-requested',
    });
    expect(manifest.expired).toEqual([]);
    expect(calls.filter(({ args }) => args[0] === 'blobs:get')).toHaveLength(4);
    expect(calls.find(({ args }) => args[0] === 'blobs:list').options.env.NETLIFY_SITE_ID).toBe(
      'production-site'
    );
  });

  it('keeps an identical existing eval input and refuses a conflicting one', () => {
    const root = fixtureRoot();
    const evalInput = join(
      root,
      'tools',
      'model-eval',
      'inputs',
      modelEvalInputFilename(FIRST_REPORT, 'Magical')
    );
    const command = fakeNetlify({ blobs: reportBlobs(FIRST_REPORT) });
    const fetchSnapshot = (snapshotId) =>
      fetchImageReports({ root, snapshotId, command, importEvalInputs: true, now: NOW });

    fetchSnapshot('first');
    expect(fetchSnapshot('second').reports[0].evalInputStatus).toBe('unchanged');

    writeFileSync(evalInput, 'different');
    expect(() => fetchSnapshot('third')).toThrow(/1 model-eval input conflict/);
    const manifest = readManifest(root, 'third');
    expect(manifest.failures).toEqual([]);
    expect(manifest.reports[0].evalInputStatus).toBe('conflict');
    expect(readFileSync(evalInput, 'utf8')).toBe('different');
  });

  it('downloads complete reports and manifests incomplete ones as failures', () => {
    const root = fixtureRoot();
    const calls = [];
    const command = fakeNetlify({
      blobs: [...reportBlobs(FIRST_REPORT).slice(0, 3), ...reportBlobs(SECOND_REPORT)],
      calls,
    });

    expect(() => fetchImageReports({ root, snapshotId: 'partial', command, now: NOW })).toThrow(
      /Fetched 1 report\(s\).*1 failed/s
    );
    const manifest = readManifest(root, 'partial');
    expect(manifest.reports.map(({ reportId }) => reportId)).toEqual([SECOND_REPORT]);
    expect(manifest.failures).toEqual([{ reportId: FIRST_REPORT, error: 'missing metadata.json' }]);
    expect(calls.filter(({ args }) => args[0] === 'blobs:get')).toHaveLength(4);
  });
});

describe('retention', () => {
  it('uses the production purge boundary for report ids', () => {
    const retentionMs = IMAGE_REPORT_RETENTION_DAYS * DAY_MS;

    expect(isReportExpired(`${NOW - retentionMs}-abc`, NOW)).toBe(true);
    expect(isReportExpired(`${NOW - retentionMs + 1}-abc`, NOW)).toBe(false);
    expect(isReportExpired('not-a-report', NOW)).toBe(false);
    expect(isReportExpired(undefined, NOW)).toBe(false);
  });

  it('lists past-retention store reports as expired without downloading them', () => {
    const root = fixtureRoot();
    const calls = [];
    const incompleteExpired = `${NOW - (IMAGE_REPORT_RETENTION_DAYS + 2) * DAY_MS}-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`;
    const command = fakeNetlify({
      blobs: [
        ...reportBlobs(EXPIRED_REPORT),
        ...reportBlobs(incompleteExpired).slice(0, 2),
        ...reportBlobs(FIRST_REPORT),
      ],
      calls,
    });

    const result = fetchImageReports({
      root,
      snapshotId: 'with-expired',
      command,
      importEvalInputs: true,
      now: NOW,
    });

    const downloadedKeys = calls
      .filter(({ args }) => args[0] === 'blobs:get')
      .map(({ args }) => args[2]);
    expect(downloadedKeys.every((key) => key.startsWith(`${FIRST_REPORT}/`))).toBe(true);
    expect(result.reports.map(({ reportId }) => reportId)).toEqual([FIRST_REPORT]);
    expect(readManifest(root, 'with-expired')).toMatchObject({
      failures: [],
      expired: [{ reportId: incompleteExpired }, { reportId: EXPIRED_REPORT }],
    });
    expect(
      readdirSync(join(root, 'tools', 'model-eval', 'inputs')).filter((name) =>
        name.includes(EXPIRED_REPORT)
      )
    ).toEqual([]);
  });

  it('prunes past-retention local copies before fetching and keeps everything else', () => {
    const root = fixtureRoot();
    const snapshots = join(root, '.eval-tmp', 'ai-image-reports');
    const evalInputs = join(root, 'tools', 'model-eval', 'inputs');
    const writeSnapshot = (snapshotId, reportIds, extra = {}) => {
      for (const reportId of reportIds) {
        mkdirSync(join(snapshots, snapshotId, reportId), { recursive: true });
        writeFileSync(join(snapshots, snapshotId, reportId, 'input.png'), 'drawing');
      }
      writeFileSync(
        join(snapshots, snapshotId, 'manifest.json'),
        JSON.stringify({
          version: 1,
          reports: reportIds.map((reportId) => ({ reportId })),
          failures: [],
          ...extra,
        })
      );
    };
    writeSnapshot('mixed', [EXPIRED_REPORT, FIRST_REPORT]);
    writeSnapshot('all-expired', [EXPIRED_REPORT], {
      failures: [{ reportId: EXPIRED_REPORT, error: 'missing prompt.txt' }],
    });
    writeSnapshot('expired-with-notes', [EXPIRED_REPORT]);
    writeFileSync(join(snapshots, 'expired-with-notes', 'notes.md'), 'operator notes');
    mkdirSync(evalInputs, { recursive: true });
    const expiredInput = modelEvalInputFilename(EXPIRED_REPORT, 'Magical');
    const currentInput = modelEvalInputFilename(FIRST_REPORT, 'Magical');
    for (const name of [expiredInput, currentInput, 'animals__cat.png']) {
      writeFileSync(join(evalInputs, name), 'drawing');
    }

    const result = fetchImageReports({
      root,
      snapshotId: 'fresh',
      command: fakeNetlify({ blobs: [] }),
      now: NOW,
    });

    expect(result.pruned).toEqual({ reports: 3, snapshots: 1, evalInputs: 1 });
    expect(readdirSync(snapshots).sort()).toEqual(['expired-with-notes', 'fresh', 'mixed']);
    expect(readdirSync(join(snapshots, 'mixed')).sort()).toEqual([FIRST_REPORT, 'manifest.json']);
    expect(readManifest(root, 'mixed').reports).toEqual([{ reportId: FIRST_REPORT }]);
    expect(readdirSync(join(snapshots, 'expired-with-notes')).sort()).toEqual([
      'manifest.json',
      'notes.md',
    ]);
    expect(readdirSync(evalInputs).sort()).toEqual(['animals__cat.png', currentInput].sort());
  });

  it('keeps a snapshot whose manifest it cannot parse', () => {
    const root = fixtureRoot();
    const snapshot = join(root, '.eval-tmp', 'ai-image-reports', 'corrupt');
    mkdirSync(join(snapshot, EXPIRED_REPORT), { recursive: true });
    writeFileSync(join(snapshot, 'manifest.json'), '{not json');

    expect(pruneExpiredLocalReports({ root, now: NOW })).toEqual({
      reports: 1,
      snapshots: 0,
      evalInputs: 0,
    });
    expect(readdirSync(snapshot)).toEqual(['manifest.json']);
  });
});
