import { webAssetUri } from './webAsset';
import clearPageTurn from '../audio/clear-page-turn.mp3';
import type { ClearPageTurnLoader } from '../audio/pageTurnSound';
import { playClearNote } from '../../../../web/src/lib/audio/clearSoundNotes';

export const loadClearPageTurn: ClearPageTurnLoader = async (signal, publishNotes) => {
  const context = new AudioContext();
  // Suspended WebKit contexts can reject resume while waiting for a later real activation.
  const resume = () => {
    if (context.state === 'suspended') void context.resume().catch(() => {});
  };
  try {
    resume();
    publishNotes((frequency, volume) => {
      resume();
      playClearNote(context, frequency, volume);
    });
    const response = await fetch(webAssetUri(clearPageTurn), { signal });
    if (!response.ok) throw new Error('Clear sound could not be loaded.');
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (signal.aborted) throw new Error('Clear sound was cancelled.');
    return {
      play(volume) {
        resume();
        const gain = context.createGain();
        gain.gain.value = volume;
        gain.connect(context.destination);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
        source.start();
      },
      dispose() {
        void context.close().catch(() => {});
      },
    };
  } catch (error) {
    void context.close().catch(() => {});
    throw error;
  }
};
