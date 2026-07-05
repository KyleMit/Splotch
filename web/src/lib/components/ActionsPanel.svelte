<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { colors, isWhite } from '$lib/state/colors.svelte';
  import { settings, setDrawerOpen } from '$lib/state/settings.svelte';
  import {
    strokeState,
    STROKE_SIZES,
    setStrokeSize,
    activeStrokeSize,
  } from '$lib/state/strokeWidth.svelte';
  import { toolState, selectEraser, selectPen } from '$lib/state/tool.svelte';
  import { ui, openColoringBook, openAiPrompt, buttonCenter } from '$lib/state/ui.svelte';
  import { network } from '$lib/state/network.svelte';
  import { layout } from '$lib/state/layout.svelte';
  import { undo } from '$lib/drawing/engine';
  import { saveScreenshot } from '$lib/drawing/screenshot';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';

  let strokeWrapperEl: HTMLDivElement | undefined = $state();
  let coloringBtnEl: HTMLButtonElement | undefined = $state();
  let aiBtnEl: HTMLButtonElement | undefined = $state();

  // Orientation drives the drawer-slide transition axis and the landscape
  // palette-clearing offset below; both need the value in JS. The chevron
  // direction is CSS-driven (see drawerOpenRotation). The shared layout module
  // owns the listeners.
  const isPortrait = $derived(layout.orientation === 'portrait');

  // Landscape: sit just past the color palette so we clear it. Portrait: pin to
  // the bottom-left corner. paletteWidth is published by ColorPalette (0 until
  // measured), so this settles once the palette lays out — no querySelector and
  // no mount-time setTimeout to dodge the layout race.
  //
  // The inline left wins over the stylesheet, so the safe-area inset has to ride
  // along in this value or it's lost: .app-container's padding-left shifts the
  // palette right by env(safe-area-inset-left) (the Android landscape hole-punch),
  // and paletteWidth doesn't include that padding — so we clear inset + width.
  const leftOffset = $derived(
    isPortrait
      ? 'calc(8px + env(safe-area-inset-left))'
      : `calc(${layout.paletteWidth + 8}px + env(safe-area-inset-left))`
  );

  // When advanced controls are disabled the drawer and its chevron are removed
  // entirely, simplifying the UI. When enabled, the chevron shows and the
  // drawer expands per its remembered open state. Dragging the button-size
  // slider force-opens the drawer (without persisting) so the parent can watch
  // the buttons resize live.
  const drawerExpanded = $derived(
    (settings.advancedControlsEnabled && settings.drawerOpen) || ui.resizingActionButtons
  );

  // Live button scale, published as a CSS custom property the button rules
  // multiply into their fixed sizes. 100% → 1 (the authored 60px/55px). Set on
  // <html> (not this panel) so the inline head script in app.html can seed the
  // same property from localStorage before first paint, and so the SSR markup
  // carries no competing default — the two agree on one target.
  const buttonScale = $derived(settings.actionButtonScale / 100);
  $effect(() => {
    document.documentElement.style.setProperty('--action-btn-scale', String(buttonScale));
  });

  // The stroke-size lines preview what you'll lay down: the pen color, or the
  // eraser's pink while erasing. Inherited by the icons via currentColor.
  const strokeMenuColor = $derived(toolState.eraser ? '#fb3675' : colors.activeColor);

  // A white brush color vanishes against the white icon buttons, so the brush
  // icon and stroke-weight lines get a black outline while white is active.
  // Never during erasing — the eraser icon carries its own (pink) coloring.
  const whiteStroke = $derived(!toolState.eraser && isWhite(colors.activeColor));

  // Chevron points the way the drawer will move: forward (out) to open, back
  // (toward the corner it tucks into) to close. We render one chevron (pointing
  // right at 0°) and rotate it rather than swapping between four icon SVGs —
  // that keeps the {@html} icon body identical on server and client (see the
  // hydration caveat in .claude/rules/svelte.md). The rotation has two
  // independent inputs, split by which side knows the value at first paint:
  //   • open/close is persisted app state → a 0°/180° flip we drive from JS as
  //     the --drawer-open-rot custom property (a plain attribute Svelte
  //     reconciles during hydration).
  //   • portrait vs landscape is viewport state the prerendered page can't know
  //     → the −90° axis rotation is supplied by a CSS media query on
  //     .drawer-toggle-icon, so it's already correct on the static page's first
  //     paint. This removes the flash the old JS-computed rotation caused, where
  //     a portrait phone painted the chevron along the landscape axis until
  //     hydration read the real orientation.
  const drawerOpenRotation = $derived(settings.drawerOpen ? 180 : 0);

  function toggleDrawer() {
    const next = !settings.drawerOpen;
    setDrawerOpen(next);
    // Tidy up any open flyout as the controls tuck away.
    if (!next) strokeState.menuOpen = false;
  }

  onMount(() => {
    // Click outside closes stroke menu
    const onDocPointerDown = (e: PointerEvent) => {
      if (strokeState.menuOpen && strokeWrapperEl && !strokeWrapperEl.contains(e.target as Node)) {
        strokeState.menuOpen = false;
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  function handleUndoClick() {
    if (canvasState.canUndo) undo();
  }

  function handleScreenshotClick() {
    if (!canvasState.canvasEmpty) saveScreenshot();
  }

  function handleStrokeBtnClick() {
    strokeState.menuOpen = !strokeState.menuOpen;
  }

  function handleEraserClick() {
    // Tapping the eraser again toggles back to the pen. selectPen only flips the
    // tool flag — colors.activeColor is untouched, so the previous color resumes.
    if (toolState.eraser) selectPen();
    else selectEraser();
  }

  function handleStrokeSizeClick(size: number) {
    setStrokeSize(size);
    strokeState.menuOpen = false;
  }

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    openColoringBook(buttonCenter(coloringBtnEl));
  }

  async function handleAiImageClick() {
    if (ui.aiGenerating || canvasState.canvasEmpty || !aiBtnEl) return;

    if (settings.aiCustomizationEnabled) {
      openAiPrompt(buttonCenter(aiBtnEl));
      return;
    }

    generateAiImage();
  }
</script>

<!-- scribbleGuard cancels a stylus tap's touch stream so it can't arm iPadOS
     Scribble against the next stroke (ADR-0038); that also suppresses the tap's
     synthesized click, so every button here activates via use:scribbleTap
     (pointerup for pointers, click only for keyboard/AT) instead of onclick. -->
<div
  class="actions-panel"
  style:left={leftOffset}
  use:scribbleGuard
>
  {#if drawerExpanded}
    <div class="actions-drawer" transition:slide={{ axis: isPortrait ? 'y' : 'x', duration: 280 }}>
      <div
        class="stroke-width-wrapper"
        bind:this={strokeWrapperEl}
        hidden={!settings.strokeWidthControlEnabled}
      >
        <button
          class="action-button"
          class:white-stroke={whiteStroke}
          id="strokeWidthButton"
          aria-label="Stroke width"
          aria-expanded={strokeState.menuOpen}
          use:scribbleTap={handleStrokeBtnClick}
          style:color={colors.activeColor}
        >
          <Icon
            name={toolState.eraser ? 'line-weight-eraser' : 'line-weight'}
            class="action-icon"
          />
        </button>
        <div
          class="stroke-width-menu"
          class:white-stroke={whiteStroke}
          hidden={!strokeState.menuOpen}
          style:color={strokeMenuColor}
        >
          {#each STROKE_SIZES as size (size)}
            <button
              class="stroke-size-button"
              class:active={activeStrokeSize() === size}
              aria-label="Size {size}"
              aria-pressed={activeStrokeSize() === size}
              use:scribbleTap={() => handleStrokeSizeClick(size)}
            >
              <Icon name={`size-${size}` as import('./icon-names').IconName} class="action-icon" />
            </button>
          {/each}
        </div>
      </div>

      <button
        class="action-button"
        class:active={toolState.eraser}
        id="eraserButton"
        aria-label="Eraser"
        aria-pressed={toolState.eraser}
        hidden={!settings.eraserEnabled}
        use:scribbleTap={handleEraserClick}
      >
        <Icon name="eraser" class="action-icon" />
      </button>

      <button
        class="action-button"
        id="coloringBookButton"
        aria-label="Coloring books"
        hidden={!settings.coloringBookEnabled}
        use:scribbleTap={handleColoringBookClick}
        bind:this={coloringBtnEl}
      >
        <Icon name="shapes" class="action-icon" />
      </button>

      <button
        class="action-button"
        class:disabled={canvasState.canvasEmpty}
        id="screenshotButton"
        aria-label="Save screenshot"
        disabled={canvasState.canvasEmpty}
        hidden={!settings.screenshotEnabled}
        use:scribbleTap={handleScreenshotClick}
      >
        <Icon name="camera" class="action-icon" />
      </button>

      <button
        class="action-button"
        class:disabled={canvasState.canvasEmpty || ui.aiGenerating}
        class:loading={ui.aiGenerating}
        id="aiImageButton"
        aria-label="Create AI image"
        aria-busy={ui.aiGenerating}
        disabled={canvasState.canvasEmpty || ui.aiGenerating}
        hidden={!settings.aiAccessToken || !settings.aiImageEnabled || !network.online}
        use:scribbleTap={handleAiImageClick}
        bind:this={aiBtnEl}
      >
        <Icon name={ui.aiGenerating ? 'loading' : 'wand-stars'} class="action-icon" />
      </button>

      <button
        class="action-button"
        class:disabled={!canvasState.canUndo}
        id="undoButton"
        aria-label="Undo"
        disabled={!canvasState.canUndo}
        hidden={!settings.undoButtonEnabled}
        use:scribbleTap={handleUndoClick}
      >
        <Icon name="undo" class="action-icon" />
      </button>
    </div>
  {/if}

  {#if settings.advancedControlsEnabled}
    <button
      class="drawer-toggle"
      aria-label={settings.drawerOpen ? 'Collapse controls' : 'Expand controls'}
      aria-expanded={settings.drawerOpen}
      use:scribbleTap={toggleDrawer}
    >
      <Icon
        name="chevron-right"
        class="drawer-toggle-icon"
        style="--drawer-open-rot: {drawerOpenRotation}deg"
      />
    </button>
  {/if}
</div>

<style>
  .actions-panel {
    position: fixed;
    bottom: calc(8px + env(safe-area-inset-bottom));
    left: calc(8px + env(safe-area-inset-left));
    display: flex;
    flex-direction: row;
    align-items: center;
    z-index: 901;
    transition: left 0.3s ease;
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: calc(8px + env(safe-area-inset-left));
      bottom: calc(8px + env(safe-area-inset-bottom));
    }
  }

  /* Collapsible drawer holding the action buttons. The buttons grow from the
     corner; the toggle rides along at the far end (right in landscape, top in
     portrait). The spacing toward the toggle lives on the drawer as a margin
     (not a flex gap) so the slide transition collapses it too — the toggle
     glides to the corner instead of snapping the last few pixels. */
  .actions-drawer {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
  }

  @media (orientation: portrait) {
    .actions-drawer {
      flex-direction: column-reverse;
      margin-right: 0;
      margin-top: 8px;
    }
  }

  /* Drawer open/close toggle. Deliberately low-key (no background, muted grey)
     so it mirrors the Parent Center button and doesn't compete with the tools. */
  .drawer-toggle {
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    transition: opacity 0.2s ease;
    touch-action: manipulation;
    flex-shrink: 0;
  }

  @media (hover: hover) {
    .drawer-toggle:hover {
      opacity: 0.7;
    }
  }

  .drawer-toggle:active {
    opacity: 1;
  }

  /* Chevron rotation is composed from two custom properties (see
     drawerOpenRotation in the script): --drawer-axis-rot is the orientation axis,
     set here per media query so it's correct on the prerendered page's first
     paint; --drawer-open-rot is the 0°/180° open/close flip, set inline from JS.
     Landscape base points the chevron right (0°); portrait rotates the axis −90°.
       landscape closed 0  · open 180 (left)
       portrait  closed −90 (up) · open 90 (down) */
  :global(.drawer-toggle-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(60%) grayscale(100%);
    transition: filter 0.2s ease;
    --drawer-axis-rot: 0deg;
    transform: rotate(calc(var(--drawer-axis-rot) + var(--drawer-open-rot, 0deg)));
  }

  @media (orientation: portrait) {
    :global(.drawer-toggle-icon) {
      --drawer-axis-rot: -90deg;
    }
  }

  @media (hover: hover) {
    .drawer-toggle:hover :global(.drawer-toggle-icon) {
      filter: invert(40%) grayscale(100%);
    }
  }

  .drawer-toggle:active :global(.drawer-toggle-icon) {
    filter: invert(0%) grayscale(100%);
  }

  /* Sized to roughly match the Color Swatch touch target (60px landscape /
     55px portrait) so the action buttons feel like equal-weight tap targets
     for small hands. The parent can rescale them from the Parent Center via
     --action-btn-scale (defaults to 1 when unset). */
  .action-button {
    width: calc(60px * var(--action-btn-scale, 1));
    height: calc(60px * var(--action-btn-scale, 1));
    background: white;
    border: 2px solid #ddd;
    border-radius: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    touch-action: manipulation;
    padding: calc(10px * var(--action-btn-scale, 1));
  }

  @media (orientation: portrait) {
    .action-button {
      width: calc(55px * var(--action-btn-scale, 1));
      height: calc(55px * var(--action-btn-scale, 1));
      padding: calc(9px * var(--action-btn-scale, 1));
    }
  }

  /* Author display:flex above outranks the UA [hidden] rule, so restore it. */
  .action-button[hidden] {
    display: none;
  }

  /* Guard hover behind a real pointer: iOS WebKit applies :hover on tap and
     keeps it sticky until the user taps elsewhere, which left the eraser
     looking active (purple border) after deselecting. */
  @media (hover: hover) {
    .action-button:hover:not(:disabled) {
      background: #f5f5f5;
      border-color: var(--brand);
      box-shadow: 0 4px 12px rgba(171, 113, 225, 0.3);
    }
  }

  .action-button:active:not(:disabled) {
    transform: scale(0.95);
    background: #ede7f6;
  }

  /* Selected tool (e.g. eraser): purple ring + tinted fill, matching the
     active stroke-size button. */
  .action-button.active {
    border-color: var(--brand);
    background: #ede7f6;
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
  }

  .action-button.active :global(.action-icon:not(.icon-color)) {
    filter: invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%);
  }

  .action-button:disabled,
  .action-button.disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: #f5f5f5;
    border-color: #e0e0e0;
  }

  :global(.action-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Tint the monochrome icons to match the UI. Full-color spot icons (tagged
     .icon-color in Icon.svelte) opt out so they show their own palette; the
     button's opacity already conveys the disabled state for those. */
  :global(.action-icon:not(.icon-color)) {
    filter: invert(12%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  .action-button:disabled :global(.action-icon:not(.icon-color)),
  .action-button.disabled :global(.action-icon:not(.icon-color)) {
    filter: invert(80%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  /* Spin the loading icon while AI generation is running.
     aiSpin keyframe lives in app.css since it's shared with AiImagePrompt. */
  .action-button.loading :global(.action-icon) {
    animation: aiSpin 1s linear infinite;
  }

  /* Stroke width: trigger button wrapper + flyout menu */
  .stroke-width-wrapper {
    position: relative;
  }

  .stroke-width-wrapper[hidden] {
    display: none;
  }

  /* Landscape (the base rule; portrait overrides below). The action panel sits
     along the bottom with little height to spare, so the flyout pops up as a
     horizontal row — one button tall — instead of a vertical column that would
     run off the top of a short landscape screen. There's ample width to spread
     the sizes rightward. */
  .stroke-width-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    display: flex;
    flex-direction: row;
    gap: 6px;
    padding: 6px;
    background: white;
    border: 2px solid #ddd;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    z-index: 901;
  }

  @media (orientation: portrait) {
    .stroke-width-menu {
      left: calc(100% + 8px);
      bottom: 0;
      flex-direction: row;
    }
  }

  /* On phone-width portrait screens the horizontal flyout runs under the
     bottom-right Parent Center button (and, when narrower, off the right edge):
     a tap on the rightmost size closes the menu, and the trailing click falls
     through to the parent button and opens its modal. Stack the sizes
     vertically instead so the flyout runs up alongside the other action buttons
     and clears the parent button. The row layout stays for tablet-width portrait,
     where there's room to the right of the palette.

     Breakpoint: the row's right edge is fixed (~411px with the 60px size
     buttons — panel inset + stroke button + five buttons); the parent button
     occupies the rightmost ~56px, so they collide below ~467px of viewport
     width. Stay in the column up to 540px for headroom (button sizes have grown
     before) while keeping the row for tablet-width portrait (≥600px devices). */
  @media (orientation: portrait) and (max-width: 540px) {
    .stroke-width-menu {
      flex-direction: column;
    }
  }

  .stroke-width-menu[hidden] {
    display: none;
  }

  .stroke-size-button {
    width: calc(60px * var(--action-btn-scale, 1));
    height: calc(60px * var(--action-btn-scale, 1));
    background: white;
    border: 2px solid #ddd;
    border-radius: 14px;
    cursor: pointer;
    /* Inherit the menu's color so the line icons (currentColor) pick up the
       active pen/eraser color — buttons don't inherit color by default. */
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(7px * var(--action-btn-scale, 1));
    transition: all 0.15s ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .stroke-size-button:hover {
      border-color: var(--brand);
      background: #f5f0ff;
    }
  }

  .stroke-size-button:active {
    transform: scale(0.92);
  }

  .stroke-size-button.active {
    border-color: var(--brand);
    background: #ede7f6;
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
  }

  /* The selected size reads from the button's purple ring/fill; its line keeps
     the current color (currentColor), so only tint non-color icons here. */
  .stroke-size-button.active :global(.action-icon:not(.icon-color)) {
    filter: invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%);
  }

  /* White brush color is invisible on the white buttons, so ring the brush
     lines with a solid black edge while white is active. paint-order draws the
     stroke behind the white fill (so only an outer keyline shows), and
     non-scaling-stroke pins it to 2 screen px on both icons despite their very
     different viewBoxes (brush 409-wide, size lines 960). In the brush icon we
     stroke only the currentColor lines, leaving the colored pencils untouched;
     the size menu holds a single currentColor path, so plain `path` suffices. */
  .action-button.white-stroke :global(svg path[fill='currentColor']),
  .stroke-width-menu.white-stroke :global(svg path) {
    stroke: #000;
    stroke-width: 2px;
    paint-order: stroke;
    vector-effect: non-scaling-stroke;
  }
</style>
