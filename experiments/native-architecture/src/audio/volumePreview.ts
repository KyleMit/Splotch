import { soundVolumeGain, SOUND_VOLUME_DEFAULT } from '../settings/soundVolume';
import { BASE_SCRATCH_GAIN, type DrawingLoop, type DrawingLoopLoader } from './drawingAudio';

// Shipping's SoundSection previews at PREVIEW_SPEED, which equals drawingSound.ts's
// FULL_VOLUME_SPEED, so the pencil plays at the full scratch gain scaled by the volume being set.
// native-volume-preview.test.mjs derives this from both shipping literals.
export const VOLUME_PREVIEW_SCRATCH_GAIN = BASE_SCRATCH_GAIN;

type Resource =
  | { status: 'idle' }
  | { status: 'loading'; request: AbortController }
  | { status: 'ready'; loop: DrawingLoop };

// The pencil loop a parent hears while dragging Volume. It answers to the Sound switch alone, as
// shipping's playVolumePreview does, so it plays even when Drawing makes no sound. The loop loads
// on the first drag, stops when the drag ends, and is released when sound is muted, the app leaves
// the foreground or the owner is disposed. A failed load is silent: the preview is a courtesy.
export function createVolumePreview(load: DrawingLoopLoader) {
  let allowed = false;
  let foreground = true;
  let playing = false;
  let volume = SOUND_VOLUME_DEFAULT;
  let resource: Resource = { status: 'idle' };

  function release() {
    playing = false;
    const old = resource;
    resource = { status: 'idle' };
    if (old.status === 'loading') old.request.abort();
    if (old.status !== 'ready') return;
    for (const cleanup of [() => old.loop.stop(), () => old.loop.dispose()]) {
      try {
        cleanup();
      } catch {
        // A loop that fails to stop is dropped all the same; the next drag loads a fresh one.
      }
    }
  }

  function guarded(action: (loop: DrawingLoop) => void) {
    if (resource.status !== 'ready') return;
    try {
      action(resource.loop);
    } catch {
      release();
    }
  }

  function sound(loop: DrawingLoop) {
    loop.start();
    loop.setVolume(VOLUME_PREVIEW_SCRATCH_GAIN * soundVolumeGain(volume));
  }

  function prepare() {
    if (resource.status !== 'idle') return;
    const request = new AbortController();
    resource = { status: 'loading', request };
    void load(request.signal, () => {
      if (resource.status === 'ready') release();
    })
      .then((loop) => {
        if (resource.status !== 'loading' || resource.request !== request) {
          loop.dispose();
          return;
        }
        resource = { status: 'ready', loop };
        if (playing) guarded(sound);
      })
      .catch(() => {
        if (resource.status === 'loading' && resource.request === request)
          resource = { status: 'idle' };
      });
  }

  return {
    begin(next: number) {
      if (!allowed || !foreground) return;
      volume = next;
      playing = true;
      if (resource.status === 'ready') guarded(sound);
      else prepare();
    },
    update(next: number) {
      volume = next;
      if (playing)
        guarded((loop) => loop.setVolume(VOLUME_PREVIEW_SCRATCH_GAIN * soundVolumeGain(volume)));
    },
    end() {
      if (!playing) return;
      playing = false;
      guarded((loop) => loop.stop());
    },
    setAllowed(value: boolean) {
      allowed = value;
      if (!value) release();
    },
    setForeground(value: boolean) {
      foreground = value;
      if (!value) release();
    },
    dispose() {
      allowed = false;
      release();
    },
  };
}
