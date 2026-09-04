<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import BrushControl from './BrushControl.svelte';
  import InkOrMagicIcon from './InkOrMagicIcon.svelte';
  import StrokeWidthMenu from './StrokeWidthMenu.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { colors, isWhite, isDarkInk } from '$lib/state/colors.svelte';
  import { settings, setDrawerOpen } from '$lib/state/settings.svelte';
  import { setStrokeSize, activeStrokeSize, type StrokeSize } from '$lib/state/strokeWidth.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import {
    ui,
    coloringBookModal,
    aiPromptModal,
    openAiSettings,
    SCREENSHOT_BUTTON_ID,
  } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { aiResult, restoreAiResult } from '$lib/state/aiGeneration.svelte';
  import {
    freeGenerations,
    createFreeGenerationGrantRefresher,
  } from '$lib/state/freeGenerations.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { browser } from '$app/environment';
  import { layout } from '$lib/state/layout.svelte';
  import { safeAreaLength } from '$lib/platform/safeArea';
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
  import { prepareCanvasExport, undo } from '$lib/drawing/engine';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import { replayActionUnavailableFeedback } from '$lib/actionUnavailableFeedback';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';
  import { storeCaptureMode } from '$lib/storeCapture';

  // Intentionally untracked: the store-asset generator sets the flag before the
  // app boots and nothing changes it afterward.
  const storeCapture = storeCaptureMode();

  let brushWrapperEl: HTMLDivElement | undefined = $state();
  let strokeWrapperEl: HTMLDivElement | undefined = $state();
  let coloringBtnEl: HTMLButtonElement | undefined = $state();
  let aiBtnEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();
  let drawerEl: HTMLDivElement | undefined = $state();
  // Only the focus-restore path reads this, but a bound component prop has to be
  // reactive for the child's write to land.
  let brushTriggerEl: HTMLButtonElement | undefined = $state();
  // Intentionally untracked: these refs are read only by imperative tap, focus,
  // and animation handlers.
  let undoBtnEl: HTMLButtonElement | undefined;
  let strokeTriggerEl: HTMLButtonElement | undefined;
  let drawerMotion = $state(false);
  // Intentionally untracked: only the reactive drawer-expanded value should rerun this comparison.
  let lastDrawerExpanded: boolean | undefined;
  // Intentionally untracked: this frame only verifies the imperative animation state.
  let drawerMotionProbeFrame: number | undefined;
  // Intentionally untracked: this only memoizes the save-time chunk after the first screenshot press.
  let screenshotModulePromise: Promise<typeof import('$lib/drawing/screenshot')> | null = null;
  const refreshFreeGenerationGrant = createFreeGenerationGrantRefresher();

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
  // palette right by var(--safe-area-left) (the Android landscape hole-punch),
  // and the measured width doesn't include that padding — so we clear inset + width.
  const landscapePaletteWidth = $derived(resolvedLandscapePaletteWidth());
  const portraitPaletteHeight = $derived(resolvedPortraitPaletteHeight());
  const leftOffset = $derived(
    !browser || isPortrait
      ? undefined
      : `calc(${landscapePaletteWidth + PANEL_INSET}px + ${safeAreaLength('left')})`
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
  const layoutButtonCount = $derived(Math.max(1, buttonCount));
  const aiImageButtonVisible = $derived(isAiImageButtonVisible());

  // A minimized run is the one state where a generation is in flight and this
  // button is still live: it is what reveals the run again, so it must not be
  // disabled by the same flag that stops a second one being started. An empty
  // canvas cannot block it either — the drawing was already sent.
  const aiImageButtonBlocked = $derived(
    aiResult.minimized ? false : canvasState.canvasEmpty || aiResult.generating
  );

  const buttonSize = $derived(
    !browser
      ? undefined
      : buttonSizeCssExpr(
          isPortrait
            ? {
                orientation: 'portrait',
                buttonCount: layoutButtonCount,
                paletteHeight: portraitPaletteHeight,
                viewportHeight: layout.viewportHeight,
              }
            : {
                orientation: 'landscape',
                buttonCount: layoutButtonCount,
                paletteWidth: landscapePaletteWidth,
              }
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

  function stopDrawerMotion() {
    if (drawerMotionProbeFrame !== undefined) cancelAnimationFrame(drawerMotionProbeFrame);
    drawerMotionProbeFrame = undefined;
    drawerMotion = false;
  }

  function scheduleDrawerMotionProbe() {
    if (drawerMotionProbeFrame !== undefined) cancelAnimationFrame(drawerMotionProbeFrame);
    drawerMotionProbeFrame = requestAnimationFrame(() => {
      drawerMotionProbeFrame = undefined;
      const hasActiveTransition = drawerEl
        ?.getAnimations()
        .some((animation) => animation.pending || animation.playState === 'running');
      if (!hasActiveTransition) drawerMotion = false;
    });
  }

  $effect(() => {
    const expanded = drawerExpanded;
    if (lastDrawerExpanded === undefined) {
      lastDrawerExpanded = expanded;
      return;
    }
    if (lastDrawerExpanded === expanded) return;
    lastDrawerExpanded = expanded;
    drawerMotion = true;
    scheduleDrawerMotionProbe();
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

  $effect(() => {
    refreshFreeGenerationGrant();
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
    // Tidy up any open flyout as the controls tuck away. No focus restore: the
    // trigger is on its way to visibility:hidden with the rest of the drawer.
    if (!next) closeFlyout();
  }

  function finishDrawerMotion(event: TransitionEvent) {
    // One grid track owns the collapse in each orientation; unlike the decorative
    // gap margins, that transition cannot disappear without replacing the drawer.
    if (event.target === event.currentTarget && event.propertyName.startsWith('grid-template-'))
      stopDrawerMotion();
  }

  function openFlyoutWrapper() {
    if (!openFlyout) return undefined;
    return openFlyout === 'brush' ? brushWrapperEl : strokeWrapperEl;
  }

  // Every close path runs through here so they can't drift apart. restoreFocus
  // covers the two that close while the keyboard is inside the menu — Escape and
  // picking an option — where the focused option is about to be display:none and
  // focus would land on <body>; the trigger is where a keyboard user expects to
  // resume. It stays inert for a close driven from outside the flyout (an outside
  // tap, the drawer collapsing), and where a mouse click did focus an option,
  // moving focus to the trigger paints no ring — :focus-visible doesn't match
  // pointer focus. Browser-managed dismissal and focus restoration are what
  // popover="auto" would own for free — docs/COMPATIBILITY.md's Popover API row
  // records why the flyouts still coordinate both themselves.
  function closeFlyout({ restoreFocus = false } = {}) {
    const wrapper = openFlyoutWrapper();
    const trigger = openFlyout === 'brush' ? brushTriggerEl : strokeTriggerEl;
    const holdsFocus = restoreFocus && !!wrapper?.contains(document.activeElement);
    openFlyout = null;
    if (holdsFocus) trigger?.focus();
  }

  // Mobile Safari can blur the trigger between a trusted pointerup and its
  // trailing click. scribbleTap consumes that click for activation (the press
  // already activated), but the pointer's final focus state still belongs on
  // the trigger.
  function restoreFlyoutTriggerFocus(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (event.detail === 0) return;
    event.currentTarget.focus();
  }

  onMount(() => {
    // Click outside closes the open flyout
    const onDocPointerDown = (e: PointerEvent) => {
      const wrapper = openFlyoutWrapper();
      if (wrapper && !wrapper.contains(e.target as Node)) closeFlyout();
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !openFlyout) return;
      closeFlyout({ restoreFocus: true });
    };
    // The shared layout orientation settles after resize; this marker must clear
    // first so the CSS breakpoint cannot animate a stale drawer transition.
    const screenOrientation = window.screen?.orientation;
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    window.addEventListener('orientationchange', stopDrawerMotion);
    if (typeof screenOrientation?.addEventListener === 'function')
      screenOrientation.addEventListener('change', stopDrawerMotion);

    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
      window.removeEventListener('orientationchange', stopDrawerMotion);
      if (typeof screenOrientation?.removeEventListener === 'function')
        screenOrientation.removeEventListener('change', stopDrawerMotion);
      if (drawerMotionProbeFrame !== undefined) cancelAnimationFrame(drawerMotionProbeFrame);
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
  // save-time-only, so it loads at press time and stays out of the startup
  // bundle (issue #461). The catch keeps a dead-connection chunk load from
  // throwing unhandled — the tap just does nothing, like the other silent
  // save degradations (see screenshot.ts).
  function loadScreenshotModule() {
    if (screenshotModulePromise) return screenshotModulePromise;
    const loading = import('$lib/drawing/screenshot').catch((error) => {
      if (screenshotModulePromise === loading) screenshotModulePromise = null;
      throw error;
    });
    screenshotModulePromise = loading;
    return loading;
  }

  function prepareScreenshotPress() {
    if (canvasState.canvasEmpty) return;
    void loadScreenshotModule()
      .then(({ prepareScreenshot }) => prepareScreenshot(prepareCanvasExport))
      .catch(() => undefined);
  }

  function cancelScreenshotPress() {
    if (!screenshotModulePromise) return;
    void loadScreenshotModule()
      .then(({ cancelScreenshotPreparation }) => cancelScreenshotPreparation())
      .catch(() => undefined);
  }

  async function handleScreenshotClick() {
    if (canvasState.canvasEmpty) return;
    try {
      const { saveScreenshot } = await loadScreenshotModule();
      await saveScreenshot();
    } catch (err) {
      console.error('Screenshot save failed:', err);
    }
  }

  const screenshotTap = {
    activate: handleScreenshotClick,
    onPressStart: prepareScreenshotPress,
    onPressCancel: cancelScreenshotPress,
  };

  function handleStrokeBtnClick() {
    if (openFlyout === 'stroke') {
      closeFlyout({ restoreFocus: true });
      return;
    }
    openFlyout = 'stroke';
  }

  function setBrushFlyout(open: boolean) {
    if (!open) {
      closeFlyout({ restoreFocus: true });
      return;
    }
    openFlyout = 'brush';
  }

  function handleStrokeSizeClick(size: StrokeSize) {
    setStrokeSize(size);
    closeFlyout({ restoreFocus: true });
  }

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    coloringBookModal.show(buttonCenter(coloringBtnEl));
  }

  // The AI flow is a grown-ups area (it sends the drawing off-device), so the
  // tap runs through the parental gate before the prompt opens or a
  // generation starts.
  async function handleAiImageClick() {
    // A run waiting in the corner claims this tap before anything else: it is
    // the same button that started it, and ADR-0116 promises it reveals the one
    // already running. No gate — the gate was passed to start this very run, and
    // asking again to look at it would be a second toll on one action.
    if (aiResult.minimized) {
      restoreAiResult();
      return;
    }
    if (aiResult.generating || canvasState.canvasEmpty || !aiBtnEl) return;

    const origin = buttonCenter(aiBtnEl);
    requireParentalGate(
      'aiImage',
      () => {
        if (
          !settings.aiUserApiKey &&
          !settings.aiAccessToken &&
          (!freeGenerations.available || freeGenerations.remaining === 0)
        ) {
          openAiSettings(origin);
          return;
        }
        if (settings.aiCustomizationEnabled) {
          aiPromptModal.show(origin);
          return;
        }

        generateAiImage();
      },
      origin
    );
  }
</script>

<!-- scribbleGuard cancels a stylus tap's touch stream so it can't arm iPadOS
     Scribble against the next stroke (ADR-0038); that also suppresses the tap's
     synthesized click, so every button here activates via use:scribbleTap
     (pointerup for pointers; click for keyboard/AT and for a tap the browser
     resolved here that no press consumed — issue 1237) instead of onclick. -->
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
  <div class="actions-drawer" bind:this={drawerEl} ontransitionend={finishDrawerMotion}>
    <div class="actions-drawer-inner">
      <BrushControl
        bind:wrapperEl={brushWrapperEl}
        bind:triggerEl={brushTriggerEl}
        open={openFlyout === 'brush'}
        activeColor={colors.activeColor}
        {inkWhite}
        {inkDark}
        onOpenChange={setBrushFlyout}
        onTriggerClick={restoreFlyoutTriggerFocus}
      />

      <div class="flyout-wrapper stroke-width-wrapper" bind:this={strokeWrapperEl}>
        <button
          class="action-button"
          class:white-stroke={whiteStroke}
          class:dark-stroke={darkStroke}
          id="strokeWidthButton"
          aria-label="Stroke width"
          aria-expanded={openFlyout === 'stroke'}
          use:scribbleTap={handleStrokeBtnClick}
          onclick={restoreFlyoutTriggerFocus}
          bind:this={strokeTriggerEl}
          style:color={colors.activeColor}
        >
          {#if erasing}
            <Icon name="line-weight-eraser" class="action-icon" />
          {:else}
            <InkOrMagicIcon ink="line-weight-brush" magic="line-weight-magic" class="action-icon" />
          {/if}
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
        use:scribbleTap={screenshotTap}
      >
        <Icon name="camera" class="action-icon" />
      </button>

      <!-- AI button keeps its reactive `hidden`: its visibility also depends on
           runtime credential, grant-availability, and network signals the head
           script can't know pre-paint, so there's no first-paint value to seed. -->
      <button
        class="action-button"
        class:disabled={aiImageButtonBlocked}
        class:loading={aiResult.generating && !aiResult.minimized}
        id="aiImageButton"
        aria-label={aiResult.minimized
          ? aiResult.generating
            ? 'Show the picture being made'
            : aiResult.error
              ? "Show what didn't work"
              : 'Show your finished picture'
          : settings.aiUserApiKey || settings.aiAccessToken
            ? 'Create AI image'
            : freeGenerations.available && freeGenerations.remaining > 0
              ? `Create AI image, ${freeGenerations.remaining} free left`
              : freeGenerations.available
                ? 'Set up AI image'
                : 'Create AI image'}
        aria-busy={aiResult.generating && !aiResult.minimized}
        disabled={aiImageButtonBlocked}
        hidden={!aiImageButtonVisible}
        use:scribbleTap={handleAiImageClick}
        bind:this={aiBtnEl}
      >
        <Icon
          name={aiResult.generating && !aiResult.minimized ? 'loading' : 'wand-stars'}
          class="action-icon"
        />
        {#if !settings.aiUserApiKey && !settings.aiAccessToken && freeGenerations.available && !storeCapture}
          <span class="free-count" aria-hidden="true">{freeGenerations.remaining}</span>
        {/if}
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
    bottom: calc(8px + var(--safe-area-bottom));
    left: calc(var(--palette-landscape-width) + 8px + var(--safe-area-left));
    display: flex;
    flex-direction: row;
    align-items: center;
    z-index: var(--z-panel);
  }

  :global(html[data-no-actions]) .actions-panel:not([data-action-panel-live]),
  :global(.actions-panel[data-action-panel-live][data-no-actions]) {
    display: none;
  }

  .free-count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-pill);
    background: var(--brand-solid);
    color: var(--on-brand);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    line-height: 1;
    box-shadow: var(--shadow-control);
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: calc(8px + var(--safe-area-left));
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

  /* Stroke Width uses a relative trigger wrapper so StrokeWidthMenu can
     position itself absolutely. The [data-off-stroke] rule above gates the
     whole wrapper. */
  .flyout-wrapper {
    position: relative;
  }
</style>
