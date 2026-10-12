import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { unattributableCaptureProblem } from '../analyze-frame-capture.mjs';
import {
  evidenceIndexEntries,
  evidenceIndexUnattributable,
  readEvidenceIndex,
} from '../lib/capture-rescore.mjs';

// perf:rescore and perf:analyze:frames each once parsed the index with their
// own copy, tied only by a comment; a reader that missed a change would score
// contaminated evidence as clean. Every case here runs both readers.

function corpusWithIndex(indexText) {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-evidence-index-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'index.json'), indexText);
  return dir;
}

function errorThrownBy(read) {
  try {
    read();
  } catch (error) {
    return error;
  }
  return null;
}

describe('the evidence index the rescorer and the analyzer share', () => {
  it('refuses a truncated index with one message from both readers', () => {
    const dir = corpusWithIndex('{"kept": [{"file": "pen.json", "cellAttributable": fal');
    const readers = {
      rescorer: () => evidenceIndexEntries(dir),
      analyzer: () => unattributableCaptureProblem(join(dir, 'pen.json')),
    };
    for (const [reader, read] of Object.entries(readers)) {
      const error = errorThrownBy(read);
      expect(error?.message, reader).toBe(
        `${relative(ROOT, join(dir, 'index.json'))}: evidence index is not valid JSON`
      );
      expect(error?.cause, reader).toBeInstanceOf(SyntaxError);
    }
  });

  it('marks the same captures unattributable in both readers', () => {
    const dir = corpusWithIndex(
      JSON.stringify({
        kept: [
          { file: 'marked.json', cellAttributable: false, reportNonce: 'other-1-2' },
          { file: 'unmarked.json' },
          { file: 'attributable.json', cellAttributable: true },
          { cellAttributable: false, reportNonce: 'no-file-3-4' },
        ],
      })
    );
    const files = ['marked.json', 'unmarked.json', 'attributable.json'];

    const rescorerRefuses = [...evidenceIndexUnattributable(dir).keys()];
    const analyzerRefuses = files.filter((file) => unattributableCaptureProblem(join(dir, file)));

    expect(rescorerRefuses).toEqual(['marked.json']);
    expect(analyzerRefuses).toEqual(rescorerRefuses);
    expect(readEvidenceIndex(join(dir, 'index.json')).map((entry) => entry.file)).toEqual(files);
  });

  it('reads an index with no kept list as empty', () => {
    const dir = corpusWithIndex(JSON.stringify({ campaign: 'empty' }));

    expect(readEvidenceIndex(join(dir, 'index.json'))).toEqual([]);
    expect(evidenceIndexEntries(dir)).toEqual([]);
    expect(unattributableCaptureProblem(join(dir, 'pen.json'))).toBeNull();
  });
});
