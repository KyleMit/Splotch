<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import {
    AI_AUTO_SAVE_LABEL,
    AI_CUSTOMIZATION_HELP,
    AI_CUSTOMIZATION_LABEL,
    aiAutoSaveHelp,
  } from './aiSettingsCopy';
  import { folderSaveSupported } from '$lib/drawing/folderSave';
  import { settingsState, setAiCustomization, setAutoSaveAi } from '$lib/state/settings.svelte';
  import '$lib/components/deferredIcons';
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon="customize"
      label={AI_CUSTOMIZATION_LABEL}
      id="aiCustomizationToggle"
      checked={settingsState.aiCustomizationEnabled}
      onToggle={setAiCustomization}
      help={AI_CUSTOMIZATION_HELP}
    />
  </div>

  <div class="setting">
    <ToggleRow
      icon="download"
      label={AI_AUTO_SAVE_LABEL}
      id="autoSaveAiToggle"
      checked={settingsState.autoSaveAiEnabled}
      onToggle={setAutoSaveAi}
      help={aiAutoSaveHelp(folderSaveSupported())}
    />
  </div>
</section>
