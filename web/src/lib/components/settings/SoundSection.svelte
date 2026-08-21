<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import SliderRow from './SliderRow.svelte';
  import {
    settings,
    setDeleteSound,
    setDrawingSound,
    setSound,
    setSoundVolume,
    SOUND_VOLUME_DEFAULT,
    SOUND_VOLUME_MAX,
    SOUND_VOLUME_MIN,
  } from '$lib/state/settings.svelte';
  import { playVolumePreview, stopDrawSound } from '$lib/audio/drawingSound';
  import { SECTION_SLIDE } from './sections';

  const PREVIEW_SPEED = 0.45;
  // Intentionally untracked: only read/written inside event handlers, never rendered.
  let previewingVolume = false;

  // While the volume slider is being adjusted, loop the pencil-scratch sound so
  // the parent hears the level they're setting.
  function previewVolume() {
    if (!settings.soundEnabled || !previewingVolume) return;
    playVolumePreview({ speed: PREVIEW_SPEED, isStrokeStart: false });
  }

  function onVolumeActive(active: boolean) {
    previewingVolume = active;
    if (active) {
      playVolumePreview({ speed: PREVIEW_SPEED, isStrokeStart: true });
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
      label="Sound"
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
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          snap={SOUND_VOLUME_DEFAULT}
          onInput={onVolumeInput}
          onActiveChange={onVolumeActive}
        />
      </div>
    {/if}
  </div>

  {#if settings.soundEnabled}
    <div class="sound-sources" transition:slide={SECTION_SLIDE}>
      <h4 class="sources-heading">What makes sound</h4>
      <div class="source-rows">
        <div class="setting">
          <ToggleRow
            icon="brush-pen"
            label="Drawing"
            id="drawingSoundToggle"
            checked={settings.drawingSoundEnabled}
            onToggle={setDrawingSound}
          />
        </div>
        <div class="setting">
          <ToggleRow
            icon="trash-closed"
            label="Deleting"
            id="deleteSoundToggle"
            checked={settings.deleteSoundEnabled}
            onToggle={setDeleteSound}
          />
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .slider-setting {
    margin: 12px 0 2px;
  }

  .sound-sources {
    margin-top: 20px;
  }

  .source-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sources-heading {
    margin: 0 0 10px 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
</style>
