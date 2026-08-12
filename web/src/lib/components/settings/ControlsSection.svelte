<script lang="ts">
  import { tick, untrack } from 'svelte';
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
  import { DRAWING_TOOLS, type DrawingToolId } from './drawingTools';

  // Ceiling the Button Size slider at what the current screen can actually
  // fit, so the parent can't pick a size the Actions Panel would have to cap
  // anyway (landscape: the row would hit the Settings Button; portrait: the
  // column would hit the palette). Recomputed reactively from the shared
  // layout state, so it tracks rotation while Settings is open. A
  // stored value above today's ceiling (e.g. set on a wider screen) is only
  // displayed clamped — it isn't rewritten unless the parent drags the slider.
  const scaleCeiling = $derived(maxActionButtonScale());
  const displayedScale = $derived(Math.min(settings.actionButtonScale, scaleCeiling));

  // The per-tool on/off list shows or hides that brush or Actions Panel button.
  // One list rather than a split between the two — a parent turning something
  // off is choosing what a child can reach, and whether it lives in the brush
  // menu or on the panel isn't the distinction they're acting on. Each entry
  // reads live `settings` so its on-state stays reactive.
  const toolOptions: SegmentedPickerOption<DrawingToolId>[] = DRAWING_TOOLS.map(
    ({ id, label, icon }) => ({ value: id, label, icon, id })
  );

  const shownTools = $derived(
    DRAWING_TOOLS.filter((tool) => tool.checked()).map((tool) => tool.id)
  );

  function toggleTool(id: DrawingToolId) {
    const tool = DRAWING_TOOLS.find((entry) => entry.id === id);
    tool?.toggle(!tool.checked());
  }

  // The list wears one of two skins, chosen by how much room the block has.
  // Chips buy a second column, and that is the whole of what they buy: they pay
  // for it with a check mark standing in for a switch and a fill standing in
  // for a row. Given a full column to itself, the plain toggle row that every
  // other boolean in Settings uses reads cleaner — so the chips appear only
  // above the width where two of them hold the longest option names ("Stroke
  // width", "Magic brush") without breaking across lines. A chip spends ~84px
  // of its box on furniture — padding, the 26px icon, the two gaps, the check
  // mark — which is what puts the crossover here.
  const TWO_COLUMN_CHIP_WIDTH_PX = 345;

  // Measured off the block rather than the viewport, so the phone hub and the
  // wide shell's pane each get the skin their own width earns. The observer is
  // the only reader; the derived `useChips` is what renders.
  let toolsBlockEl = $state<HTMLElement>();
  let toolsBlockWidth = $state(0);
  const useChips = $derived(toolsBlockWidth >= TWO_COLUMN_CHIP_WIDTH_PX);

  const focusedToolId = (): DrawingToolId | null => {
    const id = document.activeElement?.id;
    return DRAWING_TOOLS.some((tool) => tool.id === id) ? (id as DrawingToolId) : null;
  };

  // A skin change destroys the control the parent was on and mounts the other
  // skin's in its place, which drops focus to <body> — a keyboard user resizing
  // the window or zooming the browser would have to tab in from the top again.
  // The tool's id is the same element under either skin, so it is what carries
  // focus across the swap.
  async function measureBlock(width: number) {
    if (width === toolsBlockWidth) return;
    const swapsSkin = width >= TWO_COLUMN_CHIP_WIDTH_PX !== useChips;
    const refocus = swapsSkin ? focusedToolId() : null;
    toolsBlockWidth = width;
    if (!refocus) return;
    await tick();
    document.getElementById(refocus)?.focus();
  }

  $effect(() => {
    const block = toolsBlockEl;
    if (!block) return;
    // Seeded synchronously so the first paint already carries the right skin —
    // the dialog is closed rather than unmounted, so a block mounted at zero
    // width (or reopened at another one) is corrected by the observer below.
    //
    // Untracked because `measureBlock` reads the width it writes: tracking that
    // read would make every observer update re-run this setup, which reseeds
    // from `clientWidth` and re-observes. Under the pane's CSS `zoom` (ADR-0076)
    // the two readings disagree by design — `clientWidth` is rounded, the
    // observer's `contentRect.width` is not — so each would keep correcting the
    // other for as long as the parent stayed zoomed. `settings-zoom.spec.ts`
    // pins the observer quiet at a fractional zoom.
    untrack(() => measureBlock(block.clientWidth));
    const observer = new ResizeObserver(([entry]) => measureBlock(entry.contentRect.width));
    observer.observe(block);
    return () => observer.disconnect();
  });

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

      <div class="tools-block" bind:this={toolsBlockEl}>
        <h4 class="tools-heading">Drawing Tools</h4>
        {#if useChips}
          <SegmentedPicker
            variant="chip"
            mode="toggle"
            class="control-chips"
            label="Drawing Tools"
            options={toolOptions}
            selected={shownTools}
            onSelect={toggleTool}
          />
        {:else}
          <div class="tool-rows">
            {#each DRAWING_TOOLS as tool (tool.id)}
              <div class="setting">
                <ToggleRow
                  icon={tool.icon}
                  label={tool.label}
                  id={tool.id}
                  checked={tool.checked()}
                  onToggle={tool.toggle}
                />
              </div>
            {/each}
          </div>
        {/if}
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

  .tools-block {
    margin-top: 20px;
  }

  /* The rows carry the gap the shell gives a run of `.setting` cards, which only
     reaches the ones parented directly by a `.setting-group`. */
  .tool-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tools-heading {
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
