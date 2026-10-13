// The browser's `online` event and, where the Network Information API exists, its connection
// `change` (a move from mobile data to Wi-Fi stays online), which shipping's coloring downloader
// also retries on.
export function subscribeNetworkReturn(listener: () => void): () => void {
  const connection: unknown = Reflect.get(navigator, 'connection');
  const network = connection instanceof EventTarget ? connection : null;
  window.addEventListener('online', listener);
  network?.addEventListener('change', listener);
  return () => {
    window.removeEventListener('online', listener);
    network?.removeEventListener('change', listener);
  };
}
