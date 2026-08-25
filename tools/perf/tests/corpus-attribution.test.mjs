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

function corpora() {
  return readdirSync(EVIDENCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(EVIDENCE_ROOT, entry.name))
    .filter((directory) => existsSync(join(directory, 'index.json')));
}

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
        const attributable = label !== '' && nonce.startsWith(label);
        expect(
          { file: kept.file, nonce, label, marked: kept.cellAttributable ?? true },
          `${kept.file}: index marking must match the nonce evidence`
        ).toMatchObject({ marked: attributable });
        if (!attributable) {
          expect(kept.reportNonce, `${kept.file}: a contaminated entry names its nonce`).toBe(
            nonce
          );
        }
      }
    }
  );
});
