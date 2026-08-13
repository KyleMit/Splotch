import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import releases from '../releases.json';
import { MAX_UNDO_DEPTH } from './undoHistory';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('undo depth product contract', () => {
  it('requires the release-note history to advertise the engine depth cap', () => {
    const advertisedDepths = releases.flatMap(({ version }) => {
      const releaseNotes = read(`../../../../releases/${version}.md`);
      const advertisedDepth = /Undo now goes back (\d+) steps\./.exec(releaseNotes)?.[1];

      return advertisedDepth ? [advertisedDepth] : [];
    });

    expect(
      advertisedDepths[0],
      'the newest undo-depth promise must equal the engine cap or be removed deliberately'
    ).toBe(String(MAX_UNDO_DEPTH));
  });
});
