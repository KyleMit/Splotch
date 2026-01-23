// Parent help modal with PWA installation and lock mode instructions

let helpButton, helpModal;

function detectOS() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;

  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'ios';
  } else if (/android/i.test(userAgent)) {
    return 'android';
  } else {
    return 'ios'; // Default to iOS
  }
}

function switchTab(tabName) {
  // Update tab buttons
  const tabButtons = helpModal.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab content
  const tabContents = helpModal.querySelectorAll('.tab-content');
  tabContents.forEach(content => {
    if (content.dataset.tab === tabName) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

function openHelpModal() {
  // Detect OS and select appropriate tab
  const os = detectOS();
  switchTab(os);

  // Show modal using native dialog method
  helpModal.showModal();
}

function closeHelpModal() {
  helpModal.close();
}

function updateButtonPosition() {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;

  if (isPortrait) {
    // Portrait: color palette is at top, button stays in corner
    helpButton.style.left = '0';
  } else {
    // Landscape: color palette is on left, position button based on palette width
    const colorPalette = document.querySelector('.color-palette');
    if (colorPalette) {
      const paletteWidth = colorPalette.offsetWidth;
      // Add 8px margin from palette edge
      helpButton.style.left = `${paletteWidth + 8}px`;
    }
  }
}

export function initParentHelp() {
  // Get references to existing elements
  helpButton = document.getElementById('parentHelpButton');
  helpModal = document.getElementById('parentHelpModal');

  // Add click handlers
  helpButton.addEventListener('click', openHelpModal);

  // Add tab click handlers
  const tabButtons = helpModal.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Add close handler for close button
  const closeButton = helpModal.querySelector('.parent-help-close');
  closeButton.addEventListener('click', closeHelpModal);

  // Close dialog when clicking on backdrop
  helpModal.addEventListener('click', (e) => {
    const rect = helpModal.getBoundingClientRect();
    const isInDialog = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
    if (!isInDialog) {
      closeHelpModal();
    }
  });

  // Update button position on load and resize
  updateButtonPosition();
  window.addEventListener('resize', updateButtonPosition);
  window.addEventListener('orientationchange', updateButtonPosition);
}
