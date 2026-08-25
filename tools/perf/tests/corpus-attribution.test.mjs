import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';

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
// and may not call one contaminated that the evidence supports. It sweeps every
// tracked corpus, so a future promotion of contaminated evidence fails here
// instead of waiting for a wrong re-score.
const EVIDENCE_ROOT = join(ROOT, 'perf-profiles', 'evidence');

function reportNonce(artifact) {
  const url = artifact?.report?.meta?.url ?? '';
  const match = /[?&]probe=([^&]*)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

// A probe nonce is `${label}-${pid}-${counter}` — the mint in
// capture-device-frames.mjs and capture-hand-input.mjs, the only two that can
// reach a corpus (the verify-* tools set label equal to the whole nonce, but
// they report over ?verify= and write no artifact). So attribution demands the
// label followed by EXACTLY `-<digits>-<digits>`: a bare prefix match would
// attribute a `…-pen-undo` nonce to a `…-pen` label, and an unanchored tail
// would attribute a `magic-light-3` repeat's nonce to a hypothetical
// `magic-light` label — the numeric-suffix naming the tracked repeat sets
// already use. No verdict on today's corpus differs between the loose and
// strict forms; the anchor is armed against naming, not repairing a defect.
function nonceAttributableToLabel(nonce, label) {
  if (!label) return false;
  if (!nonce.startsWith(`${label}-`)) return false;
  return /^\d+-\d+$/.test(nonce.slice(label.length + 1));
}

function corpora() {
  return readdirSync(EVIDENCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(EVIDENCE_ROOT, entry.name))
    .filter((directory) => existsSync(join(directory, 'index.json')));
}

describe('nonce attribution is delimiter-aware', () => {
  const pen = 'android-device-web-portrait-light-pen';

  it('attributes a nonce only to the label the mint delimited', () => {
    expect(nonceAttributableToLabel(`${pen}-12345-678`, pen)).toBe(true);
    expect(nonceAttributableToLabel(`${pen}-undo-12345-678`, `${pen}-undo`)).toBe(true);
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
  it.each(corpora().map((directory) => [directory.slice(EVIDENCE_ROOT.length + 1), directory]))(
    '%s marks exactly the captures whose report nonce contradicts their label',
    (_name, directory) => {
      const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8'));
      for (const kept of index.kept ?? []) {
        // Corpora also keep scripts and result transcripts; only JSON capture
        // artifacts carry a report URL to audit.
        if (!kept.file.endsWith('.json')) continue;
        const path = join(directory, kept.file);
        if (!existsSync(path)) continue;
        const artifact = JSON.parse(readFileSync(path, 'utf8'));
        const nonce = reportNonce(artifact);
        // No probe param is not a failure: Appium, desktop, native, and hand
        // captures carry none, and their attribution rests on other guards.
        if (nonce === null) continue;
        const label = artifact.label ?? '';
        const attributable = nonceAttributableToLabel(nonce, label);
        // One unconditional assertion per audited file: the marking must match
        // the evidence, and a contaminated entry must name the nonce it saw
        // (an attributable one records no nonce claim to check).
        expect(
          { file: kept.file, nonce, label, marked: kept.cellAttributable ?? true },
          `${kept.file}: index marking must match the nonce evidence`
        ).toMatchObject({
          marked: attributable,
          ...(attributable ? {} : { nonce: kept.reportNonce }),
        });
      }
    }
  );
});
