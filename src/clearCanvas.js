// Clear button drag-to-clear functionality

let isDragging = false;
let savedCanvas = null;
let initialButtonY = 0;
let dragOffsetY = 0;
let clearButton, clearLine, acceptZone, pageTurnOverlay;
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

  // Save current canvas state
  savedCanvas = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Store initial button position and drag offset
  const rect = clearButton.getBoundingClientRect();
  initialButtonY = rect.top;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  dragOffsetY = clientY - rect.top;

  // Show Clear Preview Line and Accept Zone
  clearLine.style.display = 'block';
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
  if (newY > initialButtonY) {
    clearButton.style.top = `${newY}px`;
    clearButton.style.transition = 'none';

    // Get canvas position on screen
    const canvasRect = canvas.getBoundingClientRect();
    const canvasTop = canvasRect.top;

    // Calculate clear height relative to canvas
    const clearScreenY = newY + 45; // 45 is half the button height
    const clearCanvasY = clearScreenY - canvasTop;
    const clearHeight = Math.max(0, clearCanvasY);

    // Preview the clear: clear from top of canvas to button position
    ctx.putImageData(savedCanvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, clearHeight);

    // Position the clear line at the edge of cleared area (in screen coordinates)
    clearLine.style.top = `${clearScreenY}px`;
    clearLine.style.visibility = 'visible';
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
  acceptZone.style.display = 'none';

  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85; // Bottom 15%

  // Get the correct initial position (check if portrait or landscape)
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const initialTop = isPortrait ? '100px' : '20px';

  if (clientY >= acceptThreshold) {
    // Clear confirmed - trigger Page Turn Overlay animation
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

    // Remove animation and reset button after animation completes
    setTimeout(() => {
      pageTurnOverlay.classList.remove('animating');
      clearButton.style.transition = 'none';
      clearButton.style.top = initialTop;
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

  // Create Clear Preview Line indicator with SVG for rough edge
  clearLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  clearLine.setAttribute('class', 'clear-line');
  clearLine.setAttribute('preserveAspectRatio', 'none');
  clearLine.setAttribute('viewBox', '0 0 100 20');

  // Create rough/torn edge path with random variations
  const roughEdgePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  // Generate a torn paper edge with irregular bumps
  // Create a band that follows the crinkled edge for gradient
  const topEdgePoints = [];
  let pathData = 'M 0,0';
  const steps = 50; // Number of points along the edge

  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100;
    // Create irregular edge with varying heights (between 8-12)
    const y = 10 + Math.sin(i * 0.8) * 2 + Math.cos(i * 1.3) * 1.5 + Math.sin(i * 2.1) * 0.8;
    topEdgePoints.push({ x, y });
    pathData += ` L ${x},${y}`;
  }

  // Create bottom edge that follows the same contour, offset down by gradient height
  // Go backwards to complete the shape
  for (let i = steps; i >= 0; i--) {
    const x = topEdgePoints[i].x;
    const y = topEdgePoints[i].y + 10; // Offset down by 10 units for gradient band
    pathData += ` L ${x},${y}`;
  }
  pathData += ' Z';

  roughEdgePath.setAttribute('d', pathData);
  roughEdgePath.setAttribute('fill', 'url(#clearLineGradient)');

  // Create shadow paths that follow the edge contour
  // Create multiple offset paths for a softer, paper-like shadow effect
  const shadowPaths = [];
  for (let offset = 0.3; offset <= 2.0; offset += 0.4) {
    const shadowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let shadowData = 'M 0,' + offset;

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * 100;
      const baseY = 10 + Math.sin(i * 0.8) * 2 + Math.cos(i * 1.3) * 1.5 + Math.sin(i * 2.1) * 0.8;
      const y = baseY + offset;
      shadowData += ` L ${x},${y}`;
    }

    const opacity = 0.15 - (offset * 0.05); // Much lighter, more paper-like
    shadowPath.setAttribute('d', shadowData);
    shadowPath.setAttribute('fill', 'none');
    shadowPath.setAttribute('stroke', `rgba(0, 0, 0, ${opacity})`);
    shadowPath.setAttribute('stroke-width', '1.2');
    shadowPath.setAttribute('filter', 'url(#edgeBlur)');
    shadowPaths.push(shadowPath);
  }

  // Create gradient definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // Gradient
  const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradient.setAttribute('id', 'clearLineGradient');
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '0%');
  gradient.setAttribute('y2', '100%');

  const stops = [
    { offset: '0%', color: 'rgba(0, 0, 0, 0.12)' },
    { offset: '20%', color: 'rgba(0, 0, 0, 0.08)' },
    { offset: '40%', color: 'rgba(0, 0, 0, 0.05)' },
    { offset: '70%', color: 'rgba(0, 0, 0, 0.02)' },
    { offset: '100%', color: 'rgba(0, 0, 0, 0)' }
  ];

  stops.forEach(s => {
    const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', s.offset);
    stop.setAttribute('stop-color', s.color);
    gradient.appendChild(stop);
  });

  // Blur filter for edge shadows
  const blurFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  blurFilter.setAttribute('id', 'edgeBlur');
  blurFilter.setAttribute('x', '-50%');
  blurFilter.setAttribute('y', '-50%');
  blurFilter.setAttribute('width', '200%');
  blurFilter.setAttribute('height', '200%');

  const gaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  gaussianBlur.setAttribute('stdDeviation', '1.2');

  blurFilter.appendChild(gaussianBlur);
  defs.appendChild(gradient);
  defs.appendChild(blurFilter);
  clearLine.appendChild(defs);

  // Add shadow paths first (behind the main shape)
  shadowPaths.forEach(path => clearLine.appendChild(path));

  // Add the main gradient shape on top
  clearLine.appendChild(roughEdgePath);

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
