// Drawing sound management

const SOUND_ENABLED_KEY = 'splotch-sound-enabled';

// Load sound preference from localStorage (default to true)
let soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';

let currentStrokeSoundIndex = null; // Track which sound to use for current stroke
let currentSound = null; // Reference to the currently playing sound
let isSoundPaused = false; // Track pause state to avoid redundant calls
let movementTimeout = null; // Timer to detect when movement stops

const SPEED_THRESHOLD = 0.15; // Minimum speed to keep sound playing (pixels/ms)
const PAUSE_DELAY = 50; // ms to wait before pausing when movement stops
const SOUND_VOLUME = 0.2;

function createSound(src) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.loop = true;
  return audio;
}

// Initialize sound files
const pencilSounds = [
  createSound('/sounds/pencil-1.mp3'),
  createSound('/sounds/pencil-2.mp3'),
  createSound('/sounds/pencil-3.mp3')
];

export function playDrawSound(movementData = {}) {
  if (!soundEnabled) return;

  const { speed = 0 } = movementData;

  // Pick a sound for this stroke (only if we don't have one yet)
  if (currentStrokeSoundIndex === null) {
    currentStrokeSoundIndex = Math.floor(Math.random() * pencilSounds.length);
    currentSound = pencilSounds[currentStrokeSoundIndex];

    // Start playing the sound on loop at normal speed
    currentSound.volume = SOUND_VOLUME;
    currentSound.loop = true;
    currentSound.currentTime = 0;
    currentSound.play();
    isSoundPaused = false;
  }

  // Clear any existing timeout
  if (movementTimeout) {
    clearTimeout(movementTimeout);
    movementTimeout = null;
  }

  // Pause/resume sound based on movement speed (only when state changes)
  if (currentSound) {
    if (speed < SPEED_THRESHOLD) {
      // Moving too slowly or stopped - pause the sound
      if (!isSoundPaused) {
        currentSound.pause();
        isSoundPaused = true;
      }
    } else {
      // Moving - ensure sound is playing
      if (isSoundPaused) {
        currentSound.play();
        isSoundPaused = false;
      }

      // Set timeout to pause if movement stops
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
  if (!soundEnabled) return;

  // Clear any pending timeout
  if (movementTimeout) {
    clearTimeout(movementTimeout);
    movementTimeout = null;
  }

  // Stop all currently playing sounds
  pencilSounds.forEach(sound => {
    if (!sound.paused) {
      sound.pause();
      sound.currentTime = 0;
    }
  });

  // Clear the current stroke sound so next stroke picks a new one
  currentStrokeSoundIndex = null;
  currentSound = null;
  isSoundPaused = false;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  localStorage.setItem(SOUND_ENABLED_KEY, enabled.toString());

  // Stop any playing sounds when disabling
  if (!enabled) {
    stopDrawSound();
  }
}
