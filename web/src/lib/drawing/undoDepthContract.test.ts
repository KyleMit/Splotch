import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import releases from '../releases.json';
import { MAX_UNDO_DEPTH } from './undoHistory';

// Release notes are immutable history, so the promise lives in whichever release
// changed the depth — not in whichever release happens to be newest.
const ADVERTISED_DEPTH = /Undo now goes back (\d+) steps\./;

// The path is built before `new URL` so Vite reads it at runtime: an inline
// template literal there is rewritten into asset imports of every release note.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const releaseNotes = (version: string) => read(`../../../../releases/${version}.md`);

describe('undo depth product contract', () => {
  it('requires the most recently advertised undo depth to equal the engine depth cap', () => {
    const advertisedDepth = releases
      .map(({ version }) => ADVERTISED_DEPTH.exec(releaseNotes(version))?.[1])
      .find((depth) => depth !== undefined);

    expect(
      advertisedDepth,
      `the newest release note advertising an undo depth must promise ${MAX_UNDO_DEPTH}: ` +
        'ship a release note for the new depth, or remove this product contract deliberately'
    ).toBe(String(MAX_UNDO_DEPTH));
  });
});
