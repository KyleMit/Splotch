<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import Slider from '../Slider.svelte';
  import {
    settings,
    setSound,
    setSoundVolume,
    SOUND_VOLUME_DEFAULT,
  } from '$lib/state/settings.svelte';
  import { playDrawSound, stopDrawSound } from '$lib/audio/drawingSound';

  const PREVIEW_SPEED = 0.45;
  let previewingVolume = false;

  // While the volume slider is being adjusted, loop the pencil-scratch sound so
  // the parent hears the level they're setting.
  function previewVolume() {
    if (!settings.soundEnabled || !previewingVolume) return;
    playDrawSound({ speed: PREVIEW_SPEED });
  }

  function onVolumeActive(active: boolean) {
    previewingVolume = active;
    if (active) previewVolume();
    else stopDrawSound();
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
      <div class="slider-setting" transition:slide={{ duration: 220 }}>
        <div class="slider-label" id="soundVolumeLabel">
          <span>Volume</span>
          <span>{settings.soundVolume}%</span>
        </div>
        <Slider
          value={settings.soundVolume}
          min={0}
          max={100}
          snap={SOUND_VOLUME_DEFAULT}
          labelId="soundVolumeLabel"
          valueText="{settings.soundVolume}%"
          onInput={onVolumeInput}
          onActiveChange={onVolumeActive}
        />
      </div>
    {/if}
  </div>
</section>

<style>
  /* Volume sits indented under its toggle. */
  .slider-setting {
    margin: 12px 0 2px 30px;
  }

  .slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-mid);
  }
</style>
