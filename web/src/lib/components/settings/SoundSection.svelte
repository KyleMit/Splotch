<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import SliderRow from './SliderRow.svelte';
  import {
    settings,
    setSound,
    setSoundVolume,
    SOUND_VOLUME_DEFAULT,
  } from '$lib/state/settings.svelte';
  import { playDrawSound, preloadDrawSounds, stopDrawSound } from '$lib/audio/drawingSound';
  import { SECTION_SLIDE } from './sections';

  const PREVIEW_SPEED = 0.45;
  // Intentionally untracked: only read/written inside event handlers, never rendered.
  let previewingVolume = false;

  // While the volume slider is being adjusted, loop the pencil-scratch sound so
  // the parent hears the level they're setting.
  function previewVolume() {
    if (!settings.soundEnabled || !previewingVolume) return;
    playDrawSound({ speed: PREVIEW_SPEED, isStrokeStart: false });
  }

  function onVolumeActive(active: boolean) {
    previewingVolume = active;
    if (active) {
      preloadDrawSounds();
      previewVolume();
    } else stopDrawSound();
  }

  function onVolumeInput(value: number) {
    setSoundVolume(value);
    previewVolume();
  }
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon={settings.soundEnabled ? 'volume-on' : 'volume-off'}
      label="Drawing Sounds"
      id="soundToggle"
      checked={settings.soundEnabled}
      onToggle={setSound}
    />
    {#if settings.soundEnabled}
      <div class="slider-setting" transition:slide={SECTION_SLIDE}>
        <SliderRow
          id="soundVolumeLabel"
          label="Volume"
          value={settings.soundVolume}
          min={0}
          max={100}
          snap={SOUND_VOLUME_DEFAULT}
          onInput={onVolumeInput}
          onActiveChange={onVolumeActive}
        />
      </div>
    {/if}
  </div>
</section>

<style>
  .slider-setting {
    margin: 12px 0 2px;
  }
</style>
