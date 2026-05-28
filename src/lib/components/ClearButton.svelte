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
