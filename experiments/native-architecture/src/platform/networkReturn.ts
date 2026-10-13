// React Native reports no connectivity change without a network module; the app's return to the
// foreground is the retry signal there.
export function subscribeNetworkReturn(_listener: () => void): () => void {
  return () => {};
}
