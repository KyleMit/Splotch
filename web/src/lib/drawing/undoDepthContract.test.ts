import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_UNDO_DEPTH } from './undoHistory';

describe('undo depth product contract', () => {
  it('keeps the release-note promise equal to the engine depth cap', () => {
    const releaseNotes = readFileSync(resolve(process.cwd(), '../releases/1.4.0.md'), 'utf8');
    const advertisedDepth = /Undo now goes back (\d+) steps\./.exec(releaseNotes)?.[1];

    expect(advertisedDepth).toBe(String(MAX_UNDO_DEPTH));
  });
});
