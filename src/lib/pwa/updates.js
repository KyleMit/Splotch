// PWA auto-update lifecycle: checks for an updated service worker on load,
// hourly, on visibility change, and on focus.

let updateCheckInterval = null;

export function initPWAUpdates() {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      console.log('Update found, installing...');
    });
  });

  checkForUpdates();

  updateCheckInterval = setInterval(() => {
    checkForUpdates();
  }, 60 * 60 * 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });

  window.addEventListener('focus', () => {
    checkForUpdates();
  });

  window.addEventListener('beforeunload', () => {
    if (updateCheckInterval) clearInterval(updateCheckInterval);
  });
}

async function checkForUpdates() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    await registration.update();

    const activateWaitingSW = (sw) => {
      sw.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => window.location.reload(),
        { once: true }
      );
    };

    if (registration.waiting) {
      activateWaitingSW(registration.waiting);
      return;
    }

    if (registration.installing) {
      registration.installing.addEventListener('statechange', function () {
        if (this.state === 'installed' && registration.waiting) {
          setTimeout(() => {
            if (registration.waiting) activateWaitingSW(registration.waiting);
          }, 100);
        }
      });
    }
  } catch (error) {
    console.log('Update check failed:', error.message);
  }
}
