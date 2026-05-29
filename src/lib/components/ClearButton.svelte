<script>
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { clearCanvas } from '$lib/drawing/engine.js';
  import { releaseAllPointers } from '$lib/drawing/engine.js';
  import { saveDrawingIfEnabled } from '$lib/drawing/saveOnDelete.js';
  import { stopDrawSound } from '$lib/audio/drawingSound.js';

  let containerEl;
  let buttonEl;
  let acceptZoneEl;
  let pageTurnOverlayEl;
  let coachmarkRingEl;
  let coachmarkGhostEl;

  let tutorialVisible = $state(false);
  let tutorialFadeOut = $state(false);

  // Drag state — imperative because it runs at pointer-event rate.
  let isDragging = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let homeButtonCenter = { x: 0, y: 0 };

  const ACCEPT_RADIUS_FACTOR = 0.4;
  const HOLD_DURATION = 500;
  const MOVEMENT_THRESHOLD = 50;
  const MULTI_CLICK_WINDOW = 1000;
  const MULTI_CLICK_THRESHOLD = 3;

  let holdTimer = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let clickCount = 0;
  let lastClickTime = 0;
  let tutorialDismissTimer = null;
  let lastOrientation = null;

  function isPortrait() {
    return window.matchMedia('(orientation: portrait)').matches;
  }

  function getAcceptRadius() {
    return Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
  }

  function showTutorial() {
    if (tutorialVisible) return;
    if (!buttonEl || !coachmarkRingEl || !coachmarkGhostEl) return;

    // Anchor the coachmark to the button's live home position so it survives
    // orientation/layout changes between sessions.
    const rect = buttonEl.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const radius = getAcceptRadius();

    // Faint preview of the real accept-zone ring, centered on the button.
    coachmarkRingEl.style.left = `${cx - radius}px`;
    coachmarkRingEl.style.top = `${cy - radius}px`;
    coachmarkRingEl.style.width = `${radius * 2}px`;
    coachmarkRingEl.style.height = `${radius * 2}px`;

    // Ghost button + hand start on the real button and drag down-left toward
    // the canvas, overshooting the ring edge so it's clear you need to pull
    // past the threshold, not just to it.
    const travel = radius * 1.18;
    coachmarkGhostEl.style.left = `${cx - rect.width / 2}px`;
    coachmarkGhostEl.style.top = `${cy - rect.height / 2}px`;
    coachmarkGhostEl.style.width = `${rect.width}px`;
    coachmarkGhostEl.style.height = `${rect.height}px`;
    coachmarkGhostEl.style.setProperty('--tx', `${-travel * Math.SQRT1_2}px`);
    coachmarkGhostEl.style.setProperty('--ty', `${travel * Math.SQRT1_2}px`);

    // The loop runs free while hidden, so restart it from frame 0 — otherwise
    // it can appear mid-cycle (e.g. already at the finish position).
    for (const el of [coachmarkGhostEl, coachmarkRingEl]) {
      el.style.animation = 'none';
      void el.offsetWidth; // force reflow so the restart takes effect
      el.style.animation = '';
    }

    tutorialFadeOut = false;
    tutorialVisible = true;
    tutorialDismissTimer = setTimeout(dismissTutorial, 6000);
  }

  function dismissTutorial() {
    if (tutorialDismissTimer) {
      clearTimeout(tutorialDismissTimer);
      tutorialDismissTimer = null;
    }
    tutorialVisible = false;
    tutorialFadeOut = true;
  }

  function startClearDrag(e) {
    const now = Date.now();
    if (now - lastClickTime < MULTI_CLICK_WINDOW) {
      clickCount++;
      if (clickCount >= MULTI_CLICK_THRESHOLD) {
        showTutorial();
        clickCount = 0;
        return;
      }
    } else {
      clickCount = 1;
    }
    lastClickTime = now;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    holdStartX = clientX;
    holdStartY = clientY;
    holdTimer = setTimeout(showTutorial, HOLD_DURATION);

    isDragging = true;
    startPointerX = clientX;
    startPointerY = clientY;

    releaseAllPointers();

    const rect = buttonEl.getBoundingClientRect();
    homeButtonCenter = {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    };

    containerEl.classList.add('dragging-active');
    buttonEl.classList.add('dragging');

    const radius = getAcceptRadius();
    acceptZoneEl.style.left = `${homeButtonCenter.x - radius}px`;
    acceptZoneEl.style.top = `${homeButtonCenter.y - radius}px`;
    acceptZoneEl.style.width = `${radius * 2}px`;
    acceptZoneEl.style.height = `${radius * 2}px`;
    acceptZoneEl.style.display = 'block';
    requestAnimationFrame(() => acceptZoneEl.classList.add('visible'));

    e.preventDefault();
    e.stopPropagation();
  }

  function dragClear(e) {
    if (!isDragging) return;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    const deltaX = Math.abs(clientX - holdStartX);
    const deltaY = Math.abs(clientY - holdStartY);
    if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      // Once the user is actually dragging, the demo has served its purpose.
      if (tutorialVisible) dismissTutorial();
    }

    const dx = clientX - startPointerX;
    const dy = clientY - startPointerY;
    containerEl.style.transform = `translate(${dx}px, ${dy}px)`;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = getAcceptRadius();
    if (distance >= threshold) {
      buttonEl.classList.add('delete-ready');
      acceptZoneEl.classList.add('threshold-reached');
    } else {
      buttonEl.classList.remove('delete-ready');
      acceptZoneEl.classList.remove('threshold-reached');
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function stopClearDrag(e) {
    if (!isDragging) return;

    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    isDragging = false;

    const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const clientY = e.clientY ?? e.changedTouches?.[0]?.clientY;
    const dx = clientX - startPointerX;
    const dy = clientY - startPointerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = getAcceptRadius();

    acceptZoneEl.classList.remove('visible');
    acceptZoneEl.classList.remove('threshold-reached');
    setTimeout(() => {
      if (!isDragging) acceptZoneEl.style.display = 'none';
    }, 250);

    buttonEl.classList.remove('delete-ready');

    if (distance >= threshold) {
      if (tutorialVisible) dismissTutorial();

      saveDrawingIfEnabled();
      clearCanvas();

      buttonEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      buttonEl.style.opacity = '0';
      buttonEl.style.transform = 'scale(0.8)';

      pageTurnOverlayEl.classList.add('animating');

      setTimeout(() => {
        stopDrawSound();
      }, 300);

      setTimeout(() => {
        pageTurnOverlayEl.classList.remove('animating');

        containerEl.style.transform = '';
        buttonEl.classList.remove('dragging');
        buttonEl.style.transition = 'none';
        buttonEl.style.transform = 'scale(0.8)';

        setTimeout(() => {
          containerEl.classList.remove('dragging-active');
          buttonEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          buttonEl.style.opacity = '1';
          buttonEl.style.transform = '';
        }, 50);
      }, 600);
    } else {
      containerEl.classList.remove('dragging-active');
      containerEl.style.transform = '';
      buttonEl.classList.remove('dragging');
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function resetButtonPosition() {
    if (tutorialVisible) dismissTutorial(); // geometry would be stale after a layout change
    if (!containerEl || isDragging) return;
    containerEl.style.transform = '';
  }

  function onResize() {
    const currentOrientation = isPortrait();
    if (currentOrientation !== lastOrientation) {
      lastOrientation = currentOrientation;
      resetButtonPosition();
    }
  }

  onMount(() => {
    lastOrientation = isPortrait();
    document.addEventListener('pointermove', dragClear);
    document.addEventListener('pointerup', stopClearDrag);
    document.addEventListener('pointercancel', stopClearDrag);
    window.addEventListener('orientationchange', resetButtonPosition);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointermove', dragClear);
      document.removeEventListener('pointerup', stopClearDrag);
      document.removeEventListener('pointercancel', stopClearDrag);
      window.removeEventListener('orientationchange', resetButtonPosition);
      window.removeEventListener('resize', onResize);
    };
  });
</script>

<div class="clear-container" id="clearContainer" bind:this={containerEl}>
  <button
    class="clear-button"
    id="clearButton"
    aria-label="Clear drawing"
    bind:this={buttonEl}
    onpointerdown={startClearDrag}
  >
    <Icon name="trash" class="clear-icon" aria-hidden="true" />
  </button>
</div>

<div class="clear-accept-zone" id="clearAcceptZone" bind:this={acceptZoneEl}></div>
<div class="page-turn-overlay" bind:this={pageTurnOverlayEl}></div>

<!-- Animated coachmark: a ghost button + hand mimes the drag-to-clear gesture. -->
<div
  class="clear-coachmark"
  class:visible={tutorialVisible}
  class:fade-out={tutorialFadeOut}
  aria-hidden="true"
>
  <div class="coachmark-ring" bind:this={coachmarkRingEl}></div>
  <div class="coachmark-ghost" bind:this={coachmarkGhostEl}>
    <div class="coachmark-button">
      <Icon name="trash" class="coachmark-trash" aria-hidden="true" />
    </div>
    <Icon name="swipe-down" class="coachmark-hand" aria-hidden="true" />
  </div>
</div>

<style>
  .clear-container {
    position: fixed;
    top: 20px;
    right: -10px;
    z-index: 1000;
    pointer-events: none; /* Allow clicks through container to children */
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* While the finger is in control, snap to position with no easing.
     :global() — the .dragging-active class is added imperatively via classList. */
  .clear-container:global(.dragging-active) {
    transition: none;
  }

  .clear-button {
    position: relative;
    width: 70px;
    height: 70px;
    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
    border: none;
    border-radius: 50% 0 0 50%;
    box-shadow: -4px 4px 20px rgba(0, 0, 0, 0.3);
    cursor: grab;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: box-shadow 0.2s ease, border-radius 0.3s ease,
                transform 0.2s ease, background 0.2s ease;
    pointer-events: auto; /* Button is clickable */
  }

  .clear-button:active {
    cursor: grabbing;
  }

  /* Dragging: morph from half-circle pinned shape to a full circle.
     .dragging is added imperatively via classList. */
  .clear-button:global(.dragging) {
    border-radius: 50%;
    box-shadow: -6px 6px 30px rgba(0, 0, 0, 0.4);
  }

  .clear-button:global(.dragging) :global(.clear-icon) {
    margin-right: 0;
  }

  .clear-button:global(.delete-ready) {
    background: linear-gradient(135deg, #ff3838, #d63031);
    transform: scale(1.1);
    box-shadow: 0 6px 40px rgba(255, 56, 56, 0.6);
  }

  :global(.clear-icon) {
    width: 32px;
    height: 32px;
    pointer-events: none;
    margin-right: 2px;
    transition: margin 0.3s ease;
  }

  /* Clear Accept Zone — radial ring around the button's home position
     that highlights where to drag to confirm a clear. */
  .clear-accept-zone {
    position: fixed;
    pointer-events: none;
    display: none;
    z-index: 999; /* Below clear-container (1000) so the button sits on top */
    border-radius: 50%;
    border: 4px dashed rgba(255, 56, 56, 0.45);
    background: radial-gradient(circle,
      rgba(255, 56, 56, 0) 55%,
      rgba(255, 56, 56, 0.06) 100%);
    box-sizing: border-box;
    opacity: 0;
    transform: scale(0.85);
    transition: opacity 0.2s ease,
                transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                border-color 0.15s ease,
                border-style 0.15s ease,
                background 0.15s ease;
  }

  /* .visible / .threshold-reached are toggled imperatively via classList. */
  .clear-accept-zone:global(.visible) {
    opacity: 1;
    transform: scale(1);
  }

  .clear-accept-zone:global(.threshold-reached) {
    border-color: rgba(255, 56, 56, 0.9);
    border-style: solid;
    background: radial-gradient(circle,
      rgba(255, 56, 56, 0) 50%,
      rgba(255, 56, 56, 0.22) 100%);
  }

  /* Clear-confirmation ripple: a single white circle anchored at the
     top-right corner. It expands outward — the wave sweeps across the
     viewport toward the bottom-left — and fades. */
  .page-turn-overlay {
    position: fixed;
    left: 100%;
    top: 0;
    width: 1px;
    height: 1px;
    border-radius: 50%;
    background: white;
    pointer-events: none;
    z-index: 500;
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }

  /* .animating is added imperatively via classList. */
  .page-turn-overlay:global(.animating) {
    animation: ripple 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  @keyframes ripple {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.85;
    }
    100% {
      transform: translate(-50%, -50%) scale(4000);
      opacity: 0;
    }
  }

  /* Animated coachmark — a gentle, looping demo of the drag-to-clear gesture.
     The full-screen container only handles fade in/out; the ring and ghost are
     positioned imperatively in viewport coords (see showTutorial). */
  .clear-coachmark {
    position: fixed;
    inset: 0;
    z-index: 1001; /* Above the real button (1000) so the ghost is always visible */
    pointer-events: none; /* Never blocks the real button underneath */
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.4s ease, visibility 0.4s;
  }

  .clear-coachmark.visible {
    opacity: 1;
    visibility: visible;
  }

  .clear-coachmark.fade-out {
    opacity: 0;
  }

  /* Soft preview of the accept zone — uses the friendlier coral, not the
     alarm-red of the live threshold, so the hint reads as an invitation. */
  .coachmark-ring {
    position: fixed;
    box-sizing: border-box;
    border-radius: 50%;
    border: 4px dashed rgba(255, 107, 107, 0.4);
    background: radial-gradient(circle,
      rgba(255, 107, 107, 0) 60%,
      rgba(255, 107, 107, 0.05) 100%);
    animation: coachmarkRing 2.8s ease-in-out infinite;
  }

  .coachmark-ghost {
    position: fixed;
    animation: coachmarkDrag 2.8s ease-in-out infinite;
    will-change: transform, opacity;
  }

  .coachmark-button {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
    box-shadow: -6px 6px 24px rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.coachmark-trash) {
    width: 32px;
    height: 32px;
  }

  /* Hand rests on the lower-right of the ghost button, like a fingertip. */
  :global(.coachmark-hand) {
    position: absolute;
    left: 58%;
    top: 52%;
    width: 52px;
    height: 52px;
    filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.3));
  }

  /* Ghost peels off the real button, drags to the ring edge, gives a little
     release pop, then fades. The flat tail (90–100%) is the pause between loops. */
  @keyframes coachmarkDrag {
    0%   { transform: translate(0, 0) scale(1);    opacity: 0; }
    8%   { transform: translate(0, 0) scale(1);    opacity: 1; }
    16%  { transform: translate(0, 0) scale(0.94); opacity: 1; }
    58%  { transform: translate(var(--tx), var(--ty)) scale(0.94); opacity: 1; }
    70%  { transform: translate(var(--tx), var(--ty)) scale(0.94); opacity: 1; }
    80%  { transform: translate(var(--tx), var(--ty)) scale(1.05); opacity: 1; }
    90%  { transform: translate(var(--tx), var(--ty)) scale(1.08); opacity: 0; }
    100% { transform: translate(var(--tx), var(--ty)) scale(1);    opacity: 0; }
  }

  /* Ring fades in, then snaps to a confirmed "ready" state as the ghost lands. */
  @keyframes coachmarkRing {
    0%, 8% {
      opacity: 0;
      transform: scale(0.9);
      border-color: rgba(255, 107, 107, 0.4);
      border-style: dashed;
    }
    18% {
      opacity: 1;
      transform: scale(1);
    }
    57% {
      opacity: 1;
      transform: scale(1);
      border-color: rgba(255, 107, 107, 0.4);
      border-style: dashed;
      background: radial-gradient(circle,
        rgba(255, 107, 107, 0) 60%,
        rgba(255, 107, 107, 0.05) 100%);
    }
    70%, 86% {
      opacity: 1;
      transform: scale(1.015);
      border-color: rgba(238, 90, 111, 0.85);
      border-style: solid;
      background: radial-gradient(circle,
        rgba(238, 90, 111, 0) 50%,
        rgba(238, 90, 111, 0.18) 100%);
    }
    94%, 100% {
      opacity: 0;
    }
  }

  /* Respect reduced-motion: drop the loop, show a single static "here's the
     gesture" frame instead. */
  @media (prefers-reduced-motion: reduce) {
    .coachmark-ghost {
      animation: none;
      transform: translate(var(--tx), var(--ty));
      opacity: 0.95;
    }
    .coachmark-ring {
      animation: none;
      opacity: 1;
      border-color: rgba(238, 90, 111, 0.85);
      border-style: solid;
      background: radial-gradient(circle,
        rgba(238, 90, 111, 0) 50%,
        rgba(238, 90, 111, 0.18) 100%);
    }
  }

  @media (orientation: portrait) {
    .clear-container {
      top: 90px;
    }

    .clear-button {
      width: 60px;
      height: 60px;
    }

    :global(.clear-icon) {
      width: 32px;
      height: 32px;
      margin-right: 2px;
    }
  }
</style>
