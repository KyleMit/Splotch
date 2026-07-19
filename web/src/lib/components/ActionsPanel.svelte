<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { colors, isWhite, isDarkInk } from '$lib/state/colors.svelte';
  import { settings, setDrawerOpen } from '$lib/state/settings.svelte';
  import {
    strokeState,
    STROKE_SIZES,
    setStrokeSize,
    activeStrokeSize,
  } from '$lib/state/strokeWidth.svelte';
  import {
    toolState,
    selectEraser,
    toggleMagic,
    toggleCrayon,
    crayonSelected,
  } from '$lib/state/tool.svelte';
  import { ui, openColoringBook, openAiPrompt, buttonCenter } from '$lib/state/ui.svelte';
  import { browser } from '$app/environment';
  import { network } from '$lib/state/network.svelte';
  import { layout } from '$lib/state/layout.svelte';
  import {
    ACTION_BUTTON_GAP,
    ACTION_BUTTON_BASE_LANDSCAPE,
    ACTION_BUTTON_BASE_PORTRAIT,
    PARENT_BUTTON_RESERVE,
    PANEL_INSET,
    DRAWER_TOGGLE_MARGIN,
    DRAWER_TOGGLE_SIZE,
    PALETTE_CLEARANCE,
    MAX_ACTION_BUTTON_COUNT,
    visibleActionButtonCount,
  } from '$lib/state/actionButtonLayout.svelte';
  import { undo } from '$lib/drawing/engine';
  import { saveScreenshot } from '$lib/drawing/screenshot';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';

  let strokeWrapperEl: HTMLDivElement | undefined = $state();
  let coloringBtnEl: HTMLButtonElement | undefined = $state();
  let aiBtnEl: HTMLButtonElement | undefined = $state();

  // Orientation drives the landscape palette-clearing offset below, which needs
  // the measured palette width in JS. Everything else orientation-dependent here
  // (drawer collapse axis, chevron direction) is CSS. The shared layout module
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

  // Cap the button size so the expanded panel always fits the screen —
  // landscape: the row stops short of the bottom-right Parent Help Button;
  // portrait: the column stops short of the palette bar at the top. Constants
  // and the mirror JS formula (the Parent Center slider's dynamic max) live in
  // actionButtonLayout. An explicit equal per-button size — rather than letting
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
  // first paint: it's the same worst-case cap but expressed per-orientation via
  // media query, so it's correct in both. Once hydrated this value overrides it,
  // and CSS keeps size out of `transition` so the swap snaps rather than
  // animating.
  //
  // Viewport units: landscape uses 100vw — the URL bar doesn't affect width.
  // Portrait uses layout.viewportHeight (not 100vh): on mobile web 100vh is the
  // *large* viewport (URL bar collapsed), which overestimates the vertical
  // budget while the browser chrome is visible. viewportHeight is the same
  // visible-viewport number the slider ceiling uses (kept live by the shared
  // resize listener, which fires on URL-bar show/hide), so the render cap and
  // the ceiling can't disagree.
  const buttonCount = $derived(browser ? visibleActionButtonCount() : MAX_ACTION_BUTTON_COUNT);

  const buttonSpread = $derived(
    (buttonCount - 1) * ACTION_BUTTON_GAP + PANEL_INSET + DRAWER_TOGGLE_MARGIN + DRAWER_TOGGLE_SIZE
  );

  const buttonSize = $derived(
    !browser
      ? undefined
      : isPortrait
        ? `min(calc(${ACTION_BUTTON_BASE_PORTRAIT}px * var(--action-btn-scale, 1)), calc((${layout.viewportHeight - layout.paletteHeight - PALETTE_CLEARANCE}px - env(safe-area-inset-top) - env(safe-area-inset-bottom) - ${buttonSpread}px) / ${buttonCount}))`
        : `min(calc(${ACTION_BUTTON_BASE_LANDSCAPE}px * var(--action-btn-scale, 1)), calc((100vw - ${layout.paletteWidth + PARENT_BUTTON_RESERVE}px - env(safe-area-inset-left) - env(safe-area-inset-right) - ${buttonSpread}px) / ${buttonCount}))`
  );

  // When advanced controls are disabled the chevron is hidden and the drawer
  // can't expand, simplifying the UI. When enabled, the chevron shows and the
  // drawer expands per its remembered open state. Dragging the button-size
  // slider force-opens the drawer (without persisting) so the parent can watch
  // the buttons resize live.
  const drawerExpanded = $derived(
    (settings.advancedControlsEnabled && settings.drawerOpen) || ui.resizingActionButtons
  );

  const buttonScale = $derived(settings.actionButtonScale / 100);

  // Publish the panel's persisted UI state to <html> so CSS can drive it. The
  // page is prerendered (ADR-0040), so its static HTML can't reflect a returning
  // user's stored settings — the buttons are always in the DOM and shown/hidden
  // purely by CSS keyed off these attributes. The inline head script in app.html
  // seeds the same attributes before first paint (so a returning user's drawer and
  // control toggles render with no flash) and this effect keeps them live through
  // hydration and every change.
  //
  // Polarity: an attribute marks a DEVIATION from the default, so the raw
  // prerendered HTML (no attributes) already shows the defaults — drawer closed,
  // advanced controls + every control on. `data-drawer-open` is present when open
  // (default closed); `data-off-*` is present when that control is switched off
  // (default on). Keep the keys/defaults in app.html in sync with BOOL_SETTINGS in
  // settings.svelte.ts. --action-btn-scale rides here too (a CSS var, default via
  // the var() fallback, so it's only meaningful when scaled).
  $effect(() => {
    const el = document.documentElement;
    el.style.setProperty('--action-btn-scale', String(buttonScale));
    el.toggleAttribute('data-drawer-open', drawerExpanded);
    el.toggleAttribute('data-off-adv', !settings.advancedControlsEnabled);
    el.toggleAttribute('data-off-stroke', !settings.strokeWidthControlEnabled);
    el.toggleAttribute('data-off-eraser', !settings.eraserEnabled);
    el.toggleAttribute('data-off-coloring', !settings.coloringBookEnabled);
    el.toggleAttribute('data-off-screenshot', !settings.screenshotEnabled);
    el.toggleAttribute('data-off-undo', !settings.undoButtonEnabled);
  });

  // The stroke-size lines preview the ink you'll lay down, tinted via
  // currentColor. Only the pen uses it — the eraser previews are theme-driven
  // "holes in the paper" (--paper / --hole-stroke), never color-tinted, so
  // they stay distinct from every pen color (including pink).
  const strokeMenuColor = $derived(colors.activeColor);

  // A white brush color vanishes against the light icon buttons, so the brush
  // icon and stroke-weight lines get a black outline while white is active.
  // Never during erasing — the eraser icon carries its own (pink) coloring.
  const whiteStroke = $derived(!toolState.eraser && isWhite(colors.activeColor));

  // The dark-mode mirror: near-black ink vanishes against the dark cards, so it
  // gets a light outline there. The class applies in every theme; the keyline
  // color (--dark-ink-keyline) is transparent in light, so it only ever shows
  // in dark.
  const darkStroke = $derived(!toolState.eraser && isDarkInk(colors.activeColor));

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

  // End-of-history nudge: taps that can't undo any further shake the undo
  // button instead of going silent (the history folds older strokes into the
  // baseline, so the wall is invisible otherwise). Cleared on animationend;
  // re-triggered through a frame so back-to-back taps restart the shake.
  let undoNudge = $state(false);

  function handleUndoClick() {
    if (canvasState.canUndo) {
      undo();
      return;
    }
    undoNudge = false;
    requestAnimationFrame(() => (undoNudge = true));
  }

  function handleScreenshotClick() {
    if (!canvasState.canvasEmpty) saveScreenshot();
  }

  function handleStrokeBtnClick() {
    strokeState.menuOpen = !strokeState.menuOpen;
  }

  function handleEraserClick() {
    // Tapping the eraser keeps it selected rather than toggling off (issue #276):
    // repeated taps are idempotent. The child leaves the eraser by picking a color
    // (ColorPalette calls selectPen), which resumes drawing with that color.
    selectEraser();
  }

  function handleStrokeSizeClick(size: number) {
    setStrokeSize(size);
    strokeState.menuOpen = false;
  }

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    openColoringBook(buttonCenter(coloringBtnEl));
  }

  function handleMagicClick() {
    toggleMagic();
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
  style:--action-btn-size={buttonSize}
  use:scribbleGuard
>
  <!-- Always rendered; the drawer's open/closed state and each control's Parent
       Center on/off toggle are driven purely by CSS keyed off <html> attributes
       (see the publish effect above and app.html), so a returning user's stored
       state is correct at first paint of the prerendered page. -->
  <div class="actions-drawer">
    <div class="actions-drawer-inner">
      <div class="stroke-width-wrapper" bind:this={strokeWrapperEl}>
        <button
          class="action-button"
          class:white-stroke={whiteStroke}
          class:dark-stroke={darkStroke}
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
          class:dark-stroke={darkStroke}
          class:eraser-mode={toolState.eraser}
          hidden={!strokeState.menuOpen}
          style:color={strokeMenuColor}
        >
          <!-- The previews change shape with the tool, not just color (a pink pen
               would otherwise look identical to the eraser): the pen shows ink
               strokes; the eraser shows dashed "holes in the paper" at its true
               effective size (ERASER_SIZE_MULTIPLIER × the pen's width), filled
               with --paper so the hole shows the canvas through the flyout. -->
          {#each STROKE_SIZES as size (size)}
            <button
              class="stroke-size-button"
              class:active={activeStrokeSize() === size}
              aria-label={toolState.eraser ? `Eraser size ${size}` : `Size ${size}`}
              aria-pressed={activeStrokeSize() === size}
              use:scribbleTap={() => handleStrokeSizeClick(size)}
            >
              <Icon
                name={`${toolState.eraser ? 'eraser-size' : 'size'}-${size}` as import('./iconTypes').CommonIconName}
                class="action-icon"
              />
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
        use:scribbleTap={handleEraserClick}
      >
        <Icon name="eraser" class="action-icon" />
      </button>

      <!-- Crayon: swaps the pen's smooth round tip for a wax-crayon tip
           (ADR-0065). A pen-tip style rather than a separate tool — it stays
           selected across color picks, and eraser/magic detours return to it.
           Works with every color, so it's always shown (like the magic brush). -->
      <button
        class="action-button"
        class:active={crayonSelected()}
        id="crayonButton"
        aria-label="Crayon"
        aria-pressed={crayonSelected()}
        use:scribbleTap={toggleCrayon}
      >
        <Icon name="crayon" class="action-icon" />
      </button>

      <button
        class="action-button"
        id="coloringBookButton"
        aria-label="Coloring books"
        use:scribbleTap={handleColoringBookClick}
        bind:this={coloringBtnEl}
      >
        <Icon name="shapes" class="action-icon" />
      </button>

      <!-- Magic brush: reveals colors as the child paints (ADR-0043) — the applied
           coloring page's colors when one is set, otherwise a random rainbow. Works
           on any canvas, so it's always shown. -->
      <button
        class="action-button"
        class:active={toolState.magic}
        id="magicBrushButton"
        aria-label="Magic brush"
        aria-pressed={toolState.magic}
        use:scribbleTap={handleMagicClick}
      >
        <Icon name="magic-brush" class="action-icon" />
      </button>

      <button
        class="action-button"
        class:disabled={canvasState.canvasEmpty}
        id="screenshotButton"
        aria-label="Save screenshot"
        disabled={canvasState.canvasEmpty}
        use:scribbleTap={handleScreenshotClick}
      >
        <Icon name="camera" class="action-icon" />
      </button>

      <!-- AI button keeps its reactive `hidden`: its visibility also depends on a
           runtime, non-persisted signal (network.online) the head script can't
           know pre-paint, and it defaults hidden (no access token) so there's no
           first-paint flash to seed away. -->
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

      <!-- aria-disabled (not the disabled attribute) so the button still
           receives taps at the end of history and can answer with the
           end-of-history shake; handleUndoClick guards the actual undo. -->
      <button
        class="action-button"
        class:disabled={!canvasState.canUndo}
        class:end-of-history={undoNudge}
        id="undoButton"
        aria-label="Undo"
        aria-disabled={!canvasState.canUndo}
        onanimationend={() => (undoNudge = false)}
        use:scribbleTap={handleUndoClick}
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
    left: calc(8px + env(safe-area-inset-left));
    display: flex;
    flex-direction: row;
    align-items: center;
    z-index: 901;
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: calc(8px + env(safe-area-inset-left));
      bottom: calc(8px + env(safe-area-inset-bottom));
    }
  }

  /* Collapsible drawer holding the action buttons. Always in the DOM; open/closed
     is driven by the [data-drawer-open] attribute on <html> (seeded pre-paint by
     app.html, kept live by the publish effect) so a returning user's state is
     correct at first paint — replacing the old {#if} + Svelte slide, which could
     only ever render closed on the prerendered page.

     The collapse is a grid accordion: the outer grid animates one track between
     1fr (open) and 0fr (closed) — width in landscape, height in portrait, matching
     the old slide axis — while the inner clips its overflowing content. The margin
     toward the toggle collapses too, so the toggle glides to the corner. */
  .actions-drawer {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    margin-right: 8px;
    transition:
      grid-template-columns 0.28s ease,
      grid-template-rows 0.28s ease,
      opacity 0.2s ease,
      margin 0.28s ease;
  }

  .actions-drawer-inner {
    display: flex;
    flex-direction: row;
    align-items: center;
    /* Keep in sync with ACTION_BUTTON_GAP in actionButtonLayout.svelte.ts. */
    gap: 12px;
    min-width: 0;
    min-height: 0;
    /* Clip the buttons to the collapsing track. Flipped to visible once open so
       the absolutely-positioned stroke-width flyout (which pops outside the
       drawer box) isn't clipped — it can only be opened while the drawer is open
       and settled, so the closed/animating clip still holds. */
    overflow: hidden;
  }

  :global(html[data-drawer-open]) .actions-drawer-inner {
    overflow: visible;
  }

  :global(html:not([data-drawer-open])) .actions-drawer {
    grid-template-columns: 0fr;
    opacity: 0;
    margin-right: 0;
    pointer-events: none;
    /* Inert when closed: out of hit-testing, the a11y tree, and tab order (unlike
       opacity alone). visibility flips to hidden only after the collapse finishes
       (0.28s transition-delay) so the close still animates; opening restores it
       instantly because the base rule doesn't transition visibility. */
    visibility: hidden;
    transition:
      grid-template-columns 0.28s ease,
      grid-template-rows 0.28s ease,
      opacity 0.2s ease,
      margin 0.28s ease,
      visibility 0s 0.28s;
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

    :global(html:not([data-drawer-open])) .actions-drawer {
      grid-template-columns: none;
      grid-template-rows: 0fr;
      margin-top: 0;
      margin-right: 0;
    }
  }

  /* Individual controls sit behind Parent Center on/off toggles. They stay in the
     DOM and are shown/hidden purely by CSS keyed off <html> attributes (seeded
     pre-paint + kept live, same as the drawer) so their toggle state is correct at
     render, hydration, and live. Controls default ON, so a `data-off-*` attribute
     (present only when the parent switched it off) hides it — which means the raw
     prerendered HTML, before the head script runs, already shows the defaults.
     (The AI button is the exception — see its markup comment.) */
  :global(html[data-off-stroke]) .stroke-width-wrapper {
    display: none;
  }
  :global(html[data-off-eraser]) #eraserButton {
    display: none;
  }
  :global(html[data-off-coloring]) #coloringBookButton {
    display: none;
  }
  :global(html[data-off-screenshot]) #screenshotButton {
    display: none;
  }
  :global(html[data-off-undo]) #undoButton {
    display: none;
  }

  /* Chevron toggle is hidden (and the drawer can't open) when advanced controls
     are off — the same gate the old {#if advancedControlsEnabled} enforced.
     Default on, so `data-off-adv` (present only when off) hides it. */
  :global(html[data-off-adv]) .drawer-toggle {
    display: none;
  }

  /* Drawer open/close toggle. Deliberately low-key (chrome from .corner-button
     in app.css, shared with the Parent Center button) so it doesn't compete
     with the tools. */
  .drawer-toggle {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Chevron rotation is fully CSS, composed from two custom properties so each
     input is correct at first paint of the prerendered page:
       • --drawer-axis-rot — orientation axis, from a media query (landscape base
         points right at 0°; portrait rotates the axis −90°).
       • --drawer-open-rot — the 0°/180° open/close flip, from the [data-drawer-open]
         attribute on <html> (seeded pre-paint, kept live) rather than JS markup.
     Composed:
       landscape closed 0 · open 180 (left)
       portrait  closed −90 (up) · open 90 (down) */
  :global(.drawer-toggle-icon) {
    pointer-events: none;
    --drawer-axis-rot: 0deg;
    --drawer-open-rot: 0deg;
    transform: rotate(calc(var(--drawer-axis-rot) + var(--drawer-open-rot)));
  }

  :global(html[data-drawer-open] .drawer-toggle-icon) {
    --drawer-open-rot: 180deg;
  }

  @media (orientation: portrait) {
    :global(.drawer-toggle-icon) {
      --drawer-axis-rot: -90deg;
    }
  }

  /* Sized to roughly match the Color Swatch touch target (60px landscape /
     55px portrait) so the action buttons feel like equal-weight tap targets
     for small hands. The parent can rescale them from the Parent Center via
     --action-btn-scale (defaults to 1 when unset). */
  .action-button {
    /* --action-btn-size (inline) is the precise measured cap ActionsPanel sets
       once hydrated, so the row clears the Parent Help Button (landscape) / the
       palette bar (portrait). Until then it's unset and --action-btn-fallback
       owns first paint: the same worst-case cap (all 8 buttons, palette not yet
       measured) but expressed in CSS so the media query picks the right
       orientation — the old inline SSR bake was always the landscape formula, so
       portrait phones painted tiny buttons that jumped to full size (issue #317).
       Square via width = height so a capped button shrinks like a smaller scale
       instead of squishing. Landscape 100vw (unaffected by the URL bar); the
       212px = PARENT_BUTTON_RESERVE 64 + worst-case chrome 148 (7·12 gap + 8
       inset + 8 toggle margin + 48 toggle). */
    --action-btn-fallback: min(
      calc(60px * var(--action-btn-scale, 1)),
      calc((100vw - 212px - env(safe-area-inset-left) - env(safe-area-inset-right)) / 8)
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
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease,
      opacity 0.2s ease;
    touch-action: manipulation;
    padding: calc(10px * var(--action-btn-scale, 1));
  }

  @media (orientation: portrait) {
    .action-button {
      /* Portrait first-paint cap: the column stops short of the palette bar.
         100vh is the large viewport (overestimates while the URL bar shows), but
         this is only the pre-hydration fallback — --action-btn-size swaps in the
         exact visible height right after hydration. 232px = 8px palette clearance
         + 148px worst-case chrome (see landscape note) + 76px palette bar. The
         hydrated formula subtracts the measured palette height; reserving the
         same ~76px here (it's a stable bar height across portrait widths) keeps
         the column off the palette on short screens instead of relying on the
         slack from the worst-case /8 divisor. */
      --action-btn-fallback: min(
        calc(55px * var(--action-btn-scale, 1)),
        calc((100vh - 232px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 8)
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
      box-shadow: 0 4px 12px rgba(171, 113, 225, 0.3);
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

  /* End-of-history cue: a tap on the dimmed undo button answers with a shake
     plus a whole-button flash — a wordless "that's as far back as I can go"
     for pre-readers. The pair matters: a fingertip fully occludes the 55–60px
     button, so the positional wobble alone is invisible mid-tap (issue #304);
     the flash's glow ring spreads past the finger. Equal durations so the
     first animationend (which clears the class) doesn't cut the other short. */
  .action-button.end-of-history {
    animation:
      undo-nudge 0.4s ease-in-out,
      undo-flash 0.4s ease-in-out;
  }

  @keyframes undo-nudge {
    20% {
      transform: translateX(-8px) rotate(-6deg);
    }
    40% {
      transform: translateX(8px) rotate(6deg);
    }
    60% {
      transform: translateX(-5px) rotate(-3deg);
    }
    80% {
      transform: translateX(5px) rotate(3deg);
    }
  }

  /* The occlusion-proof half: pulse from the disabled dim to full opacity
     behind a brand glow ring that spreads well beyond the button's edge, so
     the cue reads around a covering fingertip in both themes. */
  @keyframes undo-flash {
    15%,
    70% {
      opacity: 1;
      border-color: var(--brand);
      background: var(--brand-wash);
      box-shadow: 0 0 0 10px rgba(171, 113, 225, 0.5);
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--brand) 50%, transparent);
    }
  }

  /* Reduced motion drops the positional shake but keeps the flash — an
     opacity/color pulse, not motion — so the end-of-history cue never
     disappears entirely (and animationend still fires to clear the class). */
  @media (prefers-reduced-motion: reduce) {
    .action-button.end-of-history {
      animation: undo-flash 0.4s ease-in-out;
    }
  }

  /* Selected tool (e.g. eraser): purple ring + tinted fill, matching the
     active stroke-size button. */
  .action-button.active {
    border-color: var(--brand);
    background: var(--brand-wash);
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 35%, transparent);
  }

  .action-button.active :global(.action-icon:not(.icon-color) svg) {
    fill: var(--brand);
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
    fill: var(--control-track-hover);
  }

  /* Spin the loading icon while AI generation is running.
     aiSpin keyframe lives in app.css since it's shared with AiImagePrompt. */
  .action-button.loading :global(.action-icon) {
    animation: aiSpin 1s linear infinite;
  }

  /* Stroke width: trigger button wrapper + flyout menu. Visibility is gated by
     the [data-off-stroke] rule above (the Parent Center toggle). */
  .stroke-width-wrapper {
    position: relative;
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
    background: var(--float-surface);
    border: none;
    border-radius: 16px;
    box-shadow: var(--float-shadow-flyout);
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

  /* Eraser mode renders the hole previews at the eraser's true pixel sizes:
     the button padding drops and the icon viewport is pinned at 56px (the
     unscaled 60px button minus its 2px borders), so the icons' 56-unit
     viewBox maps 1:1 to CSS px — the level-5 hole is exactly the 44px the
     eraser actually wipes. Pinning (not 100%) keeps that mapping when the
     touch target shrinks or grows — the portrait 55px buttons and the Parent
     Center's --action-btn-scale (70–130%) must never rescale the holes. The
     SVG is transparent outside the hole, so on the smallest buttons the
     level-5 hole pokes a couple px past the button edge — honestly. */
  .stroke-width-menu.eraser-mode .stroke-size-button {
    padding: 0;
  }

  .stroke-width-menu.eraser-mode .stroke-size-button :global(.action-icon) {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  .stroke-size-button {
    width: calc(60px * var(--action-btn-scale, 1));
    height: calc(60px * var(--action-btn-scale, 1));
    background: var(--float-surface);
    border: 2px solid var(--float-border);
    border-radius: 14px;
    cursor: pointer;
    /* Inherit the menu's color so the line icons (currentColor) pick up the
       active pen/eraser color — buttons don't inherit color by default. */
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(7px * var(--action-btn-scale, 1));
    /* Interaction feedback only — the width/height track --action-btn-scale and
       must snap when the parent drags the Button Size slider (issue #317). */
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .stroke-size-button:hover {
      border-color: var(--brand);
      background: var(--brand-wash);
    }
  }

  .stroke-size-button:active {
    transform: scale(0.92);
  }

  .stroke-size-button.active {
    border-color: var(--brand);
    background: var(--brand-wash);
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 35%, transparent);
  }

  /* The selected size reads from the button's purple ring/fill; its line keeps
     the current color (currentColor), so only tint non-color icons here. */
  .stroke-size-button.active :global(.action-icon:not(.icon-color) svg) {
    fill: var(--brand);
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

  /* The dark-mode mirror: ring near-black ink with a light keyline so it reads
     on the dark cards. Same paint-order trick; the keyline token is transparent
     in light mode, so this rule is inert there. */
  .action-button.dark-stroke :global(svg path[fill='currentColor']),
  .stroke-width-menu.dark-stroke :global(svg path) {
    stroke: var(--dark-ink-keyline);
    stroke-width: 2px;
    paint-order: stroke;
    vector-effect: non-scaling-stroke;
  }
</style>
