<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import SliderRow from './SliderRow.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import {
    settings,
    setActionButtonScale,
    ACTION_BUTTON_SCALE_MIN,
    ACTION_BUTTON_SCALE_DEFAULT,
    setAdvancedControls,
    setPencilEraserEnabled,
  } from '$lib/state/settings.svelte';
  import { setResizingActionButtons } from '$lib/state/ui.svelte';
  import { maxActionButtonScale } from '$lib/actionButtonLayout';
  import { SECTION_SLIDE } from './sections';
  import { DRAWING_TOOL_CHIPS, type DrawingTool, type DrawingToolId } from './drawingTools';

  // Ceiling the Button Size slider at what the current screen can actually
  // fit, so the parent can't pick a size the Actions Panel would have to cap
  // anyway (landscape: the row would hit the Settings Button; portrait: the
  // column would hit the palette). Recomputed reactively from the shared
  // layout state, so it tracks rotation while Settings is open. A
  // stored value above today's ceiling (e.g. set on a wider screen) is only
  // displayed clamped — it isn't rewritten unless the parent drags the slider.
  const scaleCeiling = $derived(maxActionButtonScale());
  const displayedScale = $derived(Math.min(settings.actionButtonScale, scaleCeiling));

  // The per-tool on/off list is a 2-column chip grid: tap a chip to show or
  // hide that Actions Panel button or brush. Each chip reads live `settings` so
  // its on-state stays reactive.
  const buttonChips = DRAWING_TOOL_CHIPS.filter((chip) => chip.grid === 'button');
  const brushChips = DRAWING_TOOL_CHIPS.filter((chip) => chip.grid === 'brush');

  function optionsFor(chips: readonly DrawingTool[]): SegmentedPickerOption<DrawingToolId>[] {
    return chips.map(({ id, label, icon }) => ({ value: id, label, icon, id }));
  }

  function activeFor(chips: readonly DrawingTool[]): DrawingToolId[] {
    return chips.filter((chip) => chip.checked()).map((chip) => chip.id);
  }

  const buttonOptions = optionsFor(buttonChips);
  const brushOptions = optionsFor(brushChips);
  const activeButtons = $derived(activeFor(buttonChips));
  const activeBrushes = $derived(activeFor(brushChips));

  function toggleChip(id: DrawingToolId) {
    const chip = DRAWING_TOOL_CHIPS.find((entry) => entry.id === id);
    chip?.toggle(!chip.checked());
  }

  // While the button-size slider is dragged, Settings melts away to just
  // the slider (see SettingsModal) so the parent can watch the action buttons
  // resize live behind it.
  function onScaleActive(active: boolean) {
    setResizingActionButtons(active);
  }
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon="dashboard-customize"
      label="Enable Advanced Controls"
      id="advancedControlsToggle"
      checked={settings.advancedControlsEnabled}
      onToggle={setAdvancedControls}
      help="Show and hide individual on-screen buttons"
    />
  </div>

  {#if settings.advancedControlsEnabled}
    <div class="advanced-controls-settings" transition:slide={SECTION_SLIDE}>
      <div class="setting button-size-setting">
        <SliderRow
          id="actionButtonScaleLabel"
          label="Button Size"
          icon="photo-size-select-small"
          value={displayedScale}
          min={ACTION_BUTTON_SCALE_MIN}
          max={scaleCeiling}
          snap={scaleCeiling > ACTION_BUTTON_SCALE_DEFAULT
            ? ACTION_BUTTON_SCALE_DEFAULT
            : undefined}
          onInput={setActionButtonScale}
          onActiveChange={onScaleActive}
        />
      </div>

      <div class="chip-block">
        <h4 class="chip-heading">Show these buttons</h4>
        <SegmentedPicker
          variant="chip"
          mode="toggle"
          class="control-chips"
          label="Show these buttons"
          options={buttonOptions}
          selected={activeButtons}
          onSelect={toggleChip}
        />
      </div>

      <div class="chip-block">
        <h4 class="chip-heading">Brushes</h4>
        <SegmentedPicker
          variant="chip"
          mode="toggle"
          class="control-chips"
          label="Brushes"
          options={brushOptions}
          selected={activeBrushes}
          onSelect={toggleChip}
        />
      </div>
    </div>
  {/if}

  {#if settings.applePencilSeen && settings.eraserEnabled}
    <div class="setting pencil-eraser" transition:slide={SECTION_SLIDE}>
      <ToggleRow
        icon="brush-eraser"
        label="Apple Pencil double-tap to erase"
        id="pencilEraserToggle"
        checked={settings.pencilEraserEnabled}
        onToggle={setPencilEraserEnabled}
        help="Double-tap an Apple Pencil to switch between drawing and erasing"
      />
    </div>
  {/if}
</section>

<style>
  .advanced-controls-settings {
    display: flow-root;
  }

  .button-size-setting {
    margin: 12px 0 0;
  }

  .chip-block {
    margin-top: 20px;
    container-type: inline-size;
  }

  /* A chip spends ~84px of its box on furniture — padding, the 26px icon, the
     two gaps, the check mark — so two columns need roughly this much room
     before the longest option names ("Stroke width", "Magic brush") start
     breaking across lines. Below it the grid drops to one column, which every
     label clears with room to spare. Measured off the block rather than the
     viewport, so the phone hub and the wide shell's pane each get the column
     count their own width earns. */
  @container (max-width: 345px) {
    .chip-block :global(.control-chips) {
      grid-template-columns: 1fr;
    }
  }

  .chip-heading {
    margin: 0 0 10px 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .pencil-eraser {
    margin-top: 16px;
  }
</style>
