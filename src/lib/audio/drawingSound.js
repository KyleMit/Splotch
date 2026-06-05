import { settings } from '$lib/state/settings.svelte.js';

let currentStrokeSoundIndex = null;
let currentSound = null;
let isSoundPaused = false;
let pencilSounds = null;

const SPEED_THRESHOLD = 0.15;
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

/**
 * Eagerly create and fetch+decode the pencil sounds so the first stroke plays
 * instantly. Without this, loading is deferred until the first `playDrawSound`
 * call, leaving a multi-second silent gap on a fresh page load. Call once when
 * the canvas mounts; fetching needs no user gesture (only playback does).
 */
export function preloadDrawSounds() {
  ensureSounds();
  if (!pencilSounds) return;
  pencilSounds.forEach((a) => a.load());
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
    currentSound.play().catch(() => {});
    isSoundPaused = false;
  }

  if (currentSound) {
    if (speed < SPEED_THRESHOLD) {
      if (!isSoundPaused) {
        currentSound.pause();
        isSoundPaused = true;
      }
    } else if (isSoundPaused) {
      currentSound.play().catch(() => {});
      isSoundPaused = false;
    }
  }
}

export function stopDrawSound() {
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
