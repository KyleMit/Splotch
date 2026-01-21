// Clear button drag-to-clear functionality

let isDragging = false;
let initialButtonY = 0;
let dragOffsetY = 0;
let clearButton, clearLine, acceptZone, pageTurnOverlay, clearOverlay;
let canvas, ctx;
let onClearStartCallback = null;
let onClearCompleteCallback = null;

function startClearDrag(e) {
  isDragging = true;

  // Notify callback to stop any drawing
  if (onClearStartCallback) {
    onClearStartCallback();
  }

  clearButton.classList.add('dragging');

  // Store initial button position and drag offset
  const rect = clearButton.getBoundingClientRect();
  initialButtonY = rect.top;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  dragOffsetY = clientY - rect.top;

  // Show Clear Preview elements
  clearLine.style.display = 'block';
  acceptZone.style.display = 'block';
  clearOverlay.style.display = 'block';
  clearOverlay.style.height = '0px';

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
  if (newY > initialButtonY) {
    // Use transform instead of top for performance (GPU acceleration)
    clearButton.style.top = `${newY}px`;
    clearButton.style.transition = 'none';

    // Calculate clear position
    // 45 is roughly center of button
    const clearScreenY = newY + 45; 
    
    // Move the visual elements
    // 1. The Clear Line (torn edge)
    clearLine.style.top = `${clearScreenY}px`;
    clearLine.style.visibility = 'visible';
    
    // 2. The Overlay Curtain (covers the canvas efficiently)
    // Instead of manipulating canvas pixels, we just slide this div down
    clearOverlay.style.height = `${Math.max(0, clearScreenY)}px`;
  }

  e.preventDefault();
  e.stopPropagation();
}

function stopClearDrag(e) {
  if (!isDragging) return;

  isDragging = false;
  clearButton.classList.remove('dragging');
  clearButton.classList.remove('delete-ready');

  // Hide UI helpers immediately
  clearLine.style.display = 'none';
  acceptZone.style.display = 'none';

  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85; // Bottom 15%

  // Get the correct initial position (check if portrait or landscape)
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const initialTop = isPortrait ? '100px' : '20px';

  if (clientY >= acceptThreshold) {
    // Clear confirmed
    
    // 1. Actually clear the real canvas now (only once!)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 2. Keep the overlay visible for a moment so it doesn't flicker
    // then fade it out or hide it since the canvas underneath is now white
    clearOverlay.style.display = 'none'; 

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

    // Reset button position
    setTimeout(() => {
      pageTurnOverlay.classList.remove('animating');
      
      clearButton.style.transition = 'none';
      clearButton.style.top = initialTop;
      clearButton.style.transform = 'scale(0.8)';

      setTimeout(() => {
        clearButton.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        clearButton.style.opacity = '1';
        clearButton.style.transform = 'scale(1)';
      }, 50);
    }, 600);

  } else {
    // Cancelled - Animate the curtain back up
    if (clearOverlay) {
        clearOverlay.style.transition = 'height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        clearOverlay.style.height = '0px';
        
        // Hide after animation
        setTimeout(() => {
            clearOverlay.style.transition = 'none';
            clearOverlay.style.display = 'none';
        }, 300);
    }

    // Bounce button back
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
  
  // Create Performance Overlay (The Curtain)
  clearOverlay = document.createElement('div');
  clearOverlay.className = 'clear-overlay';
  document.body.appendChild(clearOverlay);

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
