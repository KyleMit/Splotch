import { Asset } from 'expo-asset';
import clearPageTurn from '../audio/clear-page-turn.mp3';
import type { ClearPageTurnLoader } from '../audio/clearSound';

export const loadClearPageTurn: ClearPageTurnLoader = async (signal) => {
  const context = new AudioContext();
  // Suspended WebKit contexts can reject resume while waiting for a later real activation.
  const resume = () => {
    if (context.state === 'suspended') void context.resume().catch(() => {});
  };
  try {
    resume();
    const asset = Asset.fromModule(clearPageTurn);
    const response = await fetch(asset.localUri ?? asset.uri, { signal });
    if (!response.ok) throw new Error('Clear sound could not be loaded.');
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    signal.throwIfAborted();
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
