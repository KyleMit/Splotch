import type { AudioMode } from 'expo-audio';
import { AUDIO_PLAYS_IN_SILENT_MODE } from '../platform/audioSilentMode';

// Shared by every clip the drawing screen plays, so the drawing loop and the clear page turn
// never fight over the session category.
export const PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: AUDIO_PLAYS_IN_SILENT_MODE,
  interruptionMode: 'mixWithOthers',
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
  allowsBackgroundRecording: false,
} as const satisfies Partial<AudioMode>;
