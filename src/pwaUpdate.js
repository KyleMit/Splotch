// PWA update management
// Handles automatic updates for installed PWAs

let updateCheckInterval = null;

export function initPWAUpdates() {
  // Only run in production builds with service worker
  if (import.meta.env.DEV) return;

  // Import the service worker registration
  if ('serviceWorker' in navigator) {
    // Check for updates immediately on load
    checkForUpdates();

    // Check for updates every hour (3600000ms)
    updateCheckInterval = setInterval(() => {
      checkForUpdates();
    }, 60 * 60 * 1000);

    // Check for updates when app becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    });

    // Check for updates when app regains focus
    window.addEventListener('focus', () => {
      checkForUpdates();
    });
  }
}

async function checkForUpdates() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();

    if (!registration) {
      console.log('No service worker registered');
      return;
    }

    // Check for updates
    await registration.update();

    // If there's a waiting service worker, activate it
    if (registration.waiting) {
      console.log('New version available, updating...');

      // Tell the waiting service worker to activate immediately
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // Listen for the controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Reload the page to get the new version
        console.log('Reloading for new version...');
        window.location.reload();
      }, { once: true });
    } else {
      console.log('App is up to date');
    }
  } catch (error) {
    // Silently fail if offline or network error
    // This is expected and normal when offline
    console.log('Update check failed (likely offline):', error.message);
  }
}

// Clean up interval on page unload
window.addEventListener('beforeunload', () => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }
});
