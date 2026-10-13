import type { SoundSettingsState } from '../settings/soundSettingsCodec';
import type { ContactSound } from './contactSound';
import type { DrawingAudio } from './drawingAudio';
import type { ClearSound } from './pageTurnSound';

type SoundChoices = Pick<
  SoundSettingsState,
  'soundEnabled' | 'soundVolume' | 'drawingSoundEnabled' | 'deleteSoundEnabled'
>;

// Shipping's canPlayDrawingSound and canPlayDeleteSound: the Sound switch silences everything, and
// each "What makes sound" switch silences its own source.
export function drawingSoundPlays(settings: SoundChoices) {
  return settings.soundEnabled && settings.drawingSoundEnabled;
}

export function deleteSoundPlays(settings: SoundChoices) {
  return settings.soundEnabled && settings.deleteSoundEnabled;
}

export function applySoundChoices(
  { audio, contacts, clear }: { audio: DrawingAudio; contacts: ContactSound; clear: ClearSound },
  settings: SoundChoices
) {
  const drawing = drawingSoundPlays(settings);
  if (!drawing) contacts.interrupt();
  audio.setVolume(settings.soundVolume);
  audio.setEnabled(drawing);
  clear.setVolume(settings.soundVolume);
  clear.setEnabled(deleteSoundPlays(settings));
}
