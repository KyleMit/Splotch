import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createDrawingAudio } from './audio/drawingAudio';
import { loadDrawingLoop } from './platform/drawingAudio';
import { soundSettingsStorage } from './platform/soundSettings';
import { createSoundSettings, type SoundSettingsState } from './settings/soundSettings';

export function useDrawingSound() {
  const [settings, setSettings] = useState<SoundSettingsState>({
    status: 'loading',
    soundEnabled: false,
    message: '',
  });
  const [audioMessage, setAudioMessage] = useState('');
  const [owner, setOwner] = useState<{
    audio: ReturnType<typeof createDrawingAudio>;
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
    const preferences = createSoundSettings(soundSettingsStorage, (next) => {
      setSettings(next);
      audio.setEnabled(next.soundEnabled);
      if (!next.soundEnabled) setAudioMessage('');
    });
    audio.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      audio.setForeground(state === 'active')
    );
    setOwner({ audio, settings: preferences });
    void preferences.load();
    return () => {
      subscription.remove();
      preferences.dispose();
      audio.dispose();
    };
  }, []);
  return { settings, audioMessage, owner };
}
