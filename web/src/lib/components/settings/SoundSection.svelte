<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import SliderRow from './SliderRow.svelte';
  import RuleLabel from '../design/RuleLabel.svelte';
  import {
    settingsState,
    setDeleteSound,
    setDrawingSound,
    setSound,
    setSoundVolume,
    SOUND_VOLUME_DEFAULT,
    SOUND_VOLUME_MAX,
    SOUND_VOLUME_MIN,
  } from '$lib/state/settings.svelte';
  import { playVolumePreview, stopDrawSound } from '$lib/audio/drawingSound';
  import { sectionReveal } from './sectionReveal';
  import '$lib/components/deferredIcons';

  const PREVIEW_SPEED = 0.45;
  // Intentionally untracked: only read/written inside event handlers, never rendered.
  let previewingVolume = false;

  // While the volume slider is being adjusted, loop the pencil-scratch sound so
  // the parent hears the level they're setting.
  function previewVolume() {
    if (!settingsState.soundEnabled || !previewingVolume) return;
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
      icon={settingsState.soundEnabled ? 'volume-on' : 'volume-off'}
      label="Sound"
      id="soundToggle"
      checked={settingsState.soundEnabled}
      onToggle={setSound}
    />
    {#if settingsState.soundEnabled}
      <div class="slider-setting" transition:sectionReveal>
        <SliderRow
          id="soundVolumeLabel"
          label="Volume"
          value={settingsState.soundVolume}
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          snap={SOUND_VOLUME_DEFAULT}
          onInput={onVolumeInput}
          onActiveChange={onVolumeActive}
        />
      </div>
    {/if}
  </div>

  {#if settingsState.soundEnabled}
    <div class="sound-sources" transition:sectionReveal>
      <RuleLabel as="h4" strong class="sources-heading">What makes sound</RuleLabel>
      <div class="source-rows">
        <div class="setting">
          <ToggleRow
            icon="brush-pen"
            label="Drawing"
            id="drawingSoundToggle"
            checked={settingsState.drawingSoundEnabled}
            onToggle={setDrawingSound}
          />
        </div>
        <div class="setting">
          <ToggleRow
            icon="trash-closed"
            label="Deleting"
            id="deleteSoundToggle"
            checked={settingsState.deleteSoundEnabled}
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
    gap: var(--setting-gap);
  }

  .sound-sources :global(h4.sources-heading) {
    margin-bottom: 10px;
  }
</style>
