import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fetchImageReports,
  modelEvalInputFilename,
  planReportBundles,
  resolveProductionSite,
} from '../fetch-image-reports.mjs';

const FIRST_REPORT = '1786530951977-1c086d5f-f68f-437e-8c5c-88b3243987f8';
const SECOND_REPORT = '1786584074977-f8d9b64d-57ab-407a-bde3-f578fbabb22f';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
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

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-fetch-image-reports-'));
  temporaryRoots.push(root);
  return root;
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

  it('separates incomplete reports without rejecting complete bundles', () => {
    const plan = planReportBundles({
      blobs: [...reportBlobs(FIRST_REPORT).slice(0, 3), ...reportBlobs(SECOND_REPORT)],
    });

    expect(plan.bundles.map(({ reportId }) => reportId)).toEqual([SECOND_REPORT]);
    expect(plan.failures).toEqual([{ reportId: FIRST_REPORT, error: 'missing metadata.json' }]);
  });

  it('rejects unsafe store contents before downloading', () => {
    expect(() => planReportBundles({ blobs: [blob(`${FIRST_REPORT}/../../secrets.txt`)] })).toThrow(
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

describe('fetchImageReports', () => {
  it('downloads, validates, and manifests production reports without importing by default', () => {
    const root = fixtureRoot();
    const calls = [];
    const listing = { blobs: reportBlobs(FIRST_REPORT) };
    const metadata = {
      version: 1,
      reportedAt: '2026-08-12T10:35:51.977Z',
      deleteAfter: '2026-09-11T10:35:51.977Z',
      style: 'Magical',
      inputContentType: 'image/png',
      outputContentType: 'image/png',
    };
    const command = (args, options) => {
      calls.push({ args, options });
      if (args[0] === 'sites:list') {
        return JSON.stringify([
          { id: 'production-site', name: 'splotchy', custom_domain: 'splotch.art' },
        ]);
      }
      if (args[0] === 'blobs:list') return JSON.stringify(listing);
      const key = args[2];
      const destination = args[4];
      const filename = key.slice(key.indexOf('/') + 1);
      const contents = filename === 'metadata.json' ? JSON.stringify(metadata) : `data:${filename}`;
      writeFileSync(destination, contents);
      return '';
    };

    const result = fetchImageReports({ root, snapshotId: 'snapshot', command });
    const reportDir = join(root, '.eval-tmp', 'ai-image-reports', 'snapshot', FIRST_REPORT);
    const evalInput = join(
      root,
      'tools',
      'model-eval',
      'inputs',
      modelEvalInputFilename(FIRST_REPORT, 'Magical')
    );
    const manifest = JSON.parse(
      readFileSync(join(root, '.eval-tmp', 'ai-image-reports', 'snapshot', 'manifest.json'), 'utf8')
    );

    expect(result.reports).toHaveLength(1);
    expect(readFileSync(join(reportDir, 'prompt.txt'), 'utf8')).toBe('data:prompt.txt');
    expect(existsSync(evalInput)).toBe(false);
    expect(manifest.reports[0]).toMatchObject({
      reportId: FIRST_REPORT,
      evalInput: null,
      evalInputStatus: 'not-requested',
    });
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
    const metadata = JSON.stringify({
      version: 1,
      reportedAt: '2026-08-12T10:35:51.977Z',
      deleteAfter: '2026-09-11T10:35:51.977Z',
      style: 'Magical',
      inputContentType: 'image/png',
      outputContentType: 'image/png',
    });
    const command = (args) => {
      if (args[0] === 'sites:list') {
        return JSON.stringify([{ id: 'site', custom_domain: 'splotch.art' }]);
      }
      if (args[0] === 'blobs:list') {
        return JSON.stringify({ blobs: reportBlobs(FIRST_REPORT) });
      }
      const filename = args[2].slice(args[2].indexOf('/') + 1);
      writeFileSync(args[4], filename === 'metadata.json' ? metadata : `data:${filename}`);
      return '';
    };

    fetchImageReports({ root, snapshotId: 'first', command, importEvalInputs: true });
    const second = fetchImageReports({
      root,
      snapshotId: 'second',
      command,
      importEvalInputs: true,
    });
    expect(second.reports[0].evalInputStatus).toBe('unchanged');

    writeFileSync(evalInput, 'different');
    expect(() =>
      fetchImageReports({ root, snapshotId: 'third', command, importEvalInputs: true })
    ).toThrow(/1 model-eval input conflict/);
    const manifest = JSON.parse(
      readFileSync(join(root, '.eval-tmp', 'ai-image-reports', 'third', 'manifest.json'), 'utf8')
    );
    expect(manifest.failures).toEqual([]);
    expect(manifest.reports[0].evalInputStatus).toBe('conflict');
    expect(readFileSync(evalInput, 'utf8')).toBe('different');
  });

  it('downloads complete reports and manifests incomplete ones as failures', () => {
    const root = fixtureRoot();
    const calls = [];
    const metadata = JSON.stringify({
      version: 1,
      reportedAt: '2026-08-12T10:35:51.977Z',
      deleteAfter: '2026-09-11T10:35:51.977Z',
      style: 'Magical',
      inputContentType: 'image/png',
      outputContentType: 'image/png',
    });
    const command = (args) => {
      calls.push(args);
      if (args[0] === 'sites:list') {
        return JSON.stringify([{ id: 'site', custom_domain: 'splotch.art' }]);
      }
      if (args[0] === 'blobs:list') {
        return JSON.stringify({
          blobs: [...reportBlobs(FIRST_REPORT).slice(0, 3), ...reportBlobs(SECOND_REPORT)],
        });
      }
      const filename = args[2].slice(args[2].indexOf('/') + 1);
      writeFileSync(args[4], filename === 'metadata.json' ? metadata : `data:${filename}`);
      return '';
    };

    expect(() => fetchImageReports({ root, snapshotId: 'partial', command })).toThrow(
      /Fetched 1 report\(s\).*1 failed/s
    );
    const manifest = JSON.parse(
      readFileSync(join(root, '.eval-tmp', 'ai-image-reports', 'partial', 'manifest.json'), 'utf8')
    );
    expect(manifest.reports.map(({ reportId }) => reportId)).toEqual([SECOND_REPORT]);
    expect(manifest.failures).toEqual([{ reportId: FIRST_REPORT, error: 'missing metadata.json' }]);
    expect(calls.filter(([commandName]) => commandName === 'blobs:get')).toHaveLength(4);
  });
});
