import { Asset } from 'expo-asset';
import pencilSound from '../audio/pencil-1.mp3';
import {
  AUDIO_LOAD_TIMEOUT_MS,
  GAIN_RAMP_S,
  STOP_DECLICK_S,
  TEARDOWN_SLACK_MS,
  type DrawingLoopLoader,
} from '../audio/drawingAudio';

export const loadDrawingLoop: DrawingLoopLoader = async (signal, onFailure) => {
  const context = new AudioContext();
  let rejectTimeout: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timeout = setTimeout(
    () => rejectTimeout(new Error('Drawing sound did not load.')),
    AUDIO_LOAD_TIMEOUT_MS
  );
  const retiring = new Map<ReturnType<typeof setTimeout>, () => void>();
  let disposed = false;
  let playback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  function teardown(source: AudioBufferSourceNode, gain: GainNode) {
    source.disconnect();
    gain.disconnect();
    source.stop();
  }
  function stop() {
    const old = playback;
    playback = null;
    if (!old) return;
    const now = context.currentTime;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    if (context.state === 'running' && now > 0) {
      old.gain.gain.linearRampToValueAtTime(0, now + STOP_DECLICK_S);
      const finish = () => teardown(old.source, old.gain);
      const timer = setTimeout(
        () => {
          retiring.delete(timer);
          finish();
        },
        STOP_DECLICK_S * 1000 + TEARDOWN_SLACK_MS
      );
      retiring.set(timer, finish);
    } else {
      old.gain.gain.setValueAtTime(0, now);
      teardown(old.source, old.gain);
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    signal.removeEventListener('abort', dispose);
    stop();
    for (const [timer, finish] of retiring) {
      clearTimeout(timer);
      finish();
    }
    retiring.clear();
    void context.close().catch(onFailure);
  }
  signal.addEventListener('abort', dispose, { once: true });
  try {
    signal.throwIfAborted();
    if (context.state === 'suspended') void context.resume().catch(onFailure);
    const asset = Asset.fromModule(pencilSound);
    const buffer = await Promise.race([
      (async () => {
        const response = await fetch(asset.localUri ?? asset.uri, { signal });
        if (!response.ok) throw new Error('Drawing sound could not be loaded.');
        return context.decodeAudioData(await response.arrayBuffer());
      })(),
      deadline,
    ]);
    signal.throwIfAborted();
    if (disposed) throw new Error('Drawing sound was cancelled.');
    clearTimeout(timeout);
    return {
      start() {
        stop();
        if (disposed) return;
        if (context.state === 'suspended') void context.resume().catch(onFailure);
        const gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(context.destination);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        source.start();
        playback = { source, gain };
      },
      setVolume(volume) {
        if (!playback) return;
        const gain = playback.gain.gain;
        const now = context.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(volume, now + GAIN_RAMP_S);
      },
      stop,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
