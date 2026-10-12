export const SOUND_LEVELS = ['quiet', 'medium', 'loud'] as const;
export type SoundLevel = (typeof SOUND_LEVELS)[number];
export const DEFAULT_SOUND_LEVEL: SoundLevel = 'medium';
export const SOUND_LEVEL_LABELS: Record<SoundLevel, string> = {
  quiet: 'Quiet',
  medium: 'Medium',
  loud: 'Loud',
};

export function isSoundLevel(value: unknown): value is SoundLevel {
  return value === 'quiet' || value === 'medium' || value === 'loud';
}
