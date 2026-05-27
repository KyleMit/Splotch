// Clear button drag-to-clear functionality
import { clearCanvas as clearDrawingCanvas } from './drawingCanvas.js';
import { saveDrawingIfEnabled } from './saveOnDelete.js';

let isDragging = false;
let startPointerX = 0;
let startPointerY = 0;
let homeButtonCenter = { x: 0, y: 0 };
let clearContainer, clearButton, acceptZone, pageTurnOverlay, clearTutorial;
let onClearStartCallback = null;
let onClearCompleteCallback = null;
let lastOrientation = null;

// Radial clear: confirm when finger moves at least this fraction of the
// smaller viewport dimension from the button's start position, in any
// direction.
const ACCEPT_RADIUS_FACTOR = 0.4;

// Tutorial tracking
let holdTimer = null;
let holdStartX = 0;
let holdStartY = 0;
let clickCount = 0;
let lastClickTime = 0;
const HOLD_DURATION = 500; // 0.5 seconds
const MOVEMENT_THRESHOLD = 50; // pixels
const MULTI_CLICK_WINDOW = 1000; // 1 second for multiple clicks
const MULTI_CLICK_THRESHOLD = 3; // number of clicks to trigger tutorial
let tutorialDismissTimer = null;

// Helper functions
function isPortrait() {
  return window.matchMedia('(orientation: portrait)').matches;
}

function getAcceptRadius() {
  return Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
}

// Show tutorial
function showTutorial() {
  if (!clearTutorial) return;

  // Don't interrupt if tutorial is already visible
  if (clearTutorial.classList.contains('visible')) return;

  // Show tutorial by adding visible class
  clearTutorial.classList.remove('fade-out');
  clearTutorial.classList.add('visible');

  // Auto-dismiss after animations complete (2 cycles × 1s each + 1s delay)
  tutorialDismissTimer = setTimeout(dismissTutorial, 3000);
}

// Dismiss tutorial
function dismissTutorial() {
  if (!clearTutorial) return;

  // Clear auto-dismiss timer if it's still pending
  if (tutorialDismissTimer) {
    clearTimeout(tutorialDismissTimer);
    tutorialDismissTimer = null;
  }

  // Hide tutorial by removing visible class and adding fade-out
  clearTutorial.classList.remove('visible');
  clearTutorial.classList.add('fade-out');
}

function startClearDrag(e) {
  // Track for multiple clicks
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

  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  holdStartX = clientX;
  holdStartY = clientY;

  holdTimer = setTimeout(() => {
    showTutorial();
  }, HOLD_DURATION);

  isDragging = true;
  startPointerX = clientX;
  startPointerY = clientY;

  // Notify callback to stop any drawing
  if (onClearStartCallback) {
    onClearStartCallback();
  }

  // Capture button's home center for placing the radial accept zone.
  // No transform is applied yet, so getBoundingClientRect gives the home rect.
  const rect = clearButton.getBoundingClientRect();
  homeButtonCenter = {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2
  };

  // Drop the back-to-home transition while the finger is in control.
  clearContainer.classList.add('dragging-active');
  // Morph button from half-circle to full circle.
  clearButton.classList.add('dragging');

  // Lay out the radial accept zone as a circle centered on the button.
  const radius = getAcceptRadius();
  acceptZone.style.left = `${homeButtonCenter.x - radius}px`;
  acceptZone.style.top = `${homeButtonCenter.y - radius}px`;
  acceptZone.style.width = `${radius * 2}px`;
  acceptZone.style.height = `${radius * 2}px`;
  acceptZone.style.display = 'block';
  // Next frame so the transition runs from the hidden state.
  requestAnimationFrame(() => acceptZone.classList.add('visible'));

  e.preventDefault();
  e.stopPropagation();
}

function dragClear(e) {
  if (!isDragging) return;

  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);

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

  clearContainer.style.transform = `translate(${dx}px, ${dy}px)`;

  const distance = Math.sqrt(dx * dx + dy * dy);
  const threshold = getAcceptRadius();
  if (distance >= threshold) {
    clearButton.classList.add('delete-ready');
    acceptZone.classList.add('threshold-reached');
  } else {
    clearButton.classList.remove('delete-ready');
    acceptZone.classList.remove('threshold-reached');
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

  const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const dx = clientX - startPointerX;
  const dy = clientY - startPointerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const threshold = getAcceptRadius();

  // Hide the accept ring (transition out, then unmount).
  acceptZone.classList.remove('visible');
  acceptZone.classList.remove('threshold-reached');
  setTimeout(() => {
    if (!isDragging) acceptZone.style.display = 'none';
  }, 250);

  clearButton.classList.remove('delete-ready');

  if (distance >= threshold) {
    // Clear confirmed
    if (clearTutorial && clearTutorial.classList.contains('visible')) {
      dismissTutorial();
    }

    saveDrawingIfEnabled();
    clearDrawingCanvas();

    // Fade the button out as the ripple expands.
    clearButton.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    clearButton.style.opacity = '0';
    clearButton.style.transform = 'scale(0.8)';

    pageTurnOverlay.classList.add('animating');

    setTimeout(() => {
      if (onClearCompleteCallback) {
        onClearCompleteCallback();
      }
    }, 300);

    // Once the page-turn covers the screen, snap the button back to its
    // pinned home, restore the half-circle, then fade it in.
    setTimeout(() => {
      pageTurnOverlay.classList.remove('animating');

      clearContainer.style.transform = '';
      clearButton.classList.remove('dragging');
      clearButton.style.transition = 'none';
      clearButton.style.transform = 'scale(0.8)';

      setTimeout(() => {
        clearContainer.classList.remove('dragging-active');
        clearButton.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        clearButton.style.opacity = '1';
        clearButton.style.transform = '';
      }, 50);
    }, 600);

  } else {
    // Cancelled — restore the smooth transition so the button glides back
    // to its pinned home and morphs back to the half-circle.
    clearContainer.classList.remove('dragging-active');
    clearContainer.style.transform = '';
    clearButton.classList.remove('dragging');
  }

  e.preventDefault();
  e.stopPropagation();
}

// Snap the container back to its CSS-anchored home on orientation change
// (the top offset is now driven by the media-query rule).
function resetButtonPosition() {
  if (!clearContainer || isDragging) return;
  clearContainer.style.transform = '';
}

// Initialize clear button functionality
export function initClearButton(onClearStart, onClearComplete) {
  onClearStartCallback = onClearStart;
  onClearCompleteCallback = onClearComplete;

  // Get references to existing elements
  clearContainer = document.getElementById('clearContainer');
  clearButton = document.getElementById('clearButton');
  acceptZone = document.getElementById('clearAcceptZone');
  clearTutorial = document.getElementById('clearTutorial');

  // Create Page Turn Overlay (dynamic element)
  pageTurnOverlay = document.createElement('div');
  pageTurnOverlay.className = 'page-turn-overlay';
  document.body.appendChild(pageTurnOverlay);

  // Add event listeners
  clearButton.addEventListener('pointerdown', startClearDrag);

  // Tutorial click to dismiss
  if (clearTutorial) {
    clearTutorial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissTutorial();
    });
  }
  document.addEventListener('pointermove', dragClear);
  document.addEventListener('pointerup', stopClearDrag);
  document.addEventListener('pointercancel', stopClearDrag);

  // Initialize orientation tracking
  lastOrientation = isPortrait();

  // Listen for orientation changes and reset button position
  window.addEventListener('orientationchange', resetButtonPosition);
  window.addEventListener('resize', () => {
    // Also handle resize events (some browsers fire resize instead of orientationchange)
    const currentOrientation = isPortrait();
    // Only reset if orientation actually changed
    if (currentOrientation !== lastOrientation) {
      lastOrientation = currentOrientation;
      resetButtonPosition();
    }
  });
}
