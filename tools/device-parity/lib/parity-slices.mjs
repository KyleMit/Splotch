// The parity slices run-parity-slice can run, each a list of recorded steps.
// `platforms` names where a slice can run at all; `usesSystemBack` is the one exception to the
// never-send-Back rule, for the slice whose subject is Back.
import { DS2_CHROME_STEPS } from './slices/ds2-chrome.mjs';
import { FONT_SCALE_STEPS } from './slices/font-scale.mjs';
import { KEY1_KEYBOARD_STEPS } from './slices/key1-keyboard.mjs';
import { LIFE1_ANDROID_BACK_STEPS } from './slices/life1-android-back.mjs';
import { LIFE1_RESTART_STEPS } from './slices/life1-restart.mjs';
import { SAVE1_PICTURE_STEPS } from './slices/save1-picture.mjs';

const BOTH = ['ios', 'android'];

export const PARITY_SLICES = {
  ds2: { steps: DS2_CHROME_STEPS, platforms: BOTH, usesSystemBack: false },
  key1: { steps: KEY1_KEYBOARD_STEPS, platforms: BOTH, usesSystemBack: false },
  life1: { steps: LIFE1_RESTART_STEPS, platforms: BOTH, usesSystemBack: false },
  'life1-android-back': {
    steps: LIFE1_ANDROID_BACK_STEPS,
    platforms: ['android'],
    usesSystemBack: true,
  },
  save1: { steps: SAVE1_PICTURE_STEPS, platforms: ['ios'], usesSystemBack: false },
  font: { steps: FONT_SCALE_STEPS, platforms: BOTH, usesSystemBack: false },
};

export const PARITY_SLICE_NAMES = Object.keys(PARITY_SLICES);
