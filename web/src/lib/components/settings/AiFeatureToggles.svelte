<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import {
    AI_AUTO_SAVE_HELP,
    AI_AUTO_SAVE_LABEL,
    AI_CUSTOMIZATION_HELP,
    AI_CUSTOMIZATION_LABEL,
  } from './aiSettingsCopy';
  import { settings, setAiCustomization, setAutoSaveAi } from '$lib/state/settings.svelte';
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon="customize"
      label={AI_CUSTOMIZATION_LABEL}
      id="aiCustomizationToggle"
      checked={settings.aiCustomizationEnabled}
      onToggle={setAiCustomization}
      help={AI_CUSTOMIZATION_HELP}
    />
  </div>

  <div class="setting">
    <ToggleRow
      icon="download"
      label={AI_AUTO_SAVE_LABEL}
      id="autoSaveAiToggle"
      checked={settings.autoSaveAiEnabled}
      onToggle={setAutoSaveAi}
      help={AI_AUTO_SAVE_HELP}
    />
  </div>
</section>
