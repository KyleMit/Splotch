// The browser's `online` event, which shipping's coloring downloader also retries on.
export function subscribeNetworkReturn(listener: () => void): () => void {
  window.addEventListener('online', listener);
  return () => window.removeEventListener('online', listener);
}
