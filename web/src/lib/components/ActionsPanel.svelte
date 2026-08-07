<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import BrushButtonFaces from './BrushButtonFaces.svelte';
  import BrushMenu from './BrushMenu.svelte';
  import StrokeWidthMenu from './StrokeWidthMenu.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { colors, isWhite, isDarkInk } from '$lib/state/colors.svelte';
  import { settings, setDrawerOpen } from '$lib/state/settings.svelte';
  import { setStrokeSize, activeStrokeSize, type StrokeSize } from '$lib/state/strokeWidth.svelte';
  import { toolState, selectBrush, type BrushType } from '$lib/state/tool.svelte';
  import { ui, coloringBookModal, aiPromptModal, SCREENSHOT_BUTTON_ID } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { aiResult } from '$lib/state/aiGeneration.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { browser } from '$app/environment';
  import { layout } from '$lib/state/layout.svelte';
  import {
    PANEL_INSET,
    MAX_ACTION_BUTTON_COUNT,
    buttonSizeCssExpr,
    isAiImageButtonVisible,
    visibleActionButtonCount,
    resolvedLandscapePaletteWidth,
    resolvedPortraitPaletteHeight,
    publishActionPanelState,
  } from '$lib/actionButtonLayout';
  import { undo } from '$lib/drawing/engine';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import { replayActionUnavailableFeedback } from '$lib/actionUnavailableFeedback';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';

  let brushWrapperEl: HTMLDivElement | undefined = $state();
  let strokeWrapperEl: HTMLDivElement | undefined = $state();
  let coloringBtnEl: HTMLButtonElement | undefined = $state();
  let aiBtnEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();
  // Intentionally untracked: this ref is read only by imperative tap and animation handlers.
  let undoBtnEl: HTMLButtonElement | undefined;
  let drawerMotion = $state(false);
  // Intentionally untracked: only the reactive drawer-expanded value should rerun this comparison.
  let lastDrawerExpanded: boolean | undefined;

  // The two flyouts (Brush Menu, Stroke Width) share one open-state slot, so
  // opening one closes the other and the outside-click handler below only ever
  // watches a single wrapper.
  let openFlyout = $state<'brush' | 'stroke' | null>(null);

  const erasing = $derived(toolState.brush === 'eraser');

  // Orientation drives the landscape palette-clearing offset below. Everything
  // else orientation-dependent here (drawer collapse axis, chevron direction)
  // is CSS. The shared layout module owns the listeners.
  const isPortrait = $derived(layout.orientation === 'portrait');

  // Landscape: sit just past the Color Palette so we clear it. The raw
  // prerendered page gets the same deterministic width from the shared CSS
  // custom property; hydrated JS uses that geometry until ColorPalette publishes
  // its measured width, which remains the correction for browser rounding.
  //
  // The inline left wins over the stylesheet, so the safe-area inset has to ride
  // along in this value or it's lost: .app-container's padding-left shifts the
  // palette right by env(safe-area-inset-left) (the Android landscape hole-punch),
  // and the measured width doesn't include that padding — so we clear inset + width.
  const landscapePaletteWidth = $derived(resolvedLandscapePaletteWidth());
  const portraitPaletteHeight = $derived(resolvedPortraitPaletteHeight());
  const leftOffset = $derived(
    !browser || isPortrait
      ? undefined
      : `calc(${landscapePaletteWidth + PANEL_INSET}px + env(safe-area-inset-left))`
  );

  // Cap the button size so the expanded panel always fits the screen —
  // landscape: the row stops short of the bottom-right Settings Button;
  // portrait: the column stops short of the palette bar at the top. The formula
  // lives in actionButtonLayout, which builds this CSS length and the Button
  // Size slider's dynamic max in Settings from one budget. An explicit equal
  // per-button size — rather than letting
  // the row flex-shrink — keeps the buttons identical (flex distributes by
  // inner base size, which padding skews) and keeps their positions stable
  // while the drawer's expand animation sweeps the row's width through zero.
  //
  // This precise, measured cap is only set once we're in the browser. During
  // prerender there's no orientation (SSR is always landscape) and no measured
  // palette, so baking a value here would force the landscape formula onto
  // portrait phones — which painted the buttons "incredibly small" until
  // hydration swapped in the real size (issue #317). Instead we leave
  // --action-btn-size unset at SSR and let the CSS --action-btn-fallback own
  // first paint via media query. Once hydrated this value overrides it, and CSS
  // keeps size out of `transition` so the swap snaps rather than animating.
  //
  // Viewport units: landscape uses 100vw — the URL bar doesn't affect width.
  // Portrait uses layout.viewportHeight (not 100vh): on mobile web 100vh is the
  // *large* viewport (URL bar collapsed), which overestimates the vertical
  // budget while the browser chrome is visible. viewportHeight is the same
  // visible-viewport number the slider ceiling uses (kept live by the shared
  // resize listener, which fires on URL-bar show/hide), so the render cap and
  // the ceiling can't disagree.
  const buttonCount = $derived(browser ? visibleActionButtonCount() : MAX_ACTION_BUTTON_COUNT);
  const aiImageButtonVisible = $derived(isAiImageButtonVisible());

  const buttonSize = $derived(
    !browser
      ? undefined
      : buttonSizeCssExpr(
          isPortrait
            ? {
                orientation: 'portrait',
                buttonCount,
                paletteHeight: portraitPaletteHeight,
                viewportHeight: layout.viewportHeight,
              }
            : { orientation: 'landscape', buttonCount, paletteWidth: landscapePaletteWidth }
        )
  );

  // When advanced controls are disabled the chevron is hidden and the drawer
  // can't expand, simplifying the UI. When enabled, the chevron shows and the
  // drawer expands per its remembered open state. Dragging the button-size
  // slider force-opens the drawer (without persisting) so the parent can watch
  // the buttons resize live.
  const drawerExpanded = $derived(
    (settings.advancedControlsEnabled && settings.drawerOpen) || ui.resizingActionButtons
  );

  $effect(() => {
    const expanded = drawerExpanded;
    if (lastDrawerExpanded === undefined) {
      lastDrawerExpanded = expanded;
      return;
    }
    if (lastDrawerExpanded === expanded) return;
    lastDrawerExpanded = expanded;
    drawerMotion = true;
  });

  const buttonScale = $derived(settings.actionButtonScale / 100);

  // app.html seeds <html> for first paint of the prerendered page. Hydration
  // publishes the live copy to this panel so later settings changes invalidate
  // only its subtree. publishActionPanelState applies the live marker last, so
  // CSS switches sources only after every local attribute agrees.
  $effect(() => {
    if (!panelEl) return;
    publishActionPanelState(panelEl, drawerExpanded, buttonScale);
  });

  // The stroke-size lines preview the ink you'll lay down, tinted via
  // currentColor. Only the pen uses it — the eraser previews are theme-driven
  // "holes in the paper" (--paper / --hole-stroke), never color-tinted, so
  // they stay distinct from every pen color (including pink).
  const strokeMenuColor = $derived(colors.activeColor);

  // A white brush color vanishes against the light icon buttons, so the
  // color-tinted icons (the pen/crayon currentColor parts, the stroke-weight
  // lines) get a black outline while white is active.
  const inkWhite = $derived(isWhite(colors.activeColor));

  // The dark-mode mirror: near-black ink vanishes against the dark cards, so it
  // gets a light outline there. The class applies in every theme; the keyline
  // color (--dark-ink-keyline) is transparent in light, so it only ever shows
  // in dark.
  const inkDark = $derived(isDarkInk(colors.activeColor));

  // The stroke-weight control drops the keylines while erasing — its icons
  // carry the eraser's own coloring then. The Brush Button keeps them: its
  // pen/crayon faces and menu entries preview the ink color even while the
  // eraser is active, and the eraser/magic icons hold no currentColor paths,
  // so the keyline rules are inert on them.
  const whiteStroke = $derived(!erasing && inkWhite);
  const darkStroke = $derived(!erasing && inkDark);

  function toggleDrawer() {
    const next = !settings.drawerOpen;
    setDrawerOpen(next);
    // Tidy up any open flyout as the controls tuck away.
    if (!next) openFlyout = null;
  }

  function finishDrawerMotion(event: TransitionEvent) {
    if (event.target === event.currentTarget && event.propertyName === 'opacity')
      drawerMotion = false;
  }

  onMount(() => {
    // Click outside closes the open flyout
    const onDocPointerDown = (e: PointerEvent) => {
      if (!openFlyout) return;
      const wrapper = openFlyout === 'brush' ? brushWrapperEl : strokeWrapperEl;
      if (wrapper && !wrapper.contains(e.target as Node)) openFlyout = null;
    };
    document.addEventListener('pointerdown', onDocPointerDown);

    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
    };
  });

  function handleUndoClick() {
    if (canvasState.canUndo) {
      undo();
      return;
    }
    replayActionUnavailableFeedback(undoBtnEl);
  }

  // The save pipeline (export compositor, polaroid, folder save) is
  // save-time-only, so it loads at tap time and stays out of the startup
  // bundle (issue #461). The catch keeps a dead-connection chunk load from
  // throwing unhandled — the tap just does nothing, like the other silent
  // save degradations (see screenshot.ts).
  async function handleScreenshotClick() {
    if (canvasState.canvasEmpty) return;
    try {
      const { saveScreenshot } = await import('$lib/drawing/screenshot');
      await saveScreenshot();
    } catch (err) {
      console.error('Screenshot save failed:', err);
    }
  }

  function handleBrushBtnClick() {
    openFlyout = openFlyout === 'brush' ? null : 'brush';
  }

  function handleStrokeBtnClick() {
    openFlyout = openFlyout === 'stroke' ? null : 'stroke';
  }

  // Picking a brush keeps it selected rather than toggling off (issue #276):
  // repeated taps are idempotent. The child leaves the eraser or magic brush by
  // picking another brush here or a color (ColorPalette calls selectInkBrush),
  // which resumes drawing with that color.
  function handleBrushTypeClick(brush: BrushType) {
    selectBrush(brush);
    openFlyout = null;
  }

  function handleStrokeSizeClick(size: StrokeSize) {
    setStrokeSize(size);
    openFlyout = null;
  }

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    coloringBookModal.show(buttonCenter(coloringBtnEl));
  }

  // The AI flow is a grown-ups area (it sends the drawing off-device), so the
  // tap runs through the parental gate before the prompt opens or a
  // generation starts.
  async function handleAiImageClick() {
    if (aiResult.generating || canvasState.canvasEmpty || !aiBtnEl) return;

    const origin = buttonCenter(aiBtnEl);
    requireParentalGate(() => {
      if (settings.aiCustomizationEnabled) {
        aiPromptModal.show(origin);
        return;
      }

      generateAiImage();
    }, origin);
  }
</script>

<!-- scribbleGuard cancels a stylus tap's touch stream so it can't arm iPadOS
     Scribble against the next stroke (ADR-0038); that also suppresses the tap's
     synthesized click, so every button here activates via use:scribbleTap
     (pointerup for pointers, click only for keyboard/AT) instead of onclick. -->
<div
  class="actions-panel"
  data-drawer-motion={drawerMotion ? '' : undefined}
  style:left={leftOffset}
  style:--action-btn-size={buttonSize}
  bind:this={panelEl}
  use:scribbleGuard
>
  <!-- Always rendered; the drawer's open/closed state and each control's toggle
       in Settings are driven purely by CSS. app.html's <html> seed owns
       first paint; the panel-local publish effect owns hydrated changes. -->
  <div class="actions-drawer" ontransitionend={finishDrawerMotion}>
    <div class="actions-drawer-inner">
      <!-- Brush Menu: the four brush types (pen, crayon, magic, eraser) behind
           one trigger whose face is the active brush's icon. All four trigger
           icons stay in the DOM and CSS shows the one matching [data-brush]
           from the pre-paint seed or live panel — an {@html} icon swapped on
           client-only state would keep the
           server-rendered SVG through hydration (.claude/rules/svelte.md). -->
      <div class="flyout-wrapper brush-wrapper" bind:this={brushWrapperEl}>
        <!-- The pen and crayon icons draw their ink parts in currentColor, so
             the trigger and menu carry the active color the way the stroke-width
             control does (the magic/eraser icons ignore it — no currentColor). -->
        <button
          class="action-button"
          class:white-stroke={inkWhite}
          class:dark-stroke={inkDark}
          id="brushButton"
          aria-label="Brushes"
          aria-expanded={openFlyout === 'brush'}
          use:scribbleTap={handleBrushBtnClick}
          style:color={colors.activeColor}
        >
          <BrushButtonFaces />
        </button>
        <BrushMenu
          open={openFlyout === 'brush'}
          activeColor={colors.activeColor}
          {inkWhite}
          {inkDark}
          onpick={handleBrushTypeClick}
        />
      </div>

      <div class="flyout-wrapper stroke-width-wrapper" bind:this={strokeWrapperEl}>
        <button
          class="action-button"
          class:white-stroke={whiteStroke}
          class:dark-stroke={darkStroke}
          id="strokeWidthButton"
          aria-label="Stroke width"
          aria-expanded={openFlyout === 'stroke'}
          use:scribbleTap={handleStrokeBtnClick}
          style:color={colors.activeColor}
        >
          <Icon name={erasing ? 'line-weight-eraser' : 'line-weight'} class="action-icon" />
        </button>
        <StrokeWidthMenu
          open={openFlyout === 'stroke'}
          activeSize={activeStrokeSize()}
          {erasing}
          menuColor={strokeMenuColor}
          {whiteStroke}
          {darkStroke}
          onpick={handleStrokeSizeClick}
        />
      </div>

      <button
        class="action-button"
        id="coloringBookButton"
        aria-label="Coloring books"
        use:scribbleTap={handleColoringBookClick}
        bind:this={coloringBtnEl}
      >
        <Icon name="shapes" class="action-icon" />
      </button>

      <button
        class="action-button screenshot-button"
        class:disabled={canvasState.canvasEmpty}
        id={SCREENSHOT_BUTTON_ID}
        aria-label="Save screenshot"
        disabled={canvasState.canvasEmpty}
        use:scribbleTap={handleScreenshotClick}
      >
        <Icon name="camera" class="action-icon" />
      </button>

      <!-- AI button keeps its reactive `hidden`: its visibility also depends on a
           runtime, non-persisted signal (network.online) the head script can't
           know pre-paint, and it defaults hidden (no credential) so there's no
           first-paint flash to seed away. -->
      <button
        class="action-button"
        class:disabled={canvasState.canvasEmpty || aiResult.generating}
        class:loading={aiResult.generating}
        id="aiImageButton"
        aria-label="Create AI image"
        aria-busy={aiResult.generating}
        disabled={canvasState.canvasEmpty || aiResult.generating}
        hidden={!aiImageButtonVisible}
        use:scribbleTap={handleAiImageClick}
        bind:this={aiBtnEl}
      >
        <Icon name={aiResult.generating ? 'loading' : 'wand-stars'} class="action-icon" />
      </button>

      <!-- aria-disabled (not the disabled attribute) so the button still
           receives taps at the end of history and can answer with the
           unavailable cue; handleUndoClick guards the actual undo. -->
      <button
        class="action-button"
        class:disabled={!canvasState.canUndo}
        id="undoButton"
        aria-label="Undo"
        aria-disabled={!canvasState.canUndo}
        use:scribbleTap={handleUndoClick}
        bind:this={undoBtnEl}
      >
        <Icon name="undo" class="action-icon" />
      </button>
    </div>
  </div>

  <button
    class="drawer-toggle corner-button"
    aria-label={settings.drawerOpen ? 'Collapse controls' : 'Expand controls'}
    aria-expanded={settings.drawerOpen}
    use:scribbleTap={toggleDrawer}
  >
    <Icon name="chevron-right" class="drawer-toggle-icon corner-button-icon" />
  </button>
</div>

<style>
  .actions-panel {
    position: fixed;
    bottom: calc(8px + env(safe-area-inset-bottom));
    left: calc(var(--palette-landscape-width) + 8px + env(safe-area-inset-left));
    display: flex;
    flex-direction: row;
    align-items: center;
    z-index: var(--z-panel);
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: calc(8px + env(safe-area-inset-left));
    }
  }

  /* Collapsible drawer holding the action buttons. Always in the DOM; open/closed
     reads the app.html <html> seed before hydration and the panel-local
     [data-drawer-open] state afterward, so a returning user's state is correct
     at first paint without making live changes document-wide.

     The collapse is a grid accordion: the outer grid animates one track between
     1fr (open) and 0fr (closed) — width in landscape, height in portrait, matching
     the old slide axis — while the inner clips its overflowing content. The margin
     toward the toggle collapses too, so the toggle glides to the corner. */
  .actions-drawer {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    margin-right: 8px;
    /* Grid-track animation repaints the scene beneath this fixed panel on mobile
       Chromium. Keep the motion perceptible without spanning enough frames to
       starve drawing-surface presentation. */
    --drawer-collapse: calc(var(--duration-fast) / 2);
    --drawer-transition:
      grid-template-columns var(--drawer-collapse) ease,
      grid-template-rows var(--drawer-collapse) ease, opacity var(--drawer-collapse) ease,
      margin var(--drawer-collapse) ease;
  }

  .actions-panel[data-drawer-motion] .actions-drawer {
    transition: var(--drawer-transition);
  }

  .actions-drawer-inner {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    /* Clip the buttons to the collapsing track. Flipped to visible once open so
       the absolutely-positioned flyouts (which pop outside the drawer box)
       aren't clipped — they can only be opened while the drawer is open and
       settled, so the closed/animating clip still holds. */
    overflow: hidden;
  }

  :global(html[data-drawer-open])
    .actions-panel:not([data-action-panel-live])
    .actions-drawer-inner,
  :global(.actions-panel[data-action-panel-live][data-drawer-open]) .actions-drawer-inner {
    overflow: visible;
  }

  :global(html:not([data-drawer-open]))
    .actions-panel:not([data-action-panel-live])
    .actions-drawer,
  :global(.actions-panel[data-action-panel-live]:not([data-drawer-open])) .actions-drawer {
    grid-template-columns: 0fr;
    opacity: 0;
    margin-right: 0;
    pointer-events: none;
    /* Inert when closed: out of hit-testing, the a11y tree, and tab order (unlike
       opacity alone). */
    visibility: hidden;
  }

  :global(.actions-panel[data-action-panel-live][data-drawer-motion]:not([data-drawer-open]))
    .actions-drawer {
    /* A state-driven close keeps the drawer visible until its collapse finishes.
       Orientation-only geometry changes never set data-drawer-motion. */
    transition:
      var(--drawer-transition),
      visibility 0s var(--drawer-collapse);
  }

  @media (orientation: portrait) {
    .actions-drawer {
      grid-template-columns: none;
      grid-template-rows: 1fr;
      margin-right: 0;
      margin-top: 8px;
    }

    .actions-drawer-inner {
      flex-direction: column-reverse;
    }

    :global(html:not([data-drawer-open]))
      .actions-panel:not([data-action-panel-live])
      .actions-drawer,
    :global(.actions-panel[data-action-panel-live]:not([data-drawer-open])) .actions-drawer {
      grid-template-columns: none;
      grid-template-rows: 0fr;
      margin-top: 0;
      margin-right: 0;
    }
  }

  /* Individual controls sit behind on/off toggles in Settings. The <html>
     bootstrap selector applies only until the panel publishes its live marker;
     hydrated toggles use panel-local attributes. Controls default ON, so the raw
     prerendered HTML already shows the defaults. */
  :global(html[data-off-stroke]) .actions-panel:not([data-action-panel-live]) .stroke-width-wrapper,
  :global(.actions-panel[data-action-panel-live][data-off-stroke]) .stroke-width-wrapper {
    display: none;
  }
  /* The eraser's toggle in Settings hides its Brush Menu entry — that rule
     moved into BrushMenu.svelte with the #eraserButton element it targets. */
  :global(html[data-off-coloring]) .actions-panel:not([data-action-panel-live]) #coloringBookButton,
  :global(.actions-panel[data-action-panel-live][data-off-coloring]) #coloringBookButton {
    display: none;
  }
  :global(html[data-off-screenshot])
    .actions-panel:not([data-action-panel-live])
    .screenshot-button,
  :global(.actions-panel[data-action-panel-live][data-off-screenshot]) .screenshot-button {
    display: none;
  }
  :global(html[data-off-undo]) .actions-panel:not([data-action-panel-live]) #undoButton,
  :global(.actions-panel[data-action-panel-live][data-off-undo]) #undoButton {
    display: none;
  }

  /* Chevron toggle is hidden (and the drawer can't open) when advanced controls
     are off — the same gate the old {#if advancedControlsEnabled} enforced.
     Default on, so `data-off-adv` (present only when off) hides it. */
  :global(html[data-off-adv]) .actions-panel:not([data-action-panel-live]) .drawer-toggle,
  :global(.actions-panel[data-action-panel-live][data-off-adv]) .drawer-toggle {
    display: none;
  }

  /* Drawer open/close toggle. Deliberately low-key (chrome from .corner-button
     in app.css, shared with the Settings Button) so it doesn't compete
     with the tools. */
  .drawer-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Chevron rotation is fully CSS, composed from two custom properties so each
     input is correct at first paint of the prerendered page:
       • --drawer-axis-rot — orientation axis, from a media query (landscape base
         points right at 0°; portrait rotates the axis −90°).
       • --drawer-open-rot — the 0°/180° open/close flip, from the bootstrap or
         panel-local [data-drawer-open] attribute rather than JS markup.
     Composed:
       landscape closed 0 · open 180 (left)
       portrait  closed −90 (up) · open 90 (down) */
  :global(.drawer-toggle-icon) {
    pointer-events: none;
    --drawer-axis-rot: 0deg;
    --drawer-open-rot: 0deg;
    transform: rotate(calc(var(--drawer-axis-rot) + var(--drawer-open-rot)));
  }

  :global(html[data-drawer-open])
    .actions-panel:not([data-action-panel-live])
    :global(.drawer-toggle-icon),
  :global(.actions-panel[data-action-panel-live][data-drawer-open]) :global(.drawer-toggle-icon) {
    --drawer-open-rot: 180deg;
  }

  @media (orientation: portrait) {
    :global(.drawer-toggle-icon) {
      --drawer-axis-rot: -90deg;
    }
  }

  /* Sized to roughly match the Color Swatch touch target (60px landscape /
     55px portrait) so the action buttons feel like equal-weight tap targets
     for small hands. The parent can rescale them in Settings with
     --action-btn-scale (defaults to 1 when unset). */
  .action-button {
    /* --action-btn-size (inline) is the precise measured cap ActionsPanel sets
       once hydrated, so the row clears the Settings Button (landscape) / the
       palette bar (portrait). Until then it's unset and --action-btn-fallback
       owns first paint: the landscape formula budgets for the 1–5 buttons the
       boot script leaves visible (the AI button requires client-only state), while
       the media query picks the right orientation. The old inline SSR bake was
       always the landscape formula, so portrait phones painted tiny buttons that
       jumped to full size (issue #317).
       Square via width = height so a capped button shrinks like a smaller scale
       instead of squishing. Landscape 100vw (unaffected by the URL bar); the
       --palette-landscape-width reserves the Color Palette before it can be
       measured. 128px = SETTINGS_BUTTON_RESERVE (64) + PANEL_FIXED_CHROME
       (64); the inherited count and gap total default to the five-button raw
       HTML state and app.html overrides them for persisted hidden controls.
       These literals mirror the actionButtonLayout constants and are drift-guarded by
       actionButtonLayout.fallback.test.ts — update both together. */
    --action-btn-fallback: min(
      calc(60px * var(--action-btn-scale, 1)),
      calc(
        (
            100vw - var(--palette-landscape-width) - 128px -
              var(--action-btn-first-paint-gap-total) - env(safe-area-inset-left) -
              env(safe-area-inset-right)
          ) /
          var(--action-btn-first-paint-count)
      )
    );
    width: var(--action-btn-size, var(--action-btn-fallback));
    height: var(--action-btn-size, var(--action-btn-fallback));
    background: var(--float-surface);
    border: 2px solid var(--float-border);
    border-radius: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--float-shadow);
    /* Animate interaction feedback only. Width/height/padding change when the
       panel re-measures on load or the parent drags the Button Size slider;
       those must snap, never animate (issue #317). */
    transition:
      background-color var(--duration-base) ease,
      border-color var(--duration-base) ease,
      box-shadow var(--duration-base) ease,
      transform var(--duration-base) ease,
      opacity var(--duration-base) ease;
    touch-action: manipulation;
    padding: calc(10px * var(--action-btn-scale, 1));
  }

  @media (orientation: portrait) {
    .action-button {
      /* Portrait first-paint cap: the column stops short of the palette bar.
         100vh is the large viewport (overestimates while the URL bar shows), but
         this is only the pre-hydration fallback — --action-btn-size swaps in the
         exact visible height right after hydration. 208px = PALETTE_CLEARANCE
         (8) + WORST_CASE_CHROME (124) + PALETTE_BAR_RESERVE (76). The hydrated
         formula subtracts the measured palette height; reserving the same ~76px
         here (a stable bar height across portrait widths) keeps the column off
         the palette on short screens instead of relying on the slack from the
         worst-case /6 divisor. Drift-guarded by
         actionButtonLayout.fallback.test.ts — update both together. */
      --action-btn-fallback: min(
        calc(55px * var(--action-btn-scale, 1)),
        calc((100vh - 208px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 6)
      );
      padding: calc(9px * var(--action-btn-scale, 1));
    }
  }

  /* Author display:flex above outranks the UA [hidden] rule, so restore it. */
  .action-button[hidden] {
    display: none;
  }

  /* Guard hover behind a real pointer: iOS WebKit applies :hover on tap and
     keeps it sticky until the user taps elsewhere, which left the eraser
     looking active (purple border) after deselecting. The .disabled exclusion
     mirrors :disabled for the undo button, which stays interactive
     (aria-disabled) so it can play the end-of-history shake. */
  @media (hover: hover) {
    .action-button:hover:not(:disabled):not(.disabled) {
      background: var(--float-surface-hover);
      border-color: var(--brand);
      box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.3);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 30%, transparent);
    }
  }

  .action-button:active:not(:disabled):not(.disabled) {
    transform: scale(0.95);
    background: var(--brand-wash);
  }

  /* The exhausted undo button keeps press feedback (it's aria-disabled, not
     disabled, so :active still matches): the tap that triggers the
     end-of-history cue should also feel like a tap, not a dead surface. */
  #undoButton.disabled:active {
    transform: scale(0.95);
    background: var(--brand-wash);
  }

  .action-button:disabled,
  .action-button.disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: var(--float-surface-hover);
  }

  :global(.action-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Tint the monochrome icons to match the UI — via `fill` (which beats the
     SVGs' baked fill attribute) so the ink tracks the theme tokens. Full-color
     spot icons (tagged .icon-color in Icon.svelte) opt out so they show their
     own palette; the button's opacity already conveys the disabled state for
     those. */
  :global(.action-icon:not(.icon-color) svg) {
    fill: var(--icon-ink);
  }

  .action-button:disabled :global(.action-icon:not(.icon-color) svg),
  .action-button.disabled :global(.action-icon:not(.icon-color) svg) {
    fill: var(--icon-muted);
  }

  /* Spin the loading icon while AI generation is running.
     aiSpin keyframe lives in app.css since it's shared with AiImagePrompt. */
  .action-button.loading :global(.action-icon) {
    animation: aiSpin 1s linear infinite;
  }

  /* Flyouts (Brush Menu, Stroke Width): a relative trigger wrapper the parent
     owns; each menu popover (BrushMenu.svelte / StrokeWidthMenu.svelte) renders
     as a direct child of it and positions itself absolutely against this
     wrapper (a Svelte component adds no wrapper DOM). Visibility of the whole
     stroke-width wrapper is gated by the [data-off-stroke] rule above (the
     toggle in Settings). */
  .flyout-wrapper {
    position: relative;
  }
</style>
