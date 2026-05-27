// Actions panel UI management

let actionsPanel;
let undoButton;
let onUndoClick = null;

// Initialize actions panel
export function initActionsPanel(options = {}) {
  const {
    onUndo = () => {},
    initialCanUndo = false
  } = options;

  actionsPanel = document.querySelector('.actions-panel');
  undoButton = document.getElementById('undoButton');

  if (!actionsPanel || !undoButton) {
    console.error('Actions panel or undo button not found');
    return;
  }

  onUndoClick = onUndo;

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
