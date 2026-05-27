// PWA update management
// Handles automatic updates for installed PWAs

let updateCheckInterval = null;

export function initPWAUpdates() {
  // Only run in production builds with service worker
  if (import.meta.env.DEV) return;

  // Import the service worker registration
  if ('serviceWorker' in navigator) {
    // Set up update listener on the registration
    navigator.serviceWorker.ready.then(registration => {
      // Listen for updates found
      registration.addEventListener('updatefound', () => {
        console.log('Update found, installing...');
        // The checkForUpdates function will handle this via statechange listener
      });
    });

    // Check for updates immediately on load
    checkForUpdates();

    // Check for updates every hour (3600000ms)
    updateCheckInterval = setInterval(() => {
      checkForUpdates();
    }, 60 * 60 * 1000);

    // Check for updates when app becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('App visible, checking for updates...');
        checkForUpdates();
      }
    });

    // Check for updates when app regains focus
    window.addEventListener('focus', () => {
      console.log('App focused, checking for updates...');
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

    // Helper function to activate waiting service worker
    const activateWaitingSW = (sw) => {
      console.log('New version available, updating...');

      // Tell the waiting service worker to activate immediately
      sw.postMessage({ type: 'SKIP_WAITING' });

      // Listen for the controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Reload the page to get the new version
        console.log('Reloading for new version...');
        window.location.reload();
      }, { once: true });
    };

    // If there's already a waiting service worker, activate it
    if (registration.waiting) {
      activateWaitingSW(registration.waiting);
      return;
    }

    // If there's an installing service worker, wait for it to become waiting
    if (registration.installing) {
      console.log('New version installing...');
      registration.installing.addEventListener('statechange', function() {
        if (this.state === 'installed' && registration.waiting) {
          // Give it a moment to settle
          setTimeout(() => {
            if (registration.waiting) {
              activateWaitingSW(registration.waiting);
            }
          }, 100);
        }
      });
      return;
    }

    console.log('App is up to date');
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
