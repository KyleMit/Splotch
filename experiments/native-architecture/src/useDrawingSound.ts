import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createDrawingAudio } from './audio/drawingAudio';
import { createContactSound } from './audio/contactSound';
import { loadDrawingLoop } from './platform/drawingAudio';
import { soundSettingsStorage } from './platform/soundSettings';
import {
  createSoundSettings,
  DEFAULT_WIDTH_SETTINGS,
  type SoundSettingsState,
} from './settings/soundSettings';

export function useDrawingSound() {
  const [settings, setSettings] = useState<SoundSettingsState>({
    status: 'loading',
    soundEnabled: false,
    ...DEFAULT_WIDTH_SETTINGS,
    message: '',
  });
  const [audioMessage, setAudioMessage] = useState('');
  const [owner, setOwner] = useState<{
    audio: ReturnType<typeof createDrawingAudio>;
    contacts: ReturnType<typeof createContactSound>;
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
    const preferences = createSoundSettings(soundSettingsStorage, (next) => {
      setSettings(next);
      if (!next.soundEnabled) contacts.interrupt();
      audio.setEnabled(next.soundEnabled);
      if (!next.soundEnabled) setAudioMessage('');
    });
    audio.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') contacts.interrupt();
      audio.setForeground(state === 'active');
    });
    setOwner({ audio, contacts, settings: preferences });
    void preferences.load();
    return () => {
      subscription.remove();
      preferences.dispose();
      contacts.dispose();
      audio.dispose();
    };
  }, []);
  return { settings, audioMessage, owner };
}
