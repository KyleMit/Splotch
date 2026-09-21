// The app registers its worker a few strokes into a first visit, and the install
// then precaches the whole build inside the measured window. A function body that
// answers 'blocked' or 'unsupported' (an insecure origin has no serviceWorker).
export const SERVICE_WORKER_REGISTRATION_GUARD_SOURCE = `
    if (!('serviceWorker' in navigator)) return 'unsupported';
    Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true,
      value: () => Promise.resolve(undefined)
    });
    return 'blocked';
  `;
