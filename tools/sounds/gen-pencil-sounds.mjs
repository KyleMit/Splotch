// Re-encodes the stereo pencil masters into the mono clips the app ships.
// Always encodes from the masters, never from web/static, so a re-run is one
// lossy generation away from the source rather than one more each time.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, fail, hasCommand, isMain, ROOT, run, runMain } from '../lib/proc.mjs';
import { describeMp3 } from './mp3-stream.mjs';

export const MASTERS_DIR = join(import.meta.dirname, 'masters');
export const OUTPUT_DIR = join(ROOT, 'web/static/sounds');
export const PENCIL_CLIP_PATTERN = /^pencil-\d+\.mp3$/;

// VBR quality 1 (about 125 kbps mono on these clips). The clips are broadband
// scratch noise, MP3's weakest material, and MP3 needs roughly this rate to match
// 96 kbps AAC or Opus. It keeps the masters' 19.5 kHz bandwidth and loudness;
// 96 kbps CBR measured 0.5 dB quieter, which undoes the pencil/page-turn level
// match. tools/sounds/README.md records the comparison.
const LAME_MONO_ENCODE_ARGS = ['-a', '-m', 'm', '-V', '1'];

export function pencilClipNames(dir = MASTERS_DIR) {
  return readdirSync(dir)
    .filter((name) => PENCIL_CLIP_PATTERN.test(name))
    .sort();
}

function encodeMono(master, output, scratchDir) {
  const wav = join(scratchDir, 'decoded.wav');
  run('lame', ['--quiet', '--decode', master, wav]);
  run('lame', ['--quiet', ...LAME_MONO_ENCODE_ARGS, wav, output]);
}

function verifyOutput(name, master, output) {
  if (output.channels !== 1) fail(`${name}: encoded ${output.channels} channels, expected mono`);
  if (output.sampleRate !== master.sampleRate || output.samples !== master.samples) {
    fail(
      `${name}: encoded ${output.samples} samples at ${output.sampleRate} Hz, ` +
        `master has ${master.samples} at ${master.sampleRate} Hz — the loop length would change`
    );
  }
}

async function main() {
  if (!hasCommand('lame')) fail('lame is not installed: `brew install lame` or `apt install lame`');
  console.log(capture('lame', ['--version']).split('\n')[0]);

  const scratchDir = mkdtempSync(join(tmpdir(), 'pencil-sounds-'));
  const rows = [];
  try {
    for (const name of pencilClipNames()) {
      const masterPath = join(MASTERS_DIR, name);
      const outputPath = join(OUTPUT_DIR, name);
      encodeMono(masterPath, outputPath, scratchDir);
      const master = describeMp3(readFileSync(masterPath));
      const output = describeMp3(readFileSync(outputPath));
      verifyOutput(name, master, output);
      rows.push({
        clip: name,
        'master bytes': statSync(masterPath).size,
        'output bytes': statSync(outputPath).size,
        'master decoded bytes': master.decodedBytes,
        'output decoded bytes': output.decodedBytes,
      });
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  console.table(rows);
}

if (isMain(import.meta.url)) runMain(main);
