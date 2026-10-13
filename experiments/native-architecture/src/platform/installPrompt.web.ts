import {
  APP_LIKE_DISPLAY_MODE_QUERIES,
  createInstallPrompt,
  type DeferredInstallPrompt,
  type InstallPromptOwner,
  type InstallStorage,
} from '../install/installPolicy';

type InstallPromptEvent = Event & DeferredInstallPrompt;

// Storage can be blocked or full; the prompt then behaves as on a first visit.
const browserStorage: InstallStorage = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event;
}

function launchedAsApp() {
  return (
    APP_LIKE_DISPLAY_MODE_QUERIES.some((query) => window.matchMedia?.(query).matches === true) ||
    ('standalone' in navigator && navigator.standalone === true)
  );
}

function createBrowserInstallPrompt() {
  const owner = createInstallPrompt({
    device: {
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      maxTouchPoints: navigator.maxTouchPoints || 0,
      standalone: launchedAsApp(),
    },
    storage: browserStorage,
  });
  // beforeinstallprompt fires once and can precede the first render, so the
  // listeners attach when this module loads rather than when the banner mounts.
  window.addEventListener('beforeinstallprompt', (event) => {
    if (isInstallPromptEvent(event)) owner.capture(event);
  });
  window.addEventListener('appinstalled', owner.markInstalled);
  return owner;
}

export const installPrompt: InstallPromptOwner | null = createBrowserInstallPrompt();
