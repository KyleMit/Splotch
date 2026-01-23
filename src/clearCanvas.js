// Clear button drag-to-clear functionality

let isDragging = false;
let initialContainerY = 0;
let dragOffsetY = 0;
let clearContainer, clearButton, clearOverlay, acceptZone, pageTurnOverlay;
let canvas, ctx;
let onClearStartCallback = null;
let onClearCompleteCallback = null;
let lastOrientation = null;

// Helper functions
function isPortrait() {
  return window.matchMedia('(orientation: portrait)').matches;
}

function getDefaultTop() {
  return isPortrait() ? '90px' : '20px';
}

function startClearDrag(e) {
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

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
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

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
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

    // 1. Actually clear the real canvas now (only once!)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

      // Reset overlay classes
      clearOverlay.classList.remove('accepted');

      setTimeout(() => {
        clearButton.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        clearButton.style.opacity = '1';
        clearButton.style.transform = 'scale(1)';
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
export function initClearButton(canvasElement, contextElement, onClearStart, onClearComplete) {
  canvas = canvasElement;
  ctx = contextElement;
  onClearStartCallback = onClearStart;
  onClearCompleteCallback = onClearComplete;

  // Get references to existing elements
  clearContainer = document.getElementById('clearContainer');
  clearButton = document.getElementById('clearButton');
  clearOverlay = document.getElementById('clearOverlay');
  acceptZone = document.getElementById('clearAcceptZone');

  // Create Page Turn Overlay (dynamic element)
  pageTurnOverlay = document.createElement('div');
  pageTurnOverlay.className = 'page-turn-overlay';
  document.body.appendChild(pageTurnOverlay);

  // Add event listeners
  clearButton.addEventListener('pointerdown', startClearDrag);
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
