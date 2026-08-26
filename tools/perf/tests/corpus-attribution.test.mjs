import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  mintProbeNonce,
  nonceAttributableToLabel,
  reportNonce,
} from '../lib/capture-attribution.mjs';
import { evidenceIndexEntries } from '../rescore-captures.mjs';

// Issue 1315: the tracked 2026-08-23-android-split corpus is cross-run
// contaminated — every report's ?probe= nonce names a different cell than its
// label (the pre-#1291 restored-tab mechanism). ADR-0138 keeps corpora so later
// metric corrections can be re-scored against history, and a contaminated
// capture re-scores cleanly and answers wrongly — so the contamination is
// marked per file in the corpus index (`cellAttributable: false`), where tools
// read it, not only in prose.
//
// This test keeps the marking honest in both directions: an index may not call
// a capture attributable when its own report nonce disagrees with its label,
// and may not call one contaminated that the evidence supports. It sweeps
// every index entry the readers can reach — the same recursive walk
// `perf:rescore`'s index readers use, because the shallow top-level-only sweep
// this replaced let a nested promotion escape the audit (issue 1356).
const EVIDENCE_ROOT = join(ROOT, 'perf-profiles', 'evidence');

describe('nonce attribution is delimiter-aware', () => {
  const pen = 'android-device-web-portrait-light-pen';

  it('attributes a nonce only to the label the mint delimited', () => {
    expect(nonceAttributableToLabel(`${pen}-12345-678`, pen)).toBe(true);
    expect(nonceAttributableToLabel(`${pen}-undo-12345-678`, `${pen}-undo`)).toBe(true);
  });

  // The drift guard issue 1356 exists for: the mint and the predicate were
  // three independent statements of one format, so either could change alone
  // and every capture would silently stop being attributable to its own label.
  it('attributes every nonce the shared mint produces to the label it minted for', () => {
    expect(nonceAttributableToLabel(mintProbeNonce(pen), pen)).toBe(true);
    expect(nonceAttributableToLabel(mintProbeNonce(`${pen}-undo`), `${pen}-undo`)).toBe(true);
  });

  it('reads the nonce back from a report URL the way the page carries it', () => {
    const nonce = mintProbeNonce(pen);
    const artifact = {
      report: { meta: { url: `http://192.168.0.2:4185/?probe=${encodeURIComponent(nonce)}` } },
    };
    expect(reportNonce(artifact)).toBe(nonce);
    expect(reportNonce({ report: { meta: { url: 'http://192.168.0.2:4185/' } } })).toBe(null);
  });

  // The traps the anchors exist for: `…-pen` is a prefix of `…-pen-undo`, so
  // a bare startsWith would call a pen-undo capture's nonce attributable to a
  // pen label — and an unanchored tail would call a numeric-suffixed sibling's
  // nonce (`magic-light-3-34307-81`, the repeat-set naming the tracked
  // evidence already uses) attributable to the shorter `magic-light`.
  it('does not attribute a longer label’s nonce to its prefix label', () => {
    expect(nonceAttributableToLabel(`${pen}-undo-12345-678`, pen)).toBe(false);
    expect(nonceAttributableToLabel('magic-light-3-34307-81', 'magic-light')).toBe(false);
    expect(nonceAttributableToLabel('magic-light-3-34307-81', 'magic-light-3')).toBe(true);
    expect(nonceAttributableToLabel(`${pen}-2-12345-678`, pen)).toBe(false);
  });

  it('rejects an empty label, a bare label, and a non-numeric next segment', () => {
    expect(nonceAttributableToLabel(`${pen}-12345-678`, '')).toBe(false);
    expect(nonceAttributableToLabel(pen, pen)).toBe(false);
    expect(nonceAttributableToLabel(`${pen}-eraser-12345-678`, pen)).toBe(false);
  });
});

describe('tracked evidence corpora state their own cell attribution', () => {
  // Every index entry the readers can reach, grouped by the index that names
  // it — nested promotions included, exactly as evidenceIndexEntries walks for
  // `perf:rescore`. An empty evidence tree yields no cases, which vitest
  // accepts only with a guard case.
  const entries = existsSync(EVIDENCE_ROOT) ? evidenceIndexEntries(EVIDENCE_ROOT) : [];

  it('reaches at least one tracked index entry', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries.map(({ key, entry }) => [key, entry]))(
    '%s marks exactly the captures whose report nonce contradicts their label',
    (key, kept) => {
      // Corpora also keep scripts and result transcripts; only JSON capture
      // artifacts carry a report URL to audit.
      if (!key.endsWith('.json')) return;
      const path = join(EVIDENCE_ROOT, key);
      if (!existsSync(path)) return;
      const artifact = JSON.parse(readFileSync(path, 'utf8'));
      const nonce = reportNonce(artifact);
      // No probe param is not a failure: Appium, desktop, native, and hand
      // captures carry none, and their attribution rests on other guards —
      // page-identity assertions and the operator harness's UA check. That
      // boundary is stated on reportNonce in capture-attribution.mjs.
      if (nonce === null) return;
      const label = artifact.label ?? '';
      const attributable = nonceAttributableToLabel(nonce, label);
      // One unconditional assertion per audited file: the marking must match
      // the evidence, and a contaminated entry must name the nonce it saw
      // (an attributable one records no nonce claim to check).
      expect(
        { file: key, nonce, label, marked: kept.cellAttributable ?? true },
        `${key}: index marking must match the nonce evidence`
      ).toMatchObject({
        marked: attributable,
        ...(attributable ? {} : { nonce: kept.reportNonce }),
      });
    }
  );

  // The gap the recursive sweep closes (issue 1356): every tracked index sits
  // one level deep today, which the shallow per-directory sweep happened to
  // cover — so the nested shape has to be pinned synthetically, or the first
  // real nested promotion escapes the audit exactly as before.
  it('reaches an index promoted below the top level', () => {
    const root = mkdtempSync(join(tmpdir(), 'corpus-attribution-'));
    try {
      const nested = join(root, 'campaign', 'sub');
      mkdirSync(nested, { recursive: true });
      writeFileSync(
        join(nested, 'index.json'),
        JSON.stringify({ kept: [{ file: 'capture.json', cellAttributable: false }] })
      );
      const reached = evidenceIndexEntries(root);
      expect(reached.map(({ key }) => key)).toContain(join('campaign', 'sub', 'capture.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
