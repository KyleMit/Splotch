// Clear button drag-to-clear functionality

let isDragging = false;
let savedCanvas = null;
let initialButtonY = 0;
let dragOffsetY = 0;
let clearButton, clearLine, acceptZone, pageTurnOverlay;
let canvas, ctx;
let onClearStartCallback = null;
let onClearCompleteCallback = null;

// Performance optimization: throttle canvas updates with requestAnimationFrame
let pendingCanvasUpdate = false;
let lastDragY = 0;
let lastClearHeight = 0;

function startClearDrag(e) {
  isDragging = true;

  // Notify callback to stop any drawing
  if (onClearStartCallback) {
    onClearStartCallback();
  }

  clearButton.classList.add('dragging');

  // Save current canvas state
  savedCanvas = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Store initial button position and drag offset
  const rect = clearButton.getBoundingClientRect();
  initialButtonY = rect.top;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  dragOffsetY = clientY - rect.top;

  // Show Clear Preview Line and Accept Zone
  clearLine.style.display = 'block';
  // Temporarily disable expensive SVG filter during drag for performance
  clearLine.style.filter = 'none';
  clearLine.classList.add('dragging-simplified');

  acceptZone.style.display = 'block';
  const acceptY = window.innerHeight * 0.85;
  const acceptHeight = window.innerHeight - acceptY;
  acceptZone.style.height = `${acceptHeight}px`;

  e.preventDefault();
  e.stopPropagation();
}

function updateCanvasPreview() {
  if (!isDragging || !savedCanvas) return;

  // Perform the expensive canvas operations
  ctx.putImageData(savedCanvas, 0, 0);
  ctx.clearRect(0, 0, canvas.width, lastClearHeight);

  pendingCanvasUpdate = false;
}

function dragClear(e) {
  if (!isDragging) return;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  const newY = clientY - dragOffsetY;

  // Check if entered Accept Zone
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85;
  const isPastThreshold = clientY >= acceptThreshold;

  // Visual feedback when in Accept Zone (cheap DOM operation)
  if (isPastThreshold) {
    clearButton.classList.add('delete-ready');
  } else {
    clearButton.classList.remove('delete-ready');
  }

  // Only allow dragging downward
  if (newY > initialButtonY) {
    // Update button position immediately (cheap DOM operation)
    clearButton.style.top = `${newY}px`;
    clearButton.style.transition = 'none';

    // Get canvas position on screen
    const canvasRect = canvas.getBoundingClientRect();
    const canvasTop = canvasRect.top;

    // Calculate clear height relative to canvas
    const clearScreenY = newY + 45; // 45 is half the button height
    const clearCanvasY = clearScreenY - canvasTop;
    const clearHeight = Math.max(0, clearCanvasY);

    // Update clear line position immediately (cheap DOM operation)
    clearLine.style.top = `${clearScreenY}px`;
    clearLine.style.visibility = 'visible';

    // Store values for canvas update
    lastDragY = newY;
    lastClearHeight = clearHeight;

    // Throttle expensive canvas operations with requestAnimationFrame
    if (!pendingCanvasUpdate) {
      pendingCanvasUpdate = true;
      requestAnimationFrame(updateCanvasPreview);
    }
  }

  e.preventDefault();
  e.stopPropagation();
}

function stopClearDrag(e) {
  if (!isDragging) return;

  isDragging = false;
  clearButton.classList.remove('dragging');
  clearButton.classList.remove('delete-ready');

  // Hide Clear Preview Line and Accept Zone
  clearLine.style.display = 'none';
  // Re-enable SVG filter
  clearLine.style.filter = 'url(#torn-edge)';
  clearLine.classList.remove('dragging-simplified');

  acceptZone.style.display = 'none';

  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85; // Bottom 15%

  // Get the correct initial position (check if portrait or landscape)
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const initialTop = isPortrait ? '100px' : '20px';

  if (clientY >= acceptThreshold) {
    // Clear confirmed - make button disappear and trigger Page Turn Overlay animation
    clearButton.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    clearButton.style.opacity = '0';
    clearButton.style.transform = 'scale(0.8)';

    pageTurnOverlay.classList.add('animating');

    // Clear canvas halfway through animation
    setTimeout(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      savedCanvas = null;

      // Notify callback
      if (onClearCompleteCallback) {
        onClearCompleteCallback();
      }
    }, 300);

    // Remove animation and make button reappear at top
    setTimeout(() => {
      pageTurnOverlay.classList.remove('animating');

      // Reset position instantly while invisible
      clearButton.style.transition = 'none';
      clearButton.style.top = initialTop;
      clearButton.style.transform = 'scale(0.8)';

      // Fade and scale back in after a brief moment
      setTimeout(() => {
        clearButton.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        clearButton.style.opacity = '1';
        clearButton.style.transform = 'scale(1)';
      }, 50);
    }, 600);
  } else {
    // Restore canvas
    if (savedCanvas) {
      ctx.putImageData(savedCanvas, 0, 0);
      savedCanvas = null;
    }

    // Bounce back with animation
    clearButton.style.transition = 'top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    clearButton.style.top = initialTop;
  }

  e.preventDefault();
  e.stopPropagation();
}

// Initialize clear button functionality
export function initClearButton(canvasElement, contextElement, onClearStart, onClearComplete) {
  canvas = canvasElement;
  ctx = contextElement;
  onClearStartCallback = onClearStart;
  onClearCompleteCallback = onClearComplete;

  // Get clear button reference
  clearButton = document.getElementById('clearButton');

  // Create Clear Preview Line indicator with torn edge effect
  clearLine = document.createElement('div');
  clearLine.className = 'clear-line';
  document.body.appendChild(clearLine);

  // Create Clear Accept Zone indicator
  acceptZone = document.createElement('div');
  acceptZone.className = 'clear-accept-zone';
  document.body.appendChild(acceptZone);

  // Create Page Turn Overlay
  pageTurnOverlay = document.createElement('div');
  pageTurnOverlay.className = 'page-turn-overlay';
  document.body.appendChild(pageTurnOverlay);

  // Add event listeners
  clearButton.addEventListener('pointerdown', startClearDrag);
  document.addEventListener('pointermove', dragClear);
  document.addEventListener('pointerup', stopClearDrag);
  document.addEventListener('pointercancel', stopClearDrag);
}
