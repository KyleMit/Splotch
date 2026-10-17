import { NativeModules } from 'react-native';
import { CLEAR_NOTE_ASSETS, CLEAR_NOTE_ASSET_GAIN, clearNoteIndex } from '../audio/clearNoteAssets';

const CLEAR_NOTE_MODULE = 'SplotchClearSound';

type ClearNoteBridge = {
  create(): Promise<unknown>;
  prepare(id: string, uris: readonly string[]): Promise<unknown>;
  play(id: string, index: number, volume: number): Promise<unknown>;
  dispose(id: string): void;
};

function isClearNoteBridge(candidate: unknown): candidate is ClearNoteBridge {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'create' in candidate &&
    typeof candidate.create === 'function' &&
    'prepare' in candidate &&
    typeof candidate.prepare === 'function' &&
    'play' in candidate &&
    typeof candidate.play === 'function' &&
    'dispose' in candidate &&
    typeof candidate.dispose === 'function'
  );
}

function bridge(): ClearNoteBridge {
  const candidate: unknown = NativeModules[CLEAR_NOTE_MODULE];
  if (!isClearNoteBridge(candidate)) throw new Error('Clear notes are unavailable.');
  return candidate;
}

export async function loadClearNotes(signal: AbortSignal) {
  const native = bridge();
  if (signal.aborted) throw new Error('Clear sound was cancelled.');
  const created = await native.create();
  if (typeof created !== 'string' || created.length === 0)
    throw new Error('Clear notes did not load.');
  const id = created;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    native.dispose(id);
  }
  const cancelled = () => {
    if (disposed || signal.aborted) throw new Error('Clear sound was cancelled.');
  };
  try {
    cancelled();
    signal.addEventListener('abort', dispose, { once: true });
    const { Asset } = await import('expo-asset');
    cancelled();
    const uris = await Promise.all(
      CLEAR_NOTE_ASSETS.map(async ({ asset }) => {
        const loaded = await Asset.fromModule(asset).downloadAsync();
        cancelled();
        const uri = loaded.localUri;
        if (typeof uri !== 'string' || !uri.startsWith('file://'))
          throw new Error('Clear note asset is unavailable.');
        return uri;
      })
    );
    cancelled();
    if ((await native.prepare(id, uris)) !== true) throw new Error('Clear notes did not load.');
    cancelled();
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    play(frequency: number, volume: number) {
      cancelled();
      if (!Number.isFinite(volume) || volume < 0 || volume > CLEAR_NOTE_ASSET_GAIN)
        throw new Error('Clear note volume is unavailable.');
      if (volume === 0) return;
      return native
        .play(id, clearNoteIndex(frequency), volume / CLEAR_NOTE_ASSET_GAIN)
        .then((played) => {
          if (played !== true) throw new Error('Clear note did not play.');
        });
    },
    dispose,
  };
}
