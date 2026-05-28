<script>
  import { onMount } from 'svelte';
  import { clearCanvas } from '$lib/drawing/engine.js';
  import { releaseAllPointers } from '$lib/drawing/engine.js';
  import { saveDrawingIfEnabled } from '$lib/drawing/saveOnDelete.js';
  import { stopDrawSound } from '$lib/audio/drawingSound.js';

  let containerEl;
  let buttonEl;
  let acceptZoneEl;
  let pageTurnOverlayEl;

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
    tutorialFadeOut = false;
    tutorialVisible = true;
    tutorialDismissTimer = setTimeout(dismissTutorial, 3000);
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

    if (holdTimer) {
      const deltaX = Math.abs(clientX - holdStartX);
      const deltaY = Math.abs(clientY - holdStartY);
      if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="clear-tutorial"
    class:visible={tutorialVisible}
    class:fade-out={tutorialFadeOut}
    id="clearTutorial"
    onpointerdown={(e) => { e.preventDefault(); e.stopPropagation(); dismissTutorial(); }}
  >
    <img src="/icons/arrow-down.svg" alt="Drag away" class="clear-tutorial-arrow" />
    <div class="clear-tutorial-text">drag away to clear</div>
  </div>

  <button
    class="clear-button"
    id="clearButton"
    aria-label="Clear drawing"
    bind:this={buttonEl}
    onpointerdown={startClearDrag}
  >
    <img src="/icons/trash.svg" alt="Clear" class="clear-icon" />
  </button>
</div>

<div class="clear-accept-zone" id="clearAcceptZone" bind:this={acceptZoneEl}></div>
<div class="page-turn-overlay" bind:this={pageTurnOverlayEl}></div>

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

  .clear-button:global(.dragging) .clear-icon {
    margin-right: 0;
  }

  .clear-button:global(.delete-ready) {
    background: linear-gradient(135deg, #ff3838, #d63031);
    transform: scale(1.1);
    box-shadow: 0 6px 40px rgba(255, 56, 56, 0.6);
  }

  .clear-icon {
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

  /* Clear Tutorial - Compact element next to clear button */
  .clear-tutorial {
    position: absolute;
    right: 90px; /* Position to the left of the 70px clear button */
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 24px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: auto; /* Make tutorial clickable */
    opacity: 0;
    visibility: hidden;
    transform: translateX(20px);
    transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
  }

  .clear-tutorial.visible {
    opacity: 1;
    visibility: visible;
    transform: translateX(0);
  }

  .clear-tutorial.fade-out {
    opacity: 0;
    transform: translateX(20px);
  }

  .clear-tutorial-arrow {
    width: 48px;
    height: 48px;
    filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(3347%) hue-rotate(343deg) brightness(99%) contrast(95%);
    animation: arrowBounce 1s ease-in-out infinite;
  }

  .clear-tutorial-text {
    font-size: 16px;
    font-weight: 600;
    color: #ff3838;
    text-align: center;
    white-space: nowrap;
    line-height: 1.3;
  }

  /* Arrow asset points down; the 45° clockwise rotation aims it down-and-left
     toward the canvas, and the bounce nudges along that same diagonal. */
  @keyframes arrowBounce {
    0%, 100% {
      transform: rotate(45deg) translateY(0);
      opacity: 1;
    }
    50% {
      transform: rotate(45deg) translateY(12px);
      opacity: 0.6;
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

    .clear-icon {
      width: 32px;
      height: 32px;
      margin-right: 2px;
    }
  }
</style>
