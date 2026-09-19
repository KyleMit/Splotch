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

  // One setting rendered in two sections — Tool Drawer, where it sits with the
  // rest of the Actions Panel, and Accessibility, where it is the accommodation
  // for small or unsteady hands. Both read and write the same stored scale; the
  // wide shell mounts both at once, so each caller names its own label id.
  interface Props {
    id: string;
    help?: string;
  }

  let { id, help }: Props = $props();

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
  // resize live behind it. `dragging` marks which of the two copies stays on
  // screen; the other is hidden with the rest of the card.
  let dragging = $state(false);

  function onScaleActive(active: boolean) {
    dragging = active;
    setResizingActionButtons(active);
  }
</script>

<div class="setting button-size-setting" class:dragging>
  <SliderRow
    {id}
    label="Button Size"
    icon="photo-size-select-small"
    value={displayedScale}
    min={ACTION_BUTTON_SCALE_MIN}
    max={scaleCeiling}
    snap={scaleCeiling > ACTION_BUTTON_SCALE_DEFAULT ? ACTION_BUTTON_SCALE_DEFAULT : undefined}
    {help}
    onInput={setActionButtonScale}
    onActiveChange={onScaleActive}
  />
</div>
