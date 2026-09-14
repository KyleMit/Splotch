# Sounds

This capability owns the pencil drawing sounds: the stereo masters and the step that turns them into
the mono clips `web/src/lib/audio/drawingSound.ts` loads. It does not generate new sounds. New sound
effects come from the [ElevenLabs capability](../elevenlabs/README.md).

## Entry point

```sh
npm run gen:pencil-sounds
```

`gen-pencil-sounds.mjs` encodes every `masters/pencil-N.mp3` into `web/static/sounds/pencil-N.mp3`.
It then reads both files back and fails if the output is not mono, or if its sample rate or gapless
sample count differs from the master. It prints the bytes and the decoded size of each pair.

## Inputs and outputs

| Path                             | Role                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `masters/pencil-N.mp3`           | Source. 48 kHz stereo, 192 kbps CBR, 5.000 s loops, loudness-matched in PR #1188. |
| `web/static/sounds/pencil-N.mp3` | Generated. Never edit these by hand; change a master and re-run.                  |
| `mp3-stream.mjs`                 | Reads channels, sample rate, and gapless length from an MPEG-1 Layer III file.    |
| `tests/pencil-sounds.test.mjs`   | Checks the generated clips against the masters and the app's clip list.           |

The masters are the loudness-matched stereo clips the app shipped before this capability existed. No
lossless recording exists, so the script always encodes from the masters and never from the shipped
clips. Running it twice with the same LAME gives the same bytes, not a second generation of loss.

## Prerequisites

The script needs the [LAME](https://lame.sourceforge.io) command-line encoder on `PATH`:
`brew install lame` on macOS or `apt install lame` on Debian and Ubuntu. It prints the LAME version
first. The committed clips came from LAME 4.0. Another LAME version can produce different bytes, so
compare the printed table and listen before committing a re-encode.

## Why mono, VBR quality 1

The masters are stereo, but they carry no stereo image. Across the three clips, the channels
correlate at 0.9987 to 0.9992, the side signal is 31.6 to 33.9 dB below the mid signal, and no 100
ms window leans more than 0.54 dB to one side. A mono downmix removes nothing a listener can locate,
and it halves the decoded `AudioBuffer`: 1,920,000 to 960,000 bytes per clip at 48 kHz.

The encoding was chosen by decoding each LAME 4.0 candidate and comparing it with the decoded
master. Loudness is the whole-clip RMS change. The 16–20 kHz column is the change in band level. The
last column is the largest envelope rise in the 6 ms before a sharp onset, which only `pencil-2`
has; that is where pre-echo would show.

| Candidate (mono)  | Bytes per clip | Loudness          | 16–20 kHz        | Before onsets |
| ----------------- | -------------- | ----------------- | ---------------- | ------------- |
| CBR 96 kbps       | 60,768         | −0.45 to −0.47 dB | −0.5 to −2.3 dB  | +2.8 dB       |
| CBR 128 kbps      | 81,024         | −0.47 to −0.57 dB | −0.2 to −0.8 dB  | none          |
| VBR quality 2     | 67,752–75,984  | +0.03 to +0.25 dB | 18–20 kHz −11 dB | +0.9 dB       |
| **VBR quality 1** | 77,616–84,720  | +0.04 to +0.18 dB | −0.1 to +0.7 dB  | +0.5 dB       |

The clips are broadband scratch noise, the material MP3 handles worst, and MP3 needs roughly 125
kbps to match what 96 kbps AAC or Opus gives. Both CBR rates came out about half a decibel quieter,
which would undo the pencil and page-turn loudness match from PR #1188. Quality 1 keeps that match
and the masters' 19.5 kHz bandwidth.

The codec and container stay MP3, so no engine takes a new decoder path. Chromium, WebKit, and
Firefox all decoded the generated clips to exactly 240,000 mono samples at 48 kHz, the same gapless
loop length as the masters. At 44.1 kHz each engine produced the same length for a clip and its
master. Neither end of the decoded loop is quieter than the master's, so the seam gains no gap.

## Failure and recovery

The script exits nonzero when `lame` is missing, when a LAME step fails, or when a generated clip
fails verification. It writes straight into `web/static/sounds`, so restore a failed run with
`git checkout -- web/static/sounds`.

## Maintenance

To change the encoding, edit `LAME_MONO_ENCODE_ARGS` in `gen-pencil-sounds.mjs`, re-run the script,
and listen to the clips on a tablet speaker before committing. Update the table above with the new
measurements. To add a clip, add `masters/pencil-N.mp3`, add its URL to `SOUND_URLS` in
`drawingSound.ts`, and re-run the script. The test fails until all three agree.

Verify with:

```sh
npx vitest run --config tools/vitest.config.mjs sounds
```
