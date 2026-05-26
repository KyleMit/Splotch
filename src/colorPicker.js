// Color picker state
let dialog;
let picker;
let customColor = '#AB71E1'; // Default purple
let customColorSelected = false;
let currentHoveredHex = null;
let currentSelectedHex = null;
let isTrackingHexDrag = false;
let onColorSelectedCallback = null;

function getHexColor(hex) {
  return hex.style.getPropertyValue('--color').trim();
}

function clearHover() {
  if (currentHoveredHex) {
    currentHoveredHex.classList.remove('hover');
    currentHoveredHex = null;
  }
}

function clearSelected() {
  if (currentSelectedHex) {
    currentSelectedHex.classList.remove('selected');
    currentSelectedHex = null;
  }
}

function openColorPicker() {
  if (!dialog || dialog.open) return;
  dialog.showModal();

  // Highlight the currently selected color, if it matches a hexagon
  if (customColor) {
    const target = customColor.toLowerCase();
    const hexagons = picker.querySelectorAll('.hexagon');
    for (const hex of hexagons) {
      if (getHexColor(hex).toLowerCase() === target) {
        currentSelectedHex = hex;
        hex.classList.add('selected');
        break;
      }
    }
  }
}

function closeColorPicker(selectedColor = null) {
  if (!dialog) return;
  if (dialog.open) dialog.close();

  clearHover();
  clearSelected();
  isTrackingHexDrag = false;

  if (selectedColor) {
    customColor = selectedColor;
    customColorSelected = true;
    if (onColorSelectedCallback) {
      onColorSelectedCallback(selectedColor);
    }
  }
}

function updateGradientSwatchRing() {
  const gradientSwatch = document.querySelector('.gradient-swatch');
  if (gradientSwatch && gradientSwatch.classList.contains('active')) {
    gradientSwatch.style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${customColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
  }
}

function getCustomColor() {
  return customColor;
}

function hasCustomColorSelected() {
  return customColorSelected;
}

function isPointInsideDialog(dialog, x, y) {
  const rect = dialog.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function initColorPicker(onColorSelected) {
  onColorSelectedCallback = onColorSelected;

  dialog = document.getElementById('color-picker');
  picker = dialog.querySelector('.picker');

  picker.addEventListener('pointerdown', (e) => {
    const hex = e.target.closest('.hexagon');
    if (!hex) return;

    isTrackingHexDrag = true;
    clearHover();
    currentHoveredHex = hex;
    hex.classList.add('hover');

    e.preventDefault();
    e.stopPropagation();
  });

  picker.addEventListener('pointermove', (e) => {
    if (!isTrackingHexDrag) return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    const hex = element && element.closest ? element.closest('.hexagon') : null;

    if (hex && picker.contains(hex) && hex !== currentHoveredHex) {
      clearHover();
      currentHoveredHex = hex;
      hex.classList.add('hover');
    } else if (!hex) {
      clearHover();
    }

    e.preventDefault();
    e.stopPropagation();
  });

  picker.addEventListener('pointerup', (e) => {
    if (!isTrackingHexDrag) return;
    isTrackingHexDrag = false;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    const hex = element && element.closest ? element.closest('.hexagon') : null;

    if (hex && picker.contains(hex)) {
      closeColorPicker(getHexColor(hex));
    } else {
      clearHover();
    }

    e.preventDefault();
    e.stopPropagation();
  });

  picker.addEventListener('pointercancel', () => {
    isTrackingHexDrag = false;
    clearHover();
  });

  picker.addEventListener('pointerleave', () => {
    if (!isTrackingHexDrag) clearHover();
  });

  // Click on backdrop (outside the dialog's visible box) closes without selecting
  dialog.addEventListener('pointerdown', (e) => {
    if (!isPointInsideDialog(dialog, e.clientX, e.clientY)) {
      closeColorPicker();
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Reset state on native close (e.g. Esc key)
  dialog.addEventListener('close', () => {
    clearHover();
    clearSelected();
    isTrackingHexDrag = false;
  });
}

export {
  openColorPicker,
  closeColorPicker,
  updateGradientSwatchRing,
  getCustomColor,
  hasCustomColorSelected
};
