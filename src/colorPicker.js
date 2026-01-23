// Curated color palette organized by families (9 colors each for max grid width)
// Display order: red, orange, yellow, green, blue, purple, pink, brown, gray
// Priority for dropping when space limited: drop grays first, then browns, then oranges
const COLOR_FAMILIES = [
  {
    name: 'reds',
    priority: 1, // Always keep
    colors: [
      '#FFB3C1', '#FF8FA3', '#FF6B6B', '#EE5A6F', '#E63946', '#D62828', '#C1121F', '#9D0208', '#6A040F'
    ]
  },
  {
    name: 'oranges',
    priority: 7, // Drop third if space limited
    colors: [
      '#FFAC81', '#FFA07A', '#FF9E00', '#FF8C42', '#FB8500', '#F77F00', '#E85D3B', '#D36135', '#C34A36'
    ]
  },
  {
    name: 'yellows',
    priority: 2, // Always keep
    colors: [
      '#FFEA00', '#FFE66D', '#FFD60A', '#FFC300', '#FFB703', '#FFAA00', '#F9C74F', '#F9B44A', '#F9844A'
    ]
  },
  {
    name: 'greens',
    priority: 3, // Always keep
    colors: [
      '#AED581', '#8FD694', '#73E2A7', '#52B788', '#2ECC71', '#10B981', '#00B894', '#2D6A4F', '#1B5E3F'
    ]
  },
  {
    name: 'blues',
    priority: 4, // Always keep
    colors: [
      '#90CAF9', '#64B5F6', '#4CC9F0', '#42A5F5', '#2196F3', '#0096C7', '#0077B6', '#023E8A', '#03045E'
    ]
  },
  {
    name: 'purples',
    priority: 5, // Always keep
    colors: [
      '#E0AAFF', '#D8A7FF', '#C77DFF', '#B565D8', '#9D4EDD', '#9B59B6', '#8E44AD', '#7209B7', '#5A189A'
    ]
  },
  {
    name: 'pinks',
    priority: 6, // Always keep
    colors: [
      '#FFB3D9', '#FF8AC7', '#FF4081', '#FF006E', '#F06292', '#E91E63', '#D81B60', '#C2185B', '#AD1457'
    ]
  },
  {
    name: 'browns',
    priority: 8, // Drop second if space limited
    colors: [
      '#BCAAA4', '#A1887F', '#8D6E63', '#795548', '#6D4C41', '#5D4037', '#4E342E', '#3E2723', '#2C1810'
    ]
  },
  {
    name: 'grays',
    priority: 9, // Drop first if space limited
    colors: [
      '#ffffff', '#90A4AE', '#78909C', '#607D8B', '#546E7A', '#455A64', '#37474F', '#263238', '#1A1F24'
    ]
  }
];

// Select evenly distributed colors from an array
function selectDistributedColors(colors, count) {
  if (count >= colors.length) return colors;
  if (count === 1) return [colors[0]];
  if (count === 2) return [colors[0], colors[colors.length - 1]];

  const selected = [];
  const step = (colors.length - 1) / (count - 1);

  for (let i = 0; i < count; i++) {
    const index = Math.round(i * step);
    selected.push(colors[index]);
  }

  return selected;
}

// Select colors intelligently based on available grid space
function selectColorsForGrid(columns, rows) {
  const totalSlots = columns * rows;

  // Calculate total colors needed if we include all families
  const totalColors = COLOR_FAMILIES.reduce((sum, family) =>
    sum + Math.min(family.colors.length, columns), 0
  );

  // If we have space for all color families, use display order
  if (totalSlots >= totalColors) {
    const selectedColors = [];
    for (const family of COLOR_FAMILIES) {
      const colorsToTake = Math.min(family.colors.length, columns);
      // Use distributed selection to evenly space colors across spectrum
      selectedColors.push(...selectDistributedColors(family.colors, colorsToTake));
    }
    return selectedColors;
  }

  // Not enough space - use priority order to decide what to drop
  const sortedFamilies = [...COLOR_FAMILIES].sort((a, b) => a.priority - b.priority);
  const selectedColors = [];
  let remainingSlots = totalSlots;

  for (const family of sortedFamilies) {
    if (remainingSlots <= 0) break;

    // Take up to a full row from this family (or all colors if fewer than a row)
    const colorsToTake = Math.min(family.colors.length, columns, remainingSlots);

    // Use distributed selection to evenly space colors across spectrum
    selectedColors.push(...selectDistributedColors(family.colors, colorsToTake));
    remainingSlots -= colorsToTake;
  }

  return selectedColors;
}

// Hexagon generation functions
function generateHexagonPath(centerX, centerY, size) {
  const points = [];
  // Start at 30 degrees (Math.PI/6) for flat-top hexagons
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + (Math.PI / 6); // 60 degrees apart, offset by 30
    const x = centerX + size * Math.cos(angle);
    const y = centerY + size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return `M ${points.join(' L ')} Z`;
}

function createHexagonGrid(containerWidth, maxHeight) {
  const hexSize = 26; // Radius of hexagon (distance from center to corner) - slightly smaller

  // For flat-top hexagons
  const hexWidth = hexSize * Math.sqrt(3); // Flat edge to flat edge
  const hexHeight = hexSize * 2; // Point to point

  // Add small gap between hexagons for stroke visibility
  const gap = 3; // Small gap to prevent stroke overlap
  const horizontalSpacing = hexWidth + gap; // Distance between centers in same row
  const verticalSpacing = hexHeight * 0.75 + gap; // Distance between row centers
  const rowOffset = hexWidth / 2; // Odd rows shift by half width for nesting

  const padding = 10;

  // Calculate columns that will actually fit, accounting for row offset
  // Need to fit: padding + hexWidth/2 + (columns-1) * horizontalSpacing + hexWidth/2 + rowOffset + padding
  // Simplified: Need to account for the widest row (odd rows) which includes the offset
  const availableWidth = containerWidth - (padding * 2);
  const widthForOddRow = availableWidth - rowOffset; // Odd rows are offset and need less space
  const columns = Math.max(Math.floor(widthForOddRow / horizontalSpacing), 3); // Minimum 3 columns

  // Calculate maximum rows that can fit in the available height
  const maxRows = Math.floor((maxHeight - hexHeight - padding * 2) / verticalSpacing) + 1;

  // Calculate actual rows needed based on available color families
  // Maximum possible with all families
  const totalAvailableColors = COLOR_FAMILIES.reduce((sum, family) => sum + family.colors.length, 0);
  const maxPossibleRows = Math.ceil(totalAvailableColors / columns);
  const rows = Math.min(maxRows, maxPossibleRows);

  // Select colors intelligently based on available space
  const colorsToRender = selectColorsForGrid(columns, rows);

  // Calculate actual SVG dimensions based on content (tight fit)
  const svgWidth = Math.min(containerWidth, (columns - 1) * horizontalSpacing + hexWidth + rowOffset + padding * 2);
  const svgHeight = (rows - 1) * verticalSpacing + hexHeight + padding;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', svgWidth);
  svg.setAttribute('height', svgHeight);
  svg.style.display = 'block';
  svg.style.margin = '0 auto';

  let colorIndex = 0;
  for (let row = 0; row < rows && colorIndex < colorsToRender.length; row++) {
    for (let col = 0; col < columns && colorIndex < colorsToRender.length; col++) {
      // Offset odd rows by half the horizontal spacing for interlocking
      const offsetX = row % 2 === 1 ? rowOffset : 0;
      const centerX = col * horizontalSpacing + hexWidth / 2 + 5 + offsetX;
      const centerY = row * verticalSpacing + hexSize + 5;

      const hexPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hexPath.setAttribute('d', generateHexagonPath(centerX, centerY, hexSize));
      hexPath.setAttribute('fill', colorsToRender[colorIndex]);
      hexPath.setAttribute('stroke', '#ccc');
      hexPath.setAttribute('stroke-width', '1.5');
      hexPath.setAttribute('stroke-linejoin', 'round');
      hexPath.setAttribute('vector-effect', 'non-scaling-stroke');
      hexPath.classList.add('hexagon');
      hexPath.dataset.color = colorsToRender[colorIndex];

      svg.appendChild(hexPath);
      colorIndex++;
    }
  }

  return svg;
}

// Color picker state
let customColor = '#AB71E1'; // Default purple
let customColorSelected = false; // Track if user chose a custom color
let currentHoveredHex = null; // Track currently hovered hexagon
let currentSelectedHex = null; // Track currently selected hexagon
let colorPickerOverlay, colorPickerContainer, hexagonGrid;
let onColorSelectedCallback = null;

// Color picker functions
function openColorPicker() {
  if (colorPickerOverlay) {
    colorPickerOverlay.classList.add('visible');

    // Find and highlight the currently selected color
    if (customColor && hexagonGrid) {
      const hexagons = hexagonGrid.querySelectorAll('.hexagon');
      hexagons.forEach(hex => {
        // Normalize colors for comparison (lowercase)
        if (hex.dataset.color.toLowerCase() === customColor.toLowerCase()) {
          currentSelectedHex = hex;
          hex.classList.add('selected');
        }
      });
    }
  }
}

function closeColorPicker(selectedColor = null) {
  if (colorPickerOverlay) {
    colorPickerOverlay.classList.remove('visible');

    // Clear any hover state
    if (currentHoveredHex) {
      currentHoveredHex.classList.remove('hover');
      currentHoveredHex = null;
    }

    // Clear any selected state
    if (currentSelectedHex) {
      currentSelectedHex.classList.remove('selected');
      currentSelectedHex = null;
    }

    // Update custom color if one was selected
    if (selectedColor) {
      customColor = selectedColor;
      customColorSelected = true;

      // Notify callback
      if (onColorSelectedCallback) {
        onColorSelectedCallback(selectedColor);
      }
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

// Initialize color picker
export function initColorPicker(onColorSelected) {
  onColorSelectedCallback = onColorSelected;

  // Create Color Picker Modal (assign to existing variables)
  colorPickerOverlay = document.createElement('div');
  colorPickerOverlay.className = 'color-picker-overlay';

  colorPickerContainer = document.createElement('div');
  colorPickerContainer.className = 'color-picker-container';

  hexagonGrid = document.createElement('div');
  hexagonGrid.className = 'hexagon-grid';

  // Generate hexagon grid with curated colors
  // Calculate available space based on viewport
  const isPortraitMode = window.matchMedia('(orientation: portrait)').matches;
  const modalMaxHeight = isPortraitMode ? window.innerHeight * 0.75 : window.innerHeight * 0.8;
  const modalMaxWidth = isPortraitMode ? window.innerWidth * 0.95 : window.innerWidth * 0.9;

  // Account for container padding (20px) and grid padding (10px) on both sides
  const gridMaxHeight = modalMaxHeight - 60;
  let gridMaxWidth = modalMaxWidth - 60;

  // Limit width to maximum of 9 hexagons (prevents grid from getting too large on wide screens)
  const maxGridWidth = 450; // ~9 hexagons wide
  gridMaxWidth = Math.min(gridMaxWidth, maxGridWidth);

  const hexagonSVG = createHexagonGrid(gridMaxWidth, gridMaxHeight);
  hexagonGrid.appendChild(hexagonSVG);

  colorPickerContainer.appendChild(hexagonGrid);
  colorPickerOverlay.appendChild(colorPickerContainer);
  document.body.appendChild(colorPickerOverlay);

  // Hexagon grid interaction handlers
  let isTrackingHexDrag = false;

  hexagonGrid.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (target.classList.contains('hexagon')) {
      isTrackingHexDrag = true;

      // Clear previous hover
      if (currentHoveredHex) {
        currentHoveredHex.classList.remove('hover');
      }

      // Add hover to current
      currentHoveredHex = target;
      target.classList.add('hover');

      e.preventDefault();
      e.stopPropagation();
    }
  });

  hexagonGrid.addEventListener('pointermove', (e) => {
    if (!isTrackingHexDrag) return;

    // Find element under pointer
    const element = document.elementFromPoint(e.clientX, e.clientY);

    if (element && element.classList.contains('hexagon') && element !== currentHoveredHex) {
      // Clear previous hover
      if (currentHoveredHex) {
        currentHoveredHex.classList.remove('hover');
      }

      // Add hover to new element
      currentHoveredHex = element;
      element.classList.add('hover');
    } else if (!element || !element.classList.contains('hexagon')) {
      // Pointer moved outside hexagons - clear hover state
      if (currentHoveredHex) {
        currentHoveredHex.classList.remove('hover');
        currentHoveredHex = null;
      }
    }

    e.preventDefault();
    e.stopPropagation();
  });

  hexagonGrid.addEventListener('pointerup', (e) => {
    if (!isTrackingHexDrag) return;

    isTrackingHexDrag = false;

    // Find element under pointer
    const element = document.elementFromPoint(e.clientX, e.clientY);

    if (element && element.classList.contains('hexagon')) {
      const selectedColor = element.dataset.color;
      closeColorPicker(selectedColor);
    }

    e.preventDefault();
    e.stopPropagation();
  });

  hexagonGrid.addEventListener('pointercancel', (e) => {
    isTrackingHexDrag = false;

    if (currentHoveredHex) {
      currentHoveredHex.classList.remove('hover');
      currentHoveredHex = null;
    }

    e.stopPropagation();
  });

  hexagonGrid.addEventListener('pointerleave', (e) => {
    // Clear hover state when pointer leaves the grid
    if (currentHoveredHex) {
      currentHoveredHex.classList.remove('hover');
      currentHoveredHex = null;
    }
  });

  // Close picker when clicking outside the container
  colorPickerOverlay.addEventListener('pointerdown', (e) => {
    if (e.target === colorPickerOverlay) {
      closeColorPicker(); // Close without selecting
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Prevent container clicks from closing
  colorPickerContainer.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

export {
  openColorPicker,
  closeColorPicker,
  updateGradientSwatchRing,
  getCustomColor,
  hasCustomColorSelected
};
