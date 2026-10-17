import noteMinus9 from './clear-bubbles/minus9.wav';
import noteMinus7 from './clear-bubbles/minus7.wav';
import noteMinus6 from './clear-bubbles/minus6.wav';
import noteMinus5 from './clear-bubbles/minus5.wav';
import noteMinus4 from './clear-bubbles/minus4.wav';
import noteMinus3 from './clear-bubbles/minus3.wav';
import noteMinus2 from './clear-bubbles/minus2.wav';
import noteMinus1 from './clear-bubbles/minus1.wav';
import note0 from './clear-bubbles/0.wav';
import note1 from './clear-bubbles/1.wav';
import note2 from './clear-bubbles/2.wav';
import note3 from './clear-bubbles/3.wav';
import note4 from './clear-bubbles/4.wav';
import note5 from './clear-bubbles/5.wav';
import note6 from './clear-bubbles/6.wav';
import note7 from './clear-bubbles/7.wav';
import note8 from './clear-bubbles/8.wav';
import note9 from './clear-bubbles/9.wav';
import note10 from './clear-bubbles/10.wav';
import note11 from './clear-bubbles/11.wav';
import note12 from './clear-bubbles/12.wav';
import note13 from './clear-bubbles/13.wav';
import note14 from './clear-bubbles/14.wav';
import note15 from './clear-bubbles/15.wav';
import note16 from './clear-bubbles/16.wav';
import note17 from './clear-bubbles/17.wav';
import note18 from './clear-bubbles/18.wav';
import note19 from './clear-bubbles/19.wav';
import note20 from './clear-bubbles/20.wav';
import note21 from './clear-bubbles/21.wav';
import note22 from './clear-bubbles/22.wav';
import note23 from './clear-bubbles/23.wav';
import note24 from './clear-bubbles/24.wav';
import note25 from './clear-bubbles/25.wav';
import note26 from './clear-bubbles/26.wav';
import note27 from './clear-bubbles/27.wav';
import note28 from './clear-bubbles/28.wav';
import note29 from './clear-bubbles/29.wav';
import note30 from './clear-bubbles/30.wav';
import note31 from './clear-bubbles/31.wav';
import note32 from './clear-bubbles/32.wav';
import note33 from './clear-bubbles/33.wav';
import note34 from './clear-bubbles/34.wav';
import note35 from './clear-bubbles/35.wav';
import note36 from './clear-bubbles/36.wav';
import note37 from './clear-bubbles/37.wav';
import note38 from './clear-bubbles/38.wav';
import note40 from './clear-bubbles/40.wav';
import note43 from './clear-bubbles/43.wav';
import { SOUND_VOLUME_MAX, soundVolumeGain } from '../settings/soundVolume';
import { clearLadderFrequency } from '../../../../web/src/lib/audio/clearSoundNotes';

export const CLEAR_NOTE_ASSET_GAIN = soundVolumeGain(SOUND_VOLUME_MAX);

export const CLEAR_NOTE_ASSETS = [
  { semitone: -9, asset: noteMinus9 },
  { semitone: -7, asset: noteMinus7 },
  { semitone: -6, asset: noteMinus6 },
  { semitone: -5, asset: noteMinus5 },
  { semitone: -4, asset: noteMinus4 },
  { semitone: -3, asset: noteMinus3 },
  { semitone: -2, asset: noteMinus2 },
  { semitone: -1, asset: noteMinus1 },
  { semitone: 0, asset: note0 },
  { semitone: 1, asset: note1 },
  { semitone: 2, asset: note2 },
  { semitone: 3, asset: note3 },
  { semitone: 4, asset: note4 },
  { semitone: 5, asset: note5 },
  { semitone: 6, asset: note6 },
  { semitone: 7, asset: note7 },
  { semitone: 8, asset: note8 },
  { semitone: 9, asset: note9 },
  { semitone: 10, asset: note10 },
  { semitone: 11, asset: note11 },
  { semitone: 12, asset: note12 },
  { semitone: 13, asset: note13 },
  { semitone: 14, asset: note14 },
  { semitone: 15, asset: note15 },
  { semitone: 16, asset: note16 },
  { semitone: 17, asset: note17 },
  { semitone: 18, asset: note18 },
  { semitone: 19, asset: note19 },
  { semitone: 20, asset: note20 },
  { semitone: 21, asset: note21 },
  { semitone: 22, asset: note22 },
  { semitone: 23, asset: note23 },
  { semitone: 24, asset: note24 },
  { semitone: 25, asset: note25 },
  { semitone: 26, asset: note26 },
  { semitone: 27, asset: note27 },
  { semitone: 28, asset: note28 },
  { semitone: 29, asset: note29 },
  { semitone: 30, asset: note30 },
  { semitone: 31, asset: note31 },
  { semitone: 32, asset: note32 },
  { semitone: 33, asset: note33 },
  { semitone: 34, asset: note34 },
  { semitone: 35, asset: note35 },
  { semitone: 36, asset: note36 },
  { semitone: 37, asset: note37 },
  { semitone: 38, asset: note38 },
  { semitone: 40, asset: note40 },
  { semitone: 43, asset: note43 },
] as const;

export function clearNoteIndex(frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0)
    throw new Error('Clear note frequency is unavailable.');
  const semitone = Math.round(12 * Math.log2(frequency / clearLadderFrequency(0)));
  const index = CLEAR_NOTE_ASSETS.findIndex((note) => note.semitone === semitone);
  if (index < 0) throw new Error('Clear note frequency is unavailable.');
  return index;
}
