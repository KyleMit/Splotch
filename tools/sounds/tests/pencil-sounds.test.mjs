import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  encodedClipProblems,
  EXPECTED_ENCODER,
  MASTERS_DIR,
  OUTPUT_DIR,
  PENCIL_CLIP_PATTERN,
  pencilClipNames,
} from '../gen-pencil-sounds.mjs';
import { describeMp3 } from '../lib/mp3-stream.mjs';

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
        expect(master.qualityIndicator).not.toBe(EXPECTED_ENCODER.qualityIndicator);
      });

      it('ships mono at the master loop length from the chosen LAME profile', () => {
        expect(encodedClipProblems(master, output)).toEqual([]);
        expect(output.decodedBytes).toBe(master.decodedBytes / 2);
      });

      it('stays inside the shipped clip byte ceiling', () => {
        expect(statSync(outputPath).size).toBeLessThanOrEqual(MAX_SHIPPED_PENCIL_CLIP_BYTES);
      });
    });
  }
});

describe('encodedClipProblems', () => {
  const master = { channels: 2, sampleRate: 48_000, samples: 240_000 };
  const good = { ...EXPECTED_ENCODER, channels: 1, sampleRate: 48_000, samples: 240_000 };

  it('accepts a mono clip with the master loop length and the chosen profile', () => {
    expect(encodedClipProblems(master, good)).toEqual([]);
  });

  it.each([
    ['a stereo clip', { channels: 2 }, /channels/],
    ['a shorter loop', { samples: 239_999 }, /loop length/],
    ['a resampled clip', { sampleRate: 44_100 }, /loop length/],
    [
      'a lower VBR quality',
      { qualityIndicator: EXPECTED_ENCODER.qualityIndicator - 20 },
      /quality/,
    ],
    ['a CBR encode', { vbrMethod: 1 }, /VBR method/],
  ])('rejects %s', (_label, change, message) => {
    const problems = encodedClipProblems(master, { ...good, ...change });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });
});
