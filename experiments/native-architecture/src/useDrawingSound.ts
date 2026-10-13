import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createDrawingAudio } from './audio/drawingAudio';
import { createClearSound } from './audio/pageTurnSound';
import { createContactSound } from './audio/contactSound';
import { applySoundChoices, drawingSoundPlays } from './audio/soundGates';
import { loadDrawingLoop } from './platform/drawingAudio';
import { loadClearPageTurn } from './platform/clearSound';
import { soundSettingsStorage } from './platform/soundSettings';
import {
  createSoundSettings,
  initialSoundSettingsState,
  type SoundSettingsState,
} from './settings/soundSettings';

export function useDrawingSound() {
  const [settings, setSettings] = useState<SoundSettingsState>(initialSoundSettingsState);
  const [audioMessage, setAudioMessage] = useState('');
  const [owner, setOwner] = useState<{
    audio: ReturnType<typeof createDrawingAudio>;
    contacts: ReturnType<typeof createContactSound>;
    clear: ReturnType<typeof createClearSound>;
    settings: ReturnType<typeof createSoundSettings>;
  } | null>(null);
  useEffect(() => {
    const audio = createDrawingAudio(
      loadDrawingLoop,
      () => {
        setAudioMessage('Drawing sound is unavailable. You can keep drawing. Try another stroke.');
      },
      () => setAudioMessage('')
    );
    const contacts = createContactSound(audio);
    const clear = createClearSound(loadClearPageTurn);
    const preferences = createSoundSettings(soundSettingsStorage, (next) => {
      setSettings(next);
      applySoundChoices({ audio, contacts, clear }, next);
      if (!drawingSoundPlays(next)) setAudioMessage('');
    });
    const foreground = (active: boolean) => {
      audio.setForeground(active);
      clear.setForeground(active);
    };
    foreground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') contacts.interrupt();
      foreground(state === 'active');
    });
    setOwner({ audio, contacts, clear, settings: preferences });
    void preferences.load();
    return () => {
      subscription.remove();
      preferences.dispose();
      contacts.dispose();
      clear.dispose();
      audio.dispose();
    };
  }, []);
  return { settings, audioMessage, owner };
}
