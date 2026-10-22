// The shipping Volume range and default (SOUND_VOLUME_* in src/lib/state/settings.svelte.ts), a
// percentage where the default is the normal authored loudness and the maximum doubles it. That
// module is a Svelte runes store, so native-settings-sections.test.mjs holds these to it.
export const SOUND_VOLUME_MIN = 0;
export const SOUND_VOLUME_MAX = 100;
export const SOUND_VOLUME_DEFAULT = 50;

export function isSoundVolume(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SOUND_VOLUME_MIN &&
    value <= SOUND_VOLUME_MAX
  );
}

// Shipping's volumeMultiplier (src/lib/audio/drawingSound.ts): every sound scales by it.
export function soundVolumeGain(volume: number) {
  return volume / SOUND_VOLUME_DEFAULT;
}

// Records written before the Volume slider stored one of three levels. Each becomes the volume
// whose gain that level played at, so an upgrade sounds the same.
const LEGACY_SOUND_LEVEL_VOLUME = { quiet: 25, medium: 50, loud: 100 } as const;

export function legacySoundLevelVolume(level: unknown) {
  if (level !== 'quiet' && level !== 'medium' && level !== 'loud')
    throw new Error('Sound level is invalid.');
  return LEGACY_SOUND_LEVEL_VOLUME[level];
}
