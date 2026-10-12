// Re-encodes the stereo pencil masters into the mono clips the app ships.
// Always encodes from the masters, never from web/static, so a re-run is one
// lossy generation away from the source rather than one more each time.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, fail, hasCommand, isMain, ROOT, runMain, tryCapture } from '../lib/proc.mjs';
import { describeMp3 } from './lib/mp3-stream.mjs';

export const MASTERS_DIR = join(import.meta.dirname, 'masters');
export const OUTPUT_DIR = join(ROOT, 'web/static/sounds');
export const PENCIL_CLIP_PATTERN = /^pencil-\d+\.mp3$/;

// VBR quality 1 (about 125 kbps mono on these clips). The clips are broadband
// scratch noise, MP3's weakest material, and MP3 needs roughly this rate to match
// 96 kbps AAC or Opus. It keeps the masters' 19.5 kHz bandwidth and loudness;
// 96 kbps CBR measured 0.5 dB quieter, which undoes the pencil/page-turn level
// match. tools/sounds/README.md records the comparison.
const LAME_VBR_QUALITY = 1;
const LAME_MONO_ENCODE_ARGS = ['-a', '-m', 'm', '-V', String(LAME_VBR_QUALITY)];

// What LAME writes into the Xing/LAME tag for `-V n`: VBR method 4 (its default
// VBR mode) and a quality indicator of 100 − 10n.
const LAME_TAG_VBR_METHOD = 4;
export const EXPECTED_ENCODER = {
  vbrMethod: LAME_TAG_VBR_METHOD,
  qualityIndicator: 100 - 10 * LAME_VBR_QUALITY,
};

export function pencilClipNames(dir = MASTERS_DIR) {
  return readdirSync(dir)
    .filter((name) => PENCIL_CLIP_PATTERN.test(name))
    .sort();
}

export function encodedClipProblems(master, output) {
  const problems = [];
  if (output.channels !== 1) problems.push(`encoded ${output.channels} channels, expected mono`);
  if (output.sampleRate !== master.sampleRate || output.samples !== master.samples) {
    problems.push(
      `encoded ${output.samples} samples at ${output.sampleRate} Hz, master has ` +
        `${master.samples} at ${master.sampleRate} Hz — the loop length would change`
    );
  }
  if (
    output.vbrMethod !== EXPECTED_ENCODER.vbrMethod ||
    output.qualityIndicator !== EXPECTED_ENCODER.qualityIndicator
  ) {
    problems.push(
      `LAME tag records VBR method ${output.vbrMethod} quality ${output.qualityIndicator}, ` +
        `expected method ${EXPECTED_ENCODER.vbrMethod} quality ${EXPECTED_ENCODER.qualityIndicator}`
    );
  }
  return problems;
}

function lame(args) {
  const result = tryCapture('lame', ['--quiet', ...args]);
  if (!result.ok) throw new Error(`lame ${args.join(' ')} failed\n${result.stderr}`);
}

function encodeToStaging(name, stagingDir) {
  const masterPath = join(MASTERS_DIR, name);
  const wavPath = join(stagingDir, `${name}.wav`);
  const stagedPath = join(stagingDir, name);
  lame(['--decode', masterPath, wavPath]);
  lame([...LAME_MONO_ENCODE_ARGS, wavPath, stagedPath]);

  const master = describeMp3(readFileSync(masterPath));
  const output = describeMp3(readFileSync(stagedPath));
  const problems = encodedClipProblems(master, output);
  if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);
  return {
    name,
    stagedPath,
    row: {
      clip: name,
      'master bytes': statSync(masterPath).size,
      'output bytes': statSync(stagedPath).size,
      'master decoded bytes': master.decodedBytes,
      'output decoded bytes': output.decodedBytes,
    },
  };
}

// Backs up every clip before replacing it and restores the backups when any copy
// fails, so a failed publish leaves outputDir as it was. `copy` is a seam kept for
// the fault-injection test; the generator always uses copyFileSync.
export function publishStagedClips(staged, outputDir, backupDir, copy = copyFileSync) {
  const touched = [];
  try {
    for (const { name, stagedPath } of staged) {
      const destination = join(outputDir, name);
      const backup = existsSync(destination) ? join(backupDir, name) : null;
      if (backup) copyFileSync(destination, backup);
      touched.push({ destination, backup });
      copy(stagedPath, destination);
    }
  } catch (error) {
    const restoreFailures = [];
    for (const { destination, backup } of touched.reverse()) {
      try {
        if (backup) copyFileSync(backup, destination);
        else rmSync(destination, { force: true });
      } catch (restoreError) {
        restoreFailures.push(`${destination}: ${restoreError.message}`);
      }
    }
    if (restoreFailures.length) {
      error.message += `\nCould not restore: ${restoreFailures.join('; ')}`;
    }
    throw error;
  }
}

export async function generatePencilSounds() {
  if (!hasCommand('lame')) fail('lame is not installed: `brew install lame` or `apt install lame`');
  console.log(capture('lame', ['--version']).split('\n')[0]);

  // Every clip is encoded and verified before any shipped file is touched, and the
  // publish step rolls back, so a failed run leaves web/static/sounds as it was.
  const stagingDir = mkdtempSync(join(tmpdir(), 'pencil-sounds-'));
  try {
    const encoded = pencilClipNames().map((name) => encodeToStaging(name, stagingDir));
    const backupDir = join(stagingDir, 'backup');
    mkdirSync(backupDir);
    publishStagedClips(encoded, OUTPUT_DIR, backupDir);
    console.table(encoded.map(({ row }) => row));
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) runMain(generatePencilSounds);
