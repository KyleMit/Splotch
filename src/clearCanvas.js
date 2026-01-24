// Clear button drag-to-clear functionality
import { clearCanvas as clearDrawingCanvas } from './drawingCanvas.js';

let isDragging = false;
let initialContainerY = 0;
let dragOffsetY = 0;
let clearContainer, clearButton, clearOverlay, acceptZone, pageTurnOverlay, clearTutorial;
let onClearStartCallback = null;
let onClearCompleteCallback = null;
let lastOrientation = null;

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

function getDefaultTop() {
  return isPortrait() ? '90px' : '20px';
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

  // Track initial position for movement detection
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  holdStartX = clientX;
  holdStartY = clientY;

  // Start hold timer
  holdTimer = setTimeout(() => {
    // Show tutorial without interrupting the drag
    showTutorial();
  }, HOLD_DURATION);

  isDragging = true;

  // Notify callback to stop any drawing
  if (onClearStartCallback) {
    onClearStartCallback();
  }

  clearButton.classList.add('dragging');

  // Animate overlay in
  clearOverlay.classList.add('active');

  // After animation, add dragging class to disable transitions
  setTimeout(() => {
    clearOverlay.classList.add('dragging');
  }, 300);

  // Store initial container position and drag offset
  const rect = clearContainer.getBoundingClientRect();
  initialContainerY = rect.top;

  dragOffsetY = clientY - rect.top;

  // Show accept zone
  acceptZone.style.display = 'block';

  const acceptY = window.innerHeight * 0.85;
  const acceptHeight = window.innerHeight - acceptY;
  acceptZone.style.height = `${acceptHeight}px`;

  e.preventDefault();
  e.stopPropagation();
}

function dragClear(e) {
  if (!isDragging) return;

  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);

  // Cancel hold timer if user moves significantly
  if (holdTimer) {
    const deltaX = Math.abs(clientX - holdStartX);
    const deltaY = Math.abs(clientY - holdStartY);
    if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  const newY = clientY - dragOffsetY;

  // Check if entered Accept Zone
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85;
  const isPastThreshold = clientY >= acceptThreshold;

  // Visual feedback when in Accept Zone
  if (isPastThreshold) {
    clearButton.classList.add('delete-ready');
  } else {
    clearButton.classList.remove('delete-ready');
  }

  // Only allow dragging downward
  if (newY > initialContainerY) {
    // Move container (overlay moves automatically)
    clearContainer.style.top = `${newY}px`;
  }

  e.preventDefault();
  e.stopPropagation();
}

function stopClearDrag(e) {
  if (!isDragging) return;

  // Cancel hold timer if still running
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  isDragging = false;
  clearButton.classList.remove('dragging');
  clearButton.classList.remove('delete-ready');
  clearOverlay.classList.remove('dragging');

  // Hide accept zone
  acceptZone.style.display = 'none';

  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85; // Bottom 15%

  // Get the correct initial position (check if portrait or landscape)
  const initialTop = getDefaultTop();

  if (clientY >= acceptThreshold) {
    // Clear confirmed

    // Dismiss tutorial if active (user successfully learned the gesture)
    if (clearTutorial && clearTutorial.classList.contains('visible')) {
      dismissTutorial();
    }

    // 1. Actually clear the canvas (both main and virtual) now (only once!)
    clearDrawingCanvas();

    // Animate overlay down off screen
    clearOverlay.classList.remove('active');
    clearOverlay.classList.add('accepted');

    // Animate button away
    clearButton.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    clearButton.style.opacity = '0';
    clearButton.style.transform = 'scale(0.8)';

    pageTurnOverlay.classList.add('animating');

    // Reset logic
    setTimeout(() => {
      if (onClearCompleteCallback) {
        onClearCompleteCallback();
      }
    }, 300);

    // Reset container position and overlay
    setTimeout(() => {
      pageTurnOverlay.classList.remove('animating');

      clearButton.style.transition = 'none';
      clearContainer.style.top = initialTop;
      clearButton.style.transform = 'scale(0.8)';

      // Reset overlay - disable transition and snap to hidden position
      clearOverlay.classList.add('dragging'); // Disable transition
      clearOverlay.classList.remove('accepted');
      clearOverlay.classList.remove('active');

      setTimeout(() => {
        clearButton.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        clearButton.style.opacity = '1';
        clearButton.style.transform = 'scale(1)';

        // Re-enable transitions for next time
        clearOverlay.classList.remove('dragging');
      }, 50);
    }, 600);

  } else {
    // Cancelled - Bounce container back, animate overlay up off screen
    clearContainer.style.transition = 'top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    clearContainer.style.top = initialTop;

    // Animate overlay back up off screen
    clearOverlay.classList.remove('active');

    setTimeout(() => {
      clearContainer.style.transition = '';
    }, 300);
  }

  e.preventDefault();
  e.stopPropagation();
}

// Reset container to default position based on current orientation
function resetButtonPosition() {
  if (!clearContainer || isDragging) return;

  // Reset to default position
  clearContainer.style.transition = 'top 0.3s ease';
  clearContainer.style.top = getDefaultTop();

  // Remove transition after animation completes
  setTimeout(() => {
    clearContainer.style.transition = '';
  }, 300);
}

// Initialize clear button functionality
export function initClearButton(onClearStart, onClearComplete) {
  onClearStartCallback = onClearStart;
  onClearCompleteCallback = onClearComplete;

  // Get references to existing elements
  clearContainer = document.getElementById('clearContainer');
  clearButton = document.getElementById('clearButton');
  clearOverlay = document.getElementById('clearOverlay');
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
