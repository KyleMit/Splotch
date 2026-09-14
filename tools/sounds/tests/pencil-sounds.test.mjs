import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  encodedClipProblems,
  EXPECTED_ENCODER,
  MASTERS_DIR,
  OUTPUT_DIR,
  PENCIL_CLIP_PATTERN,
  pencilClipNames,
  publishStagedClips,
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

describe('publishStagedClips', () => {
  function fixture(names) {
    const root = mkdtempSync(join(tmpdir(), 'pencil-publish-'));
    const dirs = ['staged', 'output', 'backup'].map((dir) => join(root, dir));
    for (const dir of dirs) mkdirSync(dir);
    const [stagedDir, outputDir, backupDir] = dirs;
    const staged = names.map((name) => {
      writeFileSync(join(stagedDir, name), `new ${name}`);
      return { name, stagedPath: join(stagedDir, name) };
    });
    return { staged, outputDir, backupDir };
  }

  it('replaces every shipped clip when all copies succeed', () => {
    const { staged, outputDir, backupDir } = fixture(['a.mp3', 'b.mp3']);
    writeFileSync(join(outputDir, 'a.mp3'), 'old a.mp3');

    publishStagedClips(staged, outputDir, backupDir);

    expect(readFileSync(join(outputDir, 'a.mp3'), 'utf8')).toBe('new a.mp3');
    expect(readFileSync(join(outputDir, 'b.mp3'), 'utf8')).toBe('new b.mp3');
  });

  it('restores replaced clips and removes new ones when a later copy fails', () => {
    const { staged, outputDir, backupDir } = fixture(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']);
    const shipped = ['a.mp3', 'b.mp3', 'd.mp3'];
    for (const name of shipped) writeFileSync(join(outputDir, name), `old ${name}`);
    let copies = 0;
    const failOnLastCopy = (from, to) => {
      copies += 1;
      if (copies === staged.length) {
        writeFileSync(to, 'partial');
        throw new Error('EACCES');
      }
      copyFileSync(from, to);
    };

    expect(() => publishStagedClips(staged, outputDir, backupDir, failOnLastCopy)).toThrow(
      'EACCES'
    );
    for (const name of shipped) {
      expect(readFileSync(join(outputDir, name), 'utf8')).toBe(`old ${name}`);
    }
    expect(existsSync(join(outputDir, 'c.mp3'))).toBe(false);
  });
});
