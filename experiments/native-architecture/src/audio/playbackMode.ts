import type { AudioMode } from 'expo-audio';

// Shared by every clip the drawing screen plays, so the drawing loop and the clear page turn
// never fight over the session category.
export const PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  interruptionMode: 'mixWithOthers',
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
  allowsBackgroundRecording: false,
} as const satisfies Partial<AudioMode>;
