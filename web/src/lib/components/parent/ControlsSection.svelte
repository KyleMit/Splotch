<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import Slider from '../Slider.svelte';
  import Icon from '../Icon.svelte';
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
  import { maxActionButtonScale } from '$lib/state/actionButtonLayout.svelte';

  // Ceiling the Button Size slider at what the current screen can actually
  // fit, so the parent can't pick a size the Actions Panel would have to cap
  // anyway (landscape: the row would hit the Parent Help Button; portrait: the
  // column would hit the palette). Recomputed reactively from the shared
  // layout state, so it tracks rotation while the Parent Center is open. A
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
  const buttonChips: {
    id: string;
    label: string;
    icon: CommonIconName;
    checked: () => boolean;
    toggle: (next: boolean) => void;
  }[] = [
    {
      id: 'strokeWidthToggle',
      label: 'Stroke Width',
      icon: 'line-weight',
      checked: () => settings.strokeWidthControlEnabled,
      toggle: setStrokeWidthControl,
    },
    {
      id: 'eraserToggle',
      label: 'Eraser',
      icon: 'eraser',
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
  ];

  // While the button-size slider is dragged, the Parent Center melts away to just
  // the slider (see ParentCenter) so the parent can watch the action buttons
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
    <div class="setting slider-setting button-size-setting" transition:slide={{ duration: 220 }}>
      <div class="slider-label" id="actionButtonScaleLabel">
        <span class="slider-label-name">
          <Icon name="photo-size-select-small" class="setting-icon" />
          Button Size
        </span>
        <span>{displayedScale}%</span>
      </div>
      <Slider
        value={displayedScale}
        min={ACTION_BUTTON_SCALE_MIN}
        max={scaleCeiling}
        snap={scaleCeiling > ACTION_BUTTON_SCALE_DEFAULT ? ACTION_BUTTON_SCALE_DEFAULT : undefined}
        labelId="actionButtonScaleLabel"
        valueText="{displayedScale}%"
        onInput={setActionButtonScale}
        onActiveChange={onScaleActive}
      />
    </div>

    <div class="chip-block" transition:slide={{ duration: 220 }}>
      <h4 class="chip-heading">Show these buttons</h4>
      <div class="chip-grid">
        {#each buttonChips as chip (chip.id)}
          <button
            type="button"
            class="chip"
            class:on={chip.checked()}
            id={chip.id}
            aria-pressed={chip.checked()}
            onclick={() => chip.toggle(!chip.checked())}
          >
            <Icon name={chip.icon} class="chip-icon" />
            <span class="chip-label">{chip.label}</span>
            <span class="chip-check" aria-hidden="true">{chip.checked() ? '✓' : ''}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if settings.applePencilSeen}
    <div class="setting pencil-eraser" transition:slide={{ duration: 220 }}>
      <ToggleRow
        icon="eraser"
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
  .setting-group .setting + .setting {
    margin-top: 6px;
  }

  .slider-setting {
    margin-top: 12px;
  }

  .button-size-setting {
    margin: 12px 0 0;
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

  .slider-label-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--text);
  }

  .chip-block {
    margin-top: 20px;
  }

  .chip-heading {
    margin: 0 0 10px 0;
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  /* 2-column grid of toggle chips, replacing the old stack of toggle rows. */
  .chip-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-mid);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .chip:not(.on):hover {
      background: var(--surface-hover);
      color: var(--text-strong);
    }
  }

  .chip.on {
    background: var(--brand);
    border-color: var(--brand);
    color: #fff;
  }

  @media (hover: hover) {
    .chip.on:hover {
      background: var(--brand-hover);
      border-color: var(--brand-hover);
    }
  }

  .chip-label {
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.chip-icon) {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }

  /* The chip's icon inherits the chip text color so it flips to white when on. */
  .chip.on :global(.chip-icon svg) {
    fill: #fff;
  }

  .chip-check {
    flex-shrink: 0;
    width: 14px;
    text-align: center;
    font-size: var(--font-size-md);
    font-weight: 700;
  }

  .pencil-eraser {
    margin-top: 16px;
  }
</style>
