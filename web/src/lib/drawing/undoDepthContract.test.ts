import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import releases from '../releases.json';
import { MAX_UNDO_DEPTH } from './undoHistory';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('undo depth product contract', () => {
  it('requires the current release-note promise to equal the engine depth cap', () => {
    const [{ version }] = releases;
    const releaseNotes = read(`../../../../releases/${version}.md`);
    const advertisedDepth = /Undo now goes back (\d+) steps\./.exec(releaseNotes)?.[1];

    expect(
      advertisedDepth,
      `${version} must advertise the undo depth or remove this product contract deliberately`
    ).toBe(String(MAX_UNDO_DEPTH));
  });
});
