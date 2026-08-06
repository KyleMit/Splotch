// Wake lock to prevent screen sleep — request on first pointerdown, and
// re-request when the page becomes visible again.
export function installWakeLock(): () => void {
  let wakeLock: WakeLockSentinel | null = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {}
  }
  const onPointerDown = () => {
    if (wakeLock !== null) return;
    void requestWakeLock();
  };
  const onVisibilityChange = () => {
    if (wakeLock === null && document.visibilityState === 'visible') {
      void requestWakeLock();
    }
  };
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  };
}
