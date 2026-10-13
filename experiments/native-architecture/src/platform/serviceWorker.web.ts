import { SERVICE_WORKER_PATH } from './serviceWorkerPath';

// The development server serves no worker, and a worker left over from a production
// export would answer its navigations, so only a production bundle registers one.
// Registration waits for the load event so precaching never competes with first paint.
export function registerServiceWorker() {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch((error: unknown) => {
      console.warn('Offline support is unavailable.', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
