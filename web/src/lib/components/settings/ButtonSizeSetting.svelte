<script lang="ts">
  import SliderRow from './SliderRow.svelte';
  import {
    settingsState,
    setActionButtonScale,
    ACTION_BUTTON_SCALE_MIN,
    ACTION_BUTTON_SCALE_DEFAULT,
  } from '$lib/state/settings.svelte';
  import { setResizingActionButtons } from '$lib/state/ui.svelte';
  import { maxActionButtonScale } from '$lib/actionButtonLayout';
  import '$lib/components/deferredIcons';

  // Ceiling the Button Size slider at what the current screen can actually
  // fit, so the parent can't pick a size the Actions Panel would have to cap
  // anyway (landscape: the row would hit the Settings Button; portrait: the
  // column would hit the palette). Recomputed reactively from the shared
  // layout state, so it tracks rotation while Settings is open. A
  // stored value above today's ceiling (e.g. set on a wider screen) is only
  // displayed clamped — it isn't rewritten unless the parent drags the slider.
  const scaleCeiling = $derived(maxActionButtonScale());
  const displayedScale = $derived(Math.min(settingsState.actionButtonScale, scaleCeiling));

  // While the button-size slider is dragged, Settings melts away to just
  // the slider (see SettingsModal) so the parent can watch the action buttons
  // resize live behind it.
</script>

<div class="setting button-size-setting">
  <SliderRow
    id="accessibilityButtonScaleLabel"
    label="Button Size"
    icon="photo-size-select-small"
    value={displayedScale}
    min={ACTION_BUTTON_SCALE_MIN}
    max={scaleCeiling}
    snap={scaleCeiling > ACTION_BUTTON_SCALE_DEFAULT ? ACTION_BUTTON_SCALE_DEFAULT : undefined}
    help="Bigger buttons help small or unsteady hands"
    onInput={setActionButtonScale}
    onActiveChange={setResizingActionButtons}
  />
</div>
