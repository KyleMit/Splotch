import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReport, completeResults } from '../lib/safety-report.mjs';

const ABORT_REASON = 'server stopped answering';

// Safe-first, like the runner orders them, so an abort after two cases leaves
// every block-* probe unsent.
const CASES = [
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ id: `safe-${n}`, expectation: 'allow-safe' })),
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ id: `block-${n}`, expectation: 'block' })),
];
const SENT = [
  { ...CASES[0], outcome: 'image', status: 200, detail: '' },
  { ...CASES[1], outcome: 'blocked', status: 422, detail: 'refused' },
];

let outDir;

afterEach(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('completeResults', () => {
  it('adds an error row naming the abort for every case that never ran', () => {
    const rows = completeResults(CASES, SENT, ABORT_REASON);

    expect(rows).toHaveLength(CASES.length);
    expect(rows.slice(0, SENT.length)).toEqual(SENT);
    const neverRan = rows.slice(SENT.length);
    expect(neverRan.map((r) => r.id)).toEqual(CASES.slice(SENT.length).map((c) => c.id));
    for (const row of neverRan) {
      expect(row).toMatchObject({ outcome: 'error', status: 0 });
      expect(row.detail).toBe(`never ran — the run aborted: ${ABORT_REASON}`);
    }
  });

  it('leaves a run that sent every case unchanged', () => {
    const everyCase = CASES.map((c) => ({ ...c, outcome: 'blocked', status: 422, detail: '' }));

    expect(completeResults(CASES, everyCase, null)).toEqual(everyCase);
  });
});

describe('buildReport after an aborted run', () => {
  it('counts and names every selected case, not only the ones that ran', () => {
    outDir = mkdtempSync(join(tmpdir(), 'redteam-report-'));
    const results = completeResults(CASES, SENT, ABORT_REASON);

    const html = readFileSync(
      buildReport({ runId: 'test-run', outDir, base: 'http://localhost:0', results }),
      'utf8'
    );
    const json = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));

    expect(json.results).toHaveLength(CASES.length);
    expect(html).toContain(`${CASES.length} cases`);
    expect(html).toContain(`${CASES.length - SENT.length} infra error`);
    for (const c of CASES) expect(html).toContain(`<code>${c.id}</code>`);
  });
});
