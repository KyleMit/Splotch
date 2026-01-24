// Actions panel UI management

let actionsPanel;
let undoButton;
let eraserButton;
let onUndoClick = null;
let onEraserToggle = null;

// Initialize actions panel
export function initActionsPanel(options = {}) {
  const {
    onUndo = () => {},
    onEraser = () => {},
    initialCanUndo = false
  } = options;

  actionsPanel = document.querySelector('.actions-panel');
  undoButton = document.getElementById('undoButton');
  eraserButton = document.getElementById('eraserButton');

  if (!actionsPanel || !undoButton || !eraserButton) {
    console.error('Actions panel or buttons not found');
    return;
  }

  onUndoClick = onUndo;
  onEraserToggle = onEraser;

  // Set initial button state
  updateUndoButton(initialCanUndo);

  // Handle undo button click
  undoButton.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!undoButton.disabled && onUndoClick) {
      onUndoClick();
    }
  });

  // Prevent button from interfering with drawing
  undoButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Handle eraser button toggle
  eraserButton.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isActive = eraserButton.classList.contains('active');
    if (onEraserToggle) {
      onEraserToggle(!isActive);
    }
  });

  // Prevent eraser button from interfering with drawing
  eraserButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Update panel position based on color palette layout
  updatePanelPosition();
  window.addEventListener('resize', updatePanelPosition);
  window.addEventListener('orientationchange', updatePanelPosition);
  setTimeout(updatePanelPosition, 100);
}

// Update undo button enabled/disabled state
export function updateUndoButton(canUndo) {
  if (!undoButton) return;

  if (canUndo) {
    undoButton.disabled = false;
    undoButton.classList.remove('disabled');
  } else {
    undoButton.disabled = true;
    undoButton.classList.add('disabled');
  }
}

// Update eraser button active state
export function updateEraserButton(isActive) {
  if (!eraserButton) return;

  if (isActive) {
    eraserButton.classList.add('active');
  } else {
    eraserButton.classList.remove('active');
  }
}

// Update panel position based on orientation and color palette layout
function updatePanelPosition() {
  if (!actionsPanel) return;

  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const colorPalette = document.querySelector('.color-palette');

  if (!colorPalette) return;

  if (isPortrait) {
    // Portrait: position on far left
    actionsPanel.style.left = '8px';
    actionsPanel.style.bottom = '8px';
  } else {
    // Landscape: check if color palette is using 1 or 2 columns
    const paletteRect = colorPalette.getBoundingClientRect();
    const paletteWidth = paletteRect.width;

    // Position panel to the right of the color palette with some spacing
    const leftPosition = paletteWidth + 8;
    actionsPanel.style.left = `${leftPosition}px`;
    actionsPanel.style.bottom = '8px';
  }
}
