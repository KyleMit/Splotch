<script lang="ts">
  import { untrack } from 'svelte';
  import { actionPanelEvents } from '$lib/actions/actionPanelEvents';
  import { drawerCascade } from '$lib/actions/drawerCascade';
  import Icon from './Icon.svelte';
  import type { OpenFlyout } from '$lib/glassPanes';
  import ColorControl from './ColorControl.svelte';
  import BrushControl from './BrushControl.svelte';
  import StrokeControl from './StrokeControl.svelte';
  import ScreenshotButton from './ScreenshotButton.svelte';
  import AiImageButton from './AiImageButton.svelte';
  import UndoButton from './UndoButton.svelte';
  import { colorsState, isWhite, isDarkInk } from '$lib/state/colors.svelte';
  import { enabledOptionalBrushes, settingsState, setDrawerOpen } from '$lib/state/settings.svelte';
  import { uiState, coloringBookModal, settingsModal } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { layoutState } from '$lib/state/layout.svelte';
  import { DRAWER_TOGGLE_ID, publishActionPanelState } from '$lib/actionButtonLayout';
  import { isStrokeActive } from '$lib/drawing/engine';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';

  let colorWrapperEl: HTMLDivElement | undefined = $state();
  let colorTriggerEl: HTMLButtonElement | undefined = $state();
  let brushWrapperEl: HTMLDivElement | undefined = $state();
  let strokeWrapperEl: HTMLDivElement | undefined = $state();
  let coloringBtnEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();
  let drawerEl: HTMLDivElement | undefined = $state();
  // Only the focus-restore path reads these, but a bound component prop has to
  // be reactive for the child's write to land.
  let brushTriggerEl: HTMLButtonElement | undefined = $state();
  let strokeTriggerEl: HTMLButtonElement | undefined = $state();
  let drawerMotion = $state(false);
  let drawerOpening = $state(false);
  // Intentionally untracked: this frame only verifies the imperative animation state.
  let drawerMotionProbeFrame: number | undefined;

  // Flyouts share one open-state slot so dismissal and focus restoration
  // always act on the control that owns the open menu.
  let { openFlyout = $bindable(null) }: { openFlyout?: OpenFlyout } = $props();

  // Orientation drives the landscape palette-clearing offset below. Everything
  // else orientation-dependent here (drawer collapse axis, chevron direction)
  // is CSS. The shared layout module owns the listeners.
  const phoneLandscape = $derived(layoutState.phoneLandscape);

  // The drawer expands per its remembered open state; the whole panel, chevron
  // included, is gone instead while no control is left to show (the
  // data-no-actions rule below). Dragging the button-size slider force-opens
  // the drawer (without persisting) so the parent can watch the buttons resize
  // live.
  const drawerExpanded = $derived(settingsState.drawerOpen || uiState.resizingActionButtons);

  function drawerStillMoving() {
    return (
      drawerEl
        ?.getAnimations()
        .some((animation) => animation.pending || animation.playState === 'running') ?? false
    );
  }

  function stopDrawerMotion() {
    if (drawerMotionProbeFrame !== undefined) cancelAnimationFrame(drawerMotionProbeFrame);
    drawerMotionProbeFrame = undefined;
    drawerMotion = false;
  }

  function scheduleDrawerMotionProbe() {
    if (drawerMotionProbeFrame !== undefined) cancelAnimationFrame(drawerMotionProbeFrame);
    drawerMotionProbeFrame = requestAnimationFrame(() => {
      drawerMotionProbeFrame = undefined;
      if (!drawerStillMoving()) drawerMotion = false;
    });
  }

  function startDrawerMotion() {
    drawerMotion = true;
    scheduleDrawerMotionProbe();
  }

  // The button-size slider force-opens the drawer for the drag and lets it fall
  // back when the drag ends. That transition animates on the way in and is
  // cut short on the way out (Settings is still in front of it), and it only
  // exists while the drawer was closed to begin with. An effect rather than a
  // handler because the drag lives in the Settings dialog, not in this panel.
  $effect(() => {
    const resizing = uiState.resizingActionButtons;
    if (untrack(() => settingsState.drawerOpen)) return;
    if (resizing) startDrawerMotion();
    else stopDrawerMotion();
  });

  // The panel's landscape offset past the Color Palette and its buttons' size
  // are stylesheet rules (this component's .actions-panel block and app.css's
  // --action-btn-size formula), parameterised only by custom properties: the
  // palette's declared extents, the size-class step, the Button Size scale, the
  // safe-area seam, 100dvh in portrait, and the live button count that
  // publishActionPanelState publishes below. Nothing here measures the palette
  // or the viewport, so first paint and the hydrated panel agree by
  // construction (ADR-0040; the class of issue 317 and issue 706) and a
  // rotation re-lays the panel out in the browser's own pass.
  const buttonScale = $derived(settingsState.actionButtonScale / 100);

  // app.html seeds <html> for first paint of the prerendered page. Hydration
  // publishes the live copy to this panel so later settings changes invalidate
  // only its subtree. publishActionPanelState applies the live marker last, so
  // CSS switches sources only after every local attribute agrees.
  $effect(() => {
    if (!panelEl) return;
    publishActionPanelState(panelEl, drawerExpanded, buttonScale);
  });

  // A white brush color vanishes against the light icon buttons, so the
  // color-tinted icons (the pen/crayon currentColor parts, the stroke-weight
  // lines) get a black outline while white is active.
  const inkWhite = $derived(isWhite(colorsState.activeColor));

  // The dark-mode mirror: near-black ink vanishes against the dark cards, so it
  // gets a light outline there. The class applies in every theme; the keyline
  // color (--dark-ink-keyline) is transparent in light, so it only ever shows
  // in dark.
  const inkDark = $derived(isDarkInk(colorsState.activeColor));

  function toggleDrawer() {
    const next = !settingsState.drawerOpen;
    drawerOpening = next && !isStrokeActive();
    setDrawerOpen(next);
    startDrawerMotion();
    // Tidy up any open flyout as the controls tuck away. No focus restore: the
    // trigger is on its way to visibility:hidden with the rest of the drawer.
    if (!next) closeFlyout();
  }

  // The drawer has settled once the last of its own transitions ends. Which
  // property carries the collapse is not knowable here — one grid track at full
  // motion, opacity alone under reduced motion — and a toggle that reverses an
  // in-flight open cancels the carrying property outright, leaving only the
  // decorative ones to end. So this asks the element what is still moving rather
  // than naming a property that may not be among them.
  function finishDrawerMotion(event: TransitionEvent) {
    if (event.target === event.currentTarget && !drawerStillMoving()) stopDrawerMotion();
  }

  function openFlyoutWrapper() {
    if (!openFlyout) return undefined;
    return openFlyout === 'color'
      ? colorWrapperEl
      : openFlyout === 'brush'
        ? brushWrapperEl
        : strokeWrapperEl;
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
    const trigger =
      openFlyout === 'color'
        ? colorTriggerEl
        : openFlyout === 'brush'
          ? brushTriggerEl
          : strokeTriggerEl;
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

  function setColorFlyout(open: boolean) {
    if (open) openFlyout = 'color';
    else closeFlyout({ restoreFocus: true });
  }

  $effect(() => {
    if (!phoneLandscape && openFlyout === 'color') closeFlyout({ restoreFocus: true });
  });

  function setStrokeFlyout(open: boolean) {
    if (open) openFlyout = 'stroke';
    else closeFlyout({ restoreFocus: true });
  }

  function setBrushFlyout(open: boolean) {
    if (!open) {
      closeFlyout({ restoreFocus: true });
      return;
    }
    openFlyout = 'brush';
  }

  // Settings can switch the drawer's brushes off while the brush menu is open,
  // from inside a dialog whose keyboard session never sends this panel the
  // outside pointer that closes a flyout. With fewer than two brushes left there
  // is no menu, so the slot it held is released here — an effect because the
  // change is made elsewhere; the slot is this panel's to clear.
  $effect(() => {
    if (openFlyout === 'brush' && enabledOptionalBrushes().length < 2) setBrushFlyout(false);
  });

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    coloringBookModal.show(buttonCenter(coloringBtnEl));
  }
</script>

<!-- scribbleGuard cancels a stylus tap's touch stream so it can't arm iPadOS
     Scribble against the next stroke (ADR-0038); that also suppresses the tap's
     synthesized click, so every button here activates via use:scribbleTap
     (pointerup for pointers; click for keyboard/AT and for a tap the browser
     resolved here that no press consumed — issue 1237) instead of onclick. -->
<div
  class="actions-panel"
  data-open-flyout={openFlyout ?? undefined}
  class:settings-covered={settingsModal.open && !uiState.resizingActionButtons}
  data-drawer-motion={drawerMotion ? '' : undefined}
  bind:this={panelEl}
  use:actionPanelEvents={{
    wrapper: openFlyoutWrapper,
    close: closeFlyout,
    stopMotion: stopDrawerMotion,
  }}
  use:scribbleGuard
>
  <ColorControl
    bind:wrapperEl={colorWrapperEl}
    bind:triggerEl={colorTriggerEl}
    open={openFlyout === 'color'}
    onOpenChange={setColorFlyout}
    onfold={toggleDrawer}
  />
  <!-- Always rendered; the drawer's open/closed state and each control's toggle
       in Settings are driven purely by CSS. app.html's <html> seed owns
       first paint; the panel-local publish effect owns hydrated changes. -->
  <div
    class="actions-drawer"
    use:drawerCascade={drawerOpening}
    bind:this={drawerEl}
    ontransitionend={finishDrawerMotion}
  >
    <div class="actions-drawer-inner">
      <BrushControl
        bind:wrapperEl={brushWrapperEl}
        bind:triggerEl={brushTriggerEl}
        open={openFlyout === 'brush'}
        activeColor={colorsState.activeColor}
        {inkWhite}
        {inkDark}
        onOpenChange={setBrushFlyout}
        onTriggerClick={restoreFlyoutTriggerFocus}
      />

      <StrokeControl
        bind:wrapperEl={strokeWrapperEl}
        bind:triggerEl={strokeTriggerEl}
        open={openFlyout === 'stroke'}
        activeColor={colorsState.activeColor}
        {inkWhite}
        {inkDark}
        onOpenChange={setStrokeFlyout}
        onTriggerClick={restoreFlyoutTriggerFocus}
      />

      <button
        class="action-button"
        id="coloringBookButton"
        style:--i="2"
        aria-label="Coloring books"
        use:scribbleTap={handleColoringBookClick}
        bind:this={coloringBtnEl}
      >
        <Icon name="shapes" class="action-icon" />
      </button>

      <ScreenshotButton />

      <AiImageButton />

      <UndoButton />
    </div>
  </div>

  <button
    class="drawer-toggle corner-button"
    id={DRAWER_TOGGLE_ID}
    aria-label={settingsState.drawerOpen ? 'Collapse controls' : 'Expand controls'}
    aria-expanded={settingsState.drawerOpen}
    use:scribbleTap={toggleDrawer}
  >
    <Icon name="chevron-right" class="drawer-toggle-icon corner-button-icon" />
  </button>
</div>

<style>
  .actions-panel {
    /* One clock for the drawer gesture: track, margin and chevron (the drawer's
       sibling, hence declared here) share it and --ease-drawer. The chevron turns
       only mid-gesture, so a rotation's axis change snaps. */
    --drawer-collapse: var(--duration-base);
    pointer-events: auto;
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
    --cascade: 30ms;
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    /* 4px plus the toggle's own 8px icon padding puts the chevron on the
       row's 12px rhythm. */
    margin-right: 4px;
    /* No opacity: the track's clip is the reveal. Grid-track animation re-lays
       out under this fixed panel on mobile Chromium; measure before lengthening. */
    --drawer-transition:
      grid-template-columns var(--drawer-collapse) var(--ease-drawer),
      grid-template-rows var(--drawer-collapse) var(--ease-drawer),
      margin var(--drawer-collapse) var(--ease-drawer);
  }

  .actions-panel[data-drawer-motion] .actions-drawer {
    transition: var(--drawer-transition);
  }

  /* Reduced motion: the track and chevron snap and only opacity transitions (the
     closed drawer takes opacity 0 only here), so the buttons fade rather than
     blink and finishDrawerMotion still has a transition to end on. */
  :global(:root[data-reduce-motion]) .actions-drawer {
    --drawer-transition: opacity var(--drawer-collapse) ease;
  }

  :global(:root[data-reduce-motion])
    :global(.actions-panel[data-action-panel-live]:not([data-drawer-open]))
    .actions-drawer {
    opacity: 0;
  }

  .actions-panel.settings-covered {
    --duration-base: 0ms;
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
      margin-top: 4px;
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
  :global(html[data-off-coloring]) .actions-panel:not([data-action-panel-live]) #coloringBookButton,
  :global(.actions-panel[data-action-panel-live][data-off-coloring]) #coloringBookButton {
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
       • --drawer-axis-rot — orientation axis, from a media query.
       • --drawer-open-rot — the 0°/180° open/close flip, from the bootstrap or
         panel-local [data-drawer-open] attribute rather than JS markup.
     Composed:
       landscape closed 0 · open 180 (left)
       phone landscape closed −45 (up-right) · open 135 (down-left)
       portrait  closed −90 (up) · open 90 (down) */
  :global(.drawer-toggle-icon) {
    pointer-events: none;
    --drawer-axis-rot: 0deg;
    --drawer-open-rot: 0deg;
    transform: rotate(calc(var(--drawer-axis-rot) + var(--drawer-open-rot)));
  }

  .actions-panel[data-drawer-motion] :global(.drawer-toggle-icon) {
    transition: transform var(--drawer-collapse) var(--ease-drawer);
  }
  :global(:root[data-reduce-motion]) .actions-panel :global(.drawer-toggle-icon) {
    transition: none;
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

  @media (orientation: landscape) and (max-height: 599.98px) {
    :global(.drawer-toggle-icon) {
      --drawer-axis-rot: -45deg;
    }

    .actions-panel {
      pointer-events: none;
    }
  }
</style>
