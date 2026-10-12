// Request on the first pointerup because the pointer/activation rule in
// .claude/rules/svelte.md and the HTML specification's activation-triggering
// events make it the first pointer event with transient activation for touch
// and pen. Re-request when the page becomes visible again because the system
// can release the sentinel while hidden, e.g. backgrounding the tab.
export function installWakeLock(): () => void {
  let wakeLock: WakeLockSentinel | null = null;
  let pendingRequest = false;
  let hasInteracted = false;
  let disposed = false;

  function hasLiveLock(): boolean {
    return wakeLock !== null && !wakeLock.released;
  }

  async function requestWakeLock() {
    if (disposed || pendingRequest || hasLiveLock()) return;
    pendingRequest = true;
    try {
      if ('wakeLock' in navigator) {
        const sentinel = await navigator.wakeLock.request('screen');
        // Teardown can land while this request is in flight, and it can only
        // release what it can see — so a sentinel arriving after disposal
        // releases itself rather than being stored where nothing will.
        if (disposed) void sentinel.release().catch(() => {});
        else wakeLock = sentinel;
      }
    } catch {
    } finally {
      pendingRequest = false;
    }
  }
  const onPointerUp = () => {
    hasInteracted = true;
    if (hasLiveLock()) return;
    void requestWakeLock();
  };
  const onVisibilityChange = () => {
    if (hasInteracted && !hasLiveLock() && document.visibilityState === 'visible') {
      void requestWakeLock();
    }
  };
  document.addEventListener('pointerup', onPointerUp, { capture: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    disposed = true;
    document.removeEventListener('pointerup', onPointerUp, { capture: true });
    document.removeEventListener('visibilitychange', onVisibilityChange);
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  };
}
