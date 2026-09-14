import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MASTERS_DIR,
  OUTPUT_DIR,
  PENCIL_CLIP_PATTERN,
  pencilClipNames,
} from '../gen-pencil-sounds.mjs';
import { describeMp3 } from '../mp3-stream.mjs';

// A stereo 192 kbps clip is 121,581 bytes and mono VBR quality 1 lands between
// 77 and 85 KB, so this ceiling fails a stereo or CBR-192 regression while
// leaving room for a re-encode of the same material.
const MAX_SHIPPED_PENCIL_CLIP_BYTES = 100_000;

const drawingSoundSource = readFileSync(
  join(import.meta.dirname, '../../../web/src/lib/audio/drawingSound.ts'),
  'utf8'
);
const appPencilClipNames = [...drawingSoundSource.matchAll(/'\/sounds\/([^']+)'/g)]
  .map((match) => match[1])
  .filter((name) => PENCIL_CLIP_PATTERN.test(name))
  .sort();

describe('pencil sounds', () => {
  it('ships one generated clip for every master and every clip the app loads', () => {
    expect(appPencilClipNames.length).toBeGreaterThan(0);
    expect(pencilClipNames()).toEqual(appPencilClipNames);
    expect(pencilClipNames(OUTPUT_DIR)).toEqual(appPencilClipNames);
  });

  for (const name of pencilClipNames()) {
    describe(`clip ${name}`, () => {
      const masterPath = join(MASTERS_DIR, name);
      const outputPath = join(OUTPUT_DIR, name);
      const master = describeMp3(readFileSync(masterPath));
      const output = describeMp3(readFileSync(outputPath));

      it('reads the master as the stereo source it is', () => {
        expect(master.channels).toBe(2);
      });

      it('ships mono at the master sample rate and gapless loop length', () => {
        expect(output).toEqual({
          channels: 1,
          sampleRate: master.sampleRate,
          samples: master.samples,
          decodedBytes: master.decodedBytes / 2,
        });
      });

      it('stays inside the shipped clip byte ceiling', () => {
        expect(statSync(outputPath).size).toBeLessThanOrEqual(MAX_SHIPPED_PENCIL_CLIP_BYTES);
      });
    });
  }
});
