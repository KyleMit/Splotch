// Parent help modal with PWA installation and lock mode instructions
import { isSoundEnabled, setSoundEnabled } from './drawingSound.js';
import { isSaveOnDeleteEnabled, setSaveOnDeleteEnabled } from './saveOnDelete.js';
import { isScreenshotEnabled, setScreenshotEnabled } from './screenshot.js';
import { isUndoButtonEnabled, setUndoButtonEnabled } from './undoButton.js';
import {
  isStrokeWidthControlEnabled,
  setStrokeWidthControlEnabled
} from './strokeWidth.js';
import {
  isColoringBookEnabled,
  setColoringBookEnabled,
  setColoringBookButtonVisible,
  clearOverlay as clearColoringOverlay
} from './coloringBook.js';
import {
  setUndoButtonVisible,
  setScreenshotButtonVisible,
  setStrokeWidthButtonVisible
} from './actionsPanel.js';

let helpButton, helpModal, soundToggle, saveOnDeleteToggle, undoToggle, screenshotToggle, strokeWidthToggle, coloringBookToggle;

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

function isPWAInstalled() {
  // Check various display modes (PWA installed)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;

  // iOS Safari specific check
  const isIOSStandalone = window.navigator.standalone === true;

  // Check if not running in a regular browser window
  const isDisplayMode = isStandalone || isFullscreen || isMinimalUI || isIOSStandalone;

  // Debug logging
  if (isDisplayMode) {
    console.log('PWA Detected:', {
      standalone: isStandalone,
      fullscreen: isFullscreen,
      minimalUI: isMinimalUI,
      iosStandalone: isIOSStandalone
    });
  }

  return isDisplayMode;
}

function updateInstallStatus() {
  if (isPWAInstalled()) {
    // Show checkmarks on both iOS and Android install sections
    const checkmarks = helpModal.querySelectorAll('.install-check');
    checkmarks.forEach(check => {
      check.hidden = false;
    });
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

function updateSoundToggle() {
  const enabled = isSoundEnabled();
  soundToggle.classList.toggle('active', enabled);
  soundToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

function toggleSound() {
  const enabled = isSoundEnabled();
  setSoundEnabled(!enabled);
  updateSoundToggle();
}

function updateSaveOnDeleteToggle() {
  const enabled = isSaveOnDeleteEnabled();
  saveOnDeleteToggle.classList.toggle('active', enabled);
  saveOnDeleteToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

function toggleSaveOnDelete() {
  setSaveOnDeleteEnabled(!isSaveOnDeleteEnabled());
  updateSaveOnDeleteToggle();
}

function updateUndoToggle() {
  const enabled = isUndoButtonEnabled();
  undoToggle.classList.toggle('active', enabled);
  undoToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

function toggleUndo() {
  const enabled = !isUndoButtonEnabled();
  setUndoButtonEnabled(enabled);
  updateUndoToggle();
  setUndoButtonVisible(enabled);
}

function updateScreenshotToggle() {
  const enabled = isScreenshotEnabled();
  screenshotToggle.classList.toggle('active', enabled);
  screenshotToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

function toggleScreenshot() {
  const enabled = !isScreenshotEnabled();
  setScreenshotEnabled(enabled);
  updateScreenshotToggle();
  setScreenshotButtonVisible(enabled);
}

function updateStrokeWidthToggle() {
  const enabled = isStrokeWidthControlEnabled();
  strokeWidthToggle.classList.toggle('active', enabled);
  strokeWidthToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

function toggleStrokeWidthControl() {
  const enabled = !isStrokeWidthControlEnabled();
  setStrokeWidthControlEnabled(enabled);
  updateStrokeWidthToggle();
  setStrokeWidthButtonVisible(enabled);
}

function updateColoringBookToggle() {
  const enabled = isColoringBookEnabled();
  coloringBookToggle.classList.toggle('active', enabled);
  coloringBookToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

function toggleColoringBook() {
  const enabled = !isColoringBookEnabled();
  setColoringBookEnabled(enabled);
  updateColoringBookToggle();
  setColoringBookButtonVisible(enabled);
  if (!enabled) clearColoringOverlay();
}

function openHelpModal() {
  // Detect OS and select appropriate tab
  const os = detectOS();
  switchTab(os);

  // Update install status
  updateInstallStatus();

  // Update sound toggle state
  updateSoundToggle();
  updateSaveOnDeleteToggle();
  updateUndoToggle();
  updateScreenshotToggle();
  updateStrokeWidthToggle();
  updateColoringBookToggle();

  // Anchor the open animation to the help button so the modal
  // appears to fly out from the button that triggered it.
  if (helpButton) {
    const rect = helpButton.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    helpModal.style.setProperty('--origin-x', `${cx - window.innerWidth / 2}px`);
    helpModal.style.setProperty('--origin-y', `${cy - window.innerHeight / 2}px`);
  }

  // Show modal using native dialog method
  helpModal.showModal();
}

function closeHelpModal() {
  helpModal.close();
}

export function initParentHelp() {
  // Get references to existing elements
  helpButton = document.getElementById('parentHelpButton');
  helpModal = document.getElementById('parentHelpModal');
  soundToggle = document.getElementById('soundToggle');
  saveOnDeleteToggle = document.getElementById('saveOnDeleteToggle');
  undoToggle = document.getElementById('undoToggle');
  screenshotToggle = document.getElementById('screenshotToggle');
  strokeWidthToggle = document.getElementById('strokeWidthToggle');
  coloringBookToggle = document.getElementById('coloringBookToggle');

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

  // Add sound toggle handler
  soundToggle.addEventListener('click', toggleSound);
  saveOnDeleteToggle.addEventListener('click', toggleSaveOnDelete);
  undoToggle.addEventListener('click', toggleUndo);
  screenshotToggle.addEventListener('click', toggleScreenshot);
  strokeWidthToggle.addEventListener('click', toggleStrokeWidthControl);
  coloringBookToggle.addEventListener('click', toggleColoringBook);

  // Initialize toggle states
  updateSoundToggle();
  updateSaveOnDeleteToggle();
  updateUndoToggle();
  updateScreenshotToggle();
  updateStrokeWidthToggle();
  updateColoringBookToggle();

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
}
