import { settings } from '$lib/state/settings.svelte.js';

let currentStrokeSoundIndex = null;
let currentSound = null;
let isSoundPaused = false;
let movementTimeout = null;
let pencilSounds = null;

const SPEED_THRESHOLD = 0.15;
const PAUSE_DELAY = 50;
const SOUND_VOLUME = 0.2;

function ensureSounds() {
  if (pencilSounds || typeof Audio === 'undefined') return;
  pencilSounds = [
    new Audio('/sounds/pencil-1.mp3'),
    new Audio('/sounds/pencil-2.mp3'),
    new Audio('/sounds/pencil-3.mp3')
  ];
  pencilSounds.forEach((a) => {
    a.preload = 'auto';
    a.loop = true;
  });
}

export function playDrawSound(movementData = {}) {
  if (!settings.soundEnabled) return;
  ensureSounds();
  if (!pencilSounds) return;

  const { speed = 0 } = movementData;

  if (currentStrokeSoundIndex === null) {
    currentStrokeSoundIndex = Math.floor(Math.random() * pencilSounds.length);
    currentSound = pencilSounds[currentStrokeSoundIndex];

    currentSound.volume = SOUND_VOLUME;
    currentSound.loop = true;
    currentSound.currentTime = 0;
    currentSound.play();
    isSoundPaused = false;
  }

  if (movementTimeout) {
    clearTimeout(movementTimeout);
    movementTimeout = null;
  }

  if (currentSound) {
    if (speed < SPEED_THRESHOLD) {
      if (!isSoundPaused) {
        currentSound.pause();
        isSoundPaused = true;
      }
    } else {
      if (isSoundPaused) {
        currentSound.play();
        isSoundPaused = false;
      }
      movementTimeout = setTimeout(() => {
        if (currentSound && !isSoundPaused) {
          currentSound.pause();
          isSoundPaused = true;
        }
      }, PAUSE_DELAY);
    }
  }
}

export function stopDrawSound() {
  if (movementTimeout) {
    clearTimeout(movementTimeout);
    movementTimeout = null;
  }
  if (pencilSounds) {
    pencilSounds.forEach((sound) => {
      if (!sound.paused) {
        sound.pause();
        sound.currentTime = 0;
      }
    });
  }
  currentStrokeSoundIndex = null;
  currentSound = null;
  isSoundPaused = false;
}
