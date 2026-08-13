<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import {
    settings,
    setAiImage,
    setAiCustomization,
    setAutoSaveAi,
  } from '$lib/state/settings.svelte';
  import { SECTION_SLIDE } from './sections';
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon="wand-stars"
      label="Create AI Images"
      id="aiImageToggle"
      checked={settings.aiImageEnabled}
      onToggle={setAiImage}
    />
  </div>

  {#if settings.aiImageEnabled}
    <div class="setting" transition:slide={SECTION_SLIDE}>
      <ToggleRow
        icon="customize"
        label="AI Customization"
        id="aiCustomizationToggle"
        checked={settings.aiCustomizationEnabled}
        onToggle={setAiCustomization}
      />
    </div>

    <div class="setting" transition:slide={SECTION_SLIDE}>
      <ToggleRow
        icon="download"
        label="Auto-Save AI Images"
        id="autoSaveAiToggle"
        checked={settings.autoSaveAiEnabled}
        onToggle={setAutoSaveAi}
        help="Saves each AI image and the drawing to your photos, and shows a larger preview"
      />
    </div>
  {/if}
</section>
