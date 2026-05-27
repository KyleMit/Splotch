// Actions panel UI management

let actionsPanel;
let undoButton;
let screenshotButton;
let strokeWidthWrapper;
let strokeWidthButton;
let strokeWidthMenu;
let onUndoClick = null;
let onScreenshotClick = null;
let onStrokeSizeClick = null;

// Initialize actions panel
export function initActionsPanel(options = {}) {
  const {
    onUndo = () => {},
    onScreenshot = () => {},
    onStrokeSize = () => {},
    initialCanUndo = false,
    initialCanScreenshot = false,
    initialScreenshotVisible = false,
    initialStrokeWidthVisible = false,
    initialStrokeSize = 3
  } = options;

  actionsPanel = document.querySelector('.actions-panel');
  undoButton = document.getElementById('undoButton');
  screenshotButton = document.getElementById('screenshotButton');
  strokeWidthWrapper = document.getElementById('strokeWidthWrapper');
  strokeWidthButton = document.getElementById('strokeWidthButton');
  strokeWidthMenu = document.getElementById('strokeWidthMenu');

  if (!actionsPanel || !undoButton || !screenshotButton) {
    console.error('Actions panel buttons not found');
    return;
  }

  onUndoClick = onUndo;
  onScreenshotClick = onScreenshot;
  onStrokeSizeClick = onStrokeSize;

  // Set initial button states
  updateUndoButton(initialCanUndo);
  updateScreenshotButton(initialCanScreenshot);
  setScreenshotButtonVisible(initialScreenshotVisible);
  setStrokeWidthButtonVisible(initialStrokeWidthVisible);
  updateActiveStrokeSize(initialStrokeSize);

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

  // Handle screenshot button click
  screenshotButton.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!screenshotButton.disabled && onScreenshotClick) {
      onScreenshotClick();
    }
  });

  screenshotButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Stroke width: trigger button toggles the flyout menu
  if (strokeWidthButton && strokeWidthMenu) {
    strokeWidthButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    strokeWidthButton.addEventListener('pointerup', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleStrokeWidthMenu();
    });

    // Size buttons inside the menu
    strokeWidthMenu.querySelectorAll('.stroke-size-button').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const size = parseInt(btn.dataset.size, 10);
        if (onStrokeSizeClick) onStrokeSizeClick(size);
        updateActiveStrokeSize(size);
        closeStrokeWidthMenu();
      });
    });

    // Click outside closes the menu
    document.addEventListener('pointerdown', (e) => {
      if (!strokeWidthMenu.hidden && !strokeWidthWrapper.contains(e.target)) {
        closeStrokeWidthMenu();
      }
    });
  }

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

// Update screenshot button enabled/disabled state
export function updateScreenshotButton(canScreenshot) {
  if (!screenshotButton) return;

  if (canScreenshot) {
    screenshotButton.disabled = false;
    screenshotButton.classList.remove('disabled');
  } else {
    screenshotButton.disabled = true;
    screenshotButton.classList.add('disabled');
  }
}

// Show or hide the screenshot button based on the parent-center setting
export function setScreenshotButtonVisible(visible) {
  if (!screenshotButton) return;
  screenshotButton.hidden = !visible;
}

// Show or hide the stroke-width control based on the parent-center setting
export function setStrokeWidthButtonVisible(visible) {
  if (!strokeWidthWrapper) return;
  strokeWidthWrapper.hidden = !visible;
  if (!visible) closeStrokeWidthMenu();
}

export function updateActiveStrokeSize(size) {
  if (!strokeWidthMenu) return;
  strokeWidthMenu.querySelectorAll('.stroke-size-button').forEach(btn => {
    const isActive = parseInt(btn.dataset.size, 10) === size;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function toggleStrokeWidthMenu() {
  if (!strokeWidthMenu) return;
  if (strokeWidthMenu.hidden) {
    openStrokeWidthMenu();
  } else {
    closeStrokeWidthMenu();
  }
}

function openStrokeWidthMenu() {
  if (!strokeWidthMenu || !strokeWidthButton) return;
  strokeWidthMenu.hidden = false;
  strokeWidthButton.setAttribute('aria-expanded', 'true');
}

function closeStrokeWidthMenu() {
  if (!strokeWidthMenu || !strokeWidthButton) return;
  strokeWidthMenu.hidden = true;
  strokeWidthButton.setAttribute('aria-expanded', 'false');
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
