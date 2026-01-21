// Version Badge display and toggle functionality

export function initVersionBadge(releaseAllPointers) {
  const versionElement = document.getElementById('versionBadge');
  const VERSION_VISIBLE_KEY = 'splotch_version_visible';

  // Initialize Version Badge display
  function initializeVersion() {
    // Set version text (injected by Vite at build time)
    versionElement.textContent = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

    // Check localStorage for visibility preference (default: hidden)
    const isVisible = localStorage.getItem(VERSION_VISIBLE_KEY) === 'true';
    if (!isVisible) {
      versionElement.classList.add('hidden');
    }
  }

  // Toggle visibility with 5 rapid taps
  let tapCount = 0;
  let tapTimer = null;

  versionElement.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Release any drawing pointers
    releaseAllPointers();
  });

  versionElement.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();

    tapCount++;

    // Reset counter after 1.5 seconds of no taps
    if (tapTimer) {
      clearTimeout(tapTimer);
    }

    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, 1500);

    // Toggle on 5 taps
    if (tapCount === 5) {
      const isCurrentlyHidden = versionElement.classList.contains('hidden');

      if (isCurrentlyHidden) {
        versionElement.classList.remove('hidden');
        localStorage.setItem(VERSION_VISIBLE_KEY, 'true');
      } else {
        versionElement.classList.add('hidden');
        localStorage.setItem(VERSION_VISIBLE_KEY, 'false');
      }

      tapCount = 0;
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
      }
    }
  });

  initializeVersion();
}
