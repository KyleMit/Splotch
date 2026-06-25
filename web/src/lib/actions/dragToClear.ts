import { releaseAllPointers } from '$lib/drawing/engine';
import { stopDrawSound } from '$lib/audio/drawingSound';
import { impactThreshold } from '$lib/haptics';

// Drag-to-clear gesture constants.
const ACCEPT_RADIUS_FACTOR = 0.4;
const HOLD_DURATION = 500;
const MOVEMENT_THRESHOLD = 50;
const MULTI_CLICK_WINDOW = 1000;
const MULTI_CLICK_THRESHOLD = 3;

export interface DragToClearOptions {
  containerEl: HTMLDivElement;
  acceptZoneEl: HTMLDivElement;
  clearPreviewEl: HTMLDivElement;
  pageTurnOverlayEl: HTMLDivElement;
  // Called when the user drags past the threshold and releases — should clear canvas and save.
  onClear: () => void;
  onTutorialShow: () => void;
  onTutorialDismiss: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function dragToClear(node: HTMLButtonElement, getOptions: () => DragToClearOptions) {
  let isDragging = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let homeButtonCenter = { x: 0, y: 0 };
  let clearReady = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let clickCount = 0;
  let lastClickTime = 0;

  const resetTimers = new Set<ReturnType<typeof setTimeout>>();

  function scheduleReset(fn: () => void, delay: number) {
    const id = setTimeout(() => {
      resetTimers.delete(id);
      fn();
    }, delay);
    resetTimers.add(id);
    return id;
  }

  function getAcceptRadius() {
    return Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
  }

  function onPointerDown(e: PointerEvent) {
    const o = getOptions();
    const now = Date.now();
    if (now - lastClickTime < MULTI_CLICK_WINDOW) {
      clickCount++;
      if (clickCount >= MULTI_CLICK_THRESHOLD) {
        o.onTutorialShow();
        clickCount = 0;
        return;
      }
    } else {
      clickCount = 1;
    }
    lastClickTime = now;

    const clientX = e.clientX;
    const clientY = e.clientY;
    holdStartX = clientX;
    holdStartY = clientY;
    holdTimer = setTimeout(o.onTutorialShow, HOLD_DURATION);

    isDragging = true;
    startPointerX = clientX;
    startPointerY = clientY;
    clearReady = false;
    document.documentElement.style.setProperty('--clear-progress', '0');

    releaseAllPointers();

    const rect = node.getBoundingClientRect();
    homeButtonCenter = {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    };

    o.containerEl.classList.add('dragging-active');
    node.classList.add('dragging');

    const radius = getAcceptRadius();
    o.acceptZoneEl.style.left = `${homeButtonCenter.x - radius}px`;
    o.acceptZoneEl.style.top = `${homeButtonCenter.y - radius}px`;
    o.acceptZoneEl.style.width = `${radius * 2}px`;
    o.acceptZoneEl.style.height = `${radius * 2}px`;
    o.acceptZoneEl.style.display = 'block';
    requestAnimationFrame(() => o.acceptZoneEl.classList.add('visible'));

    o.onDragStart?.();

    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;

    const o = getOptions();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const deltaX = Math.abs(clientX - holdStartX);
    const deltaY = Math.abs(clientY - holdStartY);
    if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      // Once the user is actually dragging, the demo has served its purpose.
      o.onTutorialDismiss();
    }

    const dx = clientX - startPointerX;
    const dy = clientY - startPointerY;
    o.containerEl.style.transform = `translate(${dx}px, ${dy}px)`;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = getAcceptRadius();

    // Continuous 0→1 drag progress drives the radial paper wash that previews
    // the clear (see .clear-preview). Inherited from :root so any element can read it.
    const progress = Math.min(distance / threshold, 1);
    document.documentElement.style.setProperty('--clear-progress', `${progress}`);

    if (distance >= threshold) {
      node.classList.add('delete-ready');
      o.acceptZoneEl.classList.add('threshold-reached');
      o.clearPreviewEl.classList.add('committed');
      // Fire a single tactile "click" the moment we cross the point of no return.
      if (!clearReady) {
        clearReady = true;
        impactThreshold();
      }
    } else {
      node.classList.remove('delete-ready');
      o.acceptZoneEl.classList.remove('threshold-reached');
      o.clearPreviewEl.classList.remove('committed');
      clearReady = false;
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e: PointerEvent) {
    if (!isDragging) return;

    const o = getOptions();

    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    isDragging = false;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const dx = clientX - startPointerX;
    const dy = clientY - startPointerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = getAcceptRadius();

    o.acceptZoneEl.classList.remove('visible');
    o.acceptZoneEl.classList.remove('threshold-reached');
    scheduleReset(() => {
      if (!isDragging) o.acceptZoneEl.style.display = 'none';
    }, 250);

    // Retract the radial wash. On commit the canvas is already blank, so this
    // reveals fresh paper just as the confirmation ripple sweeps over it.
    clearReady = false;
    o.clearPreviewEl.classList.remove('committed');
    document.documentElement.style.setProperty('--clear-progress', '0');

    node.classList.remove('delete-ready');

    if (distance >= threshold) {
      o.onTutorialDismiss();
      o.onClear();

      node.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      node.style.opacity = '0';
      node.style.transform = 'scale(0.8)';

      o.pageTurnOverlayEl.classList.add('animating');

      scheduleReset(() => {
        stopDrawSound();
      }, 300);

      scheduleReset(() => {
        o.pageTurnOverlayEl.classList.remove('animating');

        o.containerEl.style.transform = '';
        node.classList.remove('dragging');
        node.style.transition = 'none';
        node.style.transform = 'scale(0.8)';

        scheduleReset(() => {
          o.containerEl.classList.remove('dragging-active');
          node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          node.style.opacity = '1';
          node.style.transform = '';
        }, 50);
      }, 600);
    } else {
      o.containerEl.classList.remove('dragging-active');
      o.containerEl.style.transform = '';
      node.classList.remove('dragging');
    }

    o.onDragEnd?.();

    e.preventDefault();
    e.stopPropagation();
  }

  node.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);

  return {
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if (holdTimer) clearTimeout(holdTimer);
      for (const id of resetTimers) clearTimeout(id);
      resetTimers.clear();
    }
  };
}
