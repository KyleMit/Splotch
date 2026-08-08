<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import SliderRow from './SliderRow.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import type { CommonIconName } from '../iconTypes';
  import {
    settings,
    setActionButtonScale,
    ACTION_BUTTON_SCALE_MIN,
    ACTION_BUTTON_SCALE_DEFAULT,
    setScreenshot,
    setUndoButton,
    setStrokeWidthControl,
    setEraser,
    setColoringBook,
    setAdvancedControls,
    setPencilEraserEnabled,
  } from '$lib/state/settings.svelte';
  import { setResizingActionButtons } from '$lib/state/ui.svelte';
  import { clearOverlay } from '$lib/state/coloringBook.svelte';
  import { maxActionButtonScale } from '$lib/actionButtonLayout';
  import { SECTION_SLIDE } from './sections';

  // Ceiling the Button Size slider at what the current screen can actually
  // fit, so the parent can't pick a size the Actions Panel would have to cap
  // anyway (landscape: the row would hit the Settings Button; portrait: the
  // column would hit the palette). Recomputed reactively from the shared
  // layout state, so it tracks rotation while Settings is open. A
  // stored value above today's ceiling (e.g. set on a wider screen) is only
  // displayed clamped — it isn't rewritten unless the parent drags the slider.
  const scaleCeiling = $derived(maxActionButtonScale());
  const displayedScale = $derived(Math.min(settings.actionButtonScale, scaleCeiling));

  // Side-effect on top of the persisted setting: disabling the coloring book
  // should also clear any active overlay page.
  function toggleColoringBook(next: boolean) {
    setColoringBook(next);
    if (!next) clearOverlay();
  }

  // The per-button on/off list is a 2-column chip grid: tap a chip to show or
  // hide that Actions Panel button. Each chip reads live `settings` so its
  // on-state stays reactive.
  interface SettingChip {
    id: string;
    label: string;
    icon: CommonIconName;
    checked: () => boolean;
    toggle: (next: boolean) => void;
  }

  const buttonChips = [
    {
      id: 'strokeWidthToggle',
      label: 'Stroke Width',
      icon: 'line-weight-brush',
      checked: () => settings.strokeWidthControlEnabled,
      toggle: setStrokeWidthControl,
    },
    {
      id: 'eraserToggle',
      label: 'Eraser',
      icon: 'brush-eraser',
      checked: () => settings.eraserEnabled,
      toggle: setEraser,
    },
    {
      id: 'coloringBookToggle',
      label: 'Coloring Book',
      icon: 'shapes',
      checked: () => settings.coloringBookEnabled,
      toggle: toggleColoringBook,
    },
    {
      id: 'screenshotToggle',
      label: 'Screenshot',
      icon: 'camera',
      checked: () => settings.screenshotEnabled,
      toggle: setScreenshot,
    },
    {
      id: 'undoToggle',
      label: 'Undo',
      icon: 'undo',
      checked: () => settings.undoButtonEnabled,
      toggle: setUndoButton,
    },
  ] as const satisfies readonly SettingChip[];

  type ChipId = (typeof buttonChips)[number]['id'];

  const chipOptions: SegmentedPickerOption<ChipId>[] = buttonChips.map(({ id, label, icon }) => ({
    value: id,
    label,
    icon,
    id,
  }));

  const activeChips = $derived(buttonChips.filter((chip) => chip.checked()).map((chip) => chip.id));

  function toggleChip(id: ChipId) {
    const chip = buttonChips.find((entry) => entry.id === id);
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
          label="Show these buttons"
          options={chipOptions}
          selected={activeChips}
          onSelect={toggleChip}
        />
      </div>
    </div>
  {/if}

  {#if settings.applePencilSeen}
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
